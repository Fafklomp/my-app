/**
 * Edge Function: google-photos-auth
 *
 * Handles the manual Google OAuth flow for the Photos Library API,
 * because Supabase's built-in OAuth strips custom scopes.
 *
 * Actions (passed in request body):
 *   { action: 'get_auth_url' }
 *     → Returns the Google OAuth URL the frontend should redirect to.
 *
 *   { action: 'exchange_code', code: '...' }
 *     → Exchanges the authorization code for tokens and saves them to
 *       user_oauth_tokens (google_photos_access_token / refresh_token columns).
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_PHOTOS_REDIRECT_URI  — e.g. http://localhost:5173/auth/google-photos/callback
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *
 * Deploy:
 *   npx supabase functions deploy google-photos-auth --project-ref <ref> --no-verify-jwt
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GOOGLE_CLIENT_ID      = Deno.env.get("GOOGLE_CLIENT_ID")!
const GOOGLE_CLIENT_SECRET  = Deno.env.get("GOOGLE_CLIENT_SECRET")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// NOTE: photoslibrary.readonly was deprecated March 31 2025.
// The Picker API uses this scope instead:
const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://life-pulse-web.pages.dev",
  "https://fafklomp.dev",
])

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://fafklomp.dev"
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  }
}

serve(async (req) => {
  const cors = corsHeaders(req.headers.get("Origin"))

  const origin = req.headers.get("origin") || req.headers.get("referer") || "http://127.0.0.1:5173"
  const baseUrl = origin.includes("fafklomp.dev")
    ? "https://fafklomp.dev"
    : origin.includes("life-pulse-web.pages.dev")
      ? "https://life-pulse-web.pages.dev"
      : "http://127.0.0.1:5173"
  const redirectUri = `${baseUrl}/auth/google-photos/callback`

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: "Unauthorized" }, 401)

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── Parse body ────────────────────────────────────────────
    const body = await req.json()
    const { action } = body

    console.log(`google-photos-auth: action=${action}, user=${user.id}`)
    console.log(`redirectUri (dynamic): ${redirectUri}`)

    // ── Action: get_auth_url ──────────────────────────────────
    if (action === "get_auth_url") {
      const params = new URLSearchParams({
        client_id:     GOOGLE_CLIENT_ID,
        redirect_uri:  redirectUri,
        response_type: "code",
        scope:         PHOTOS_SCOPE,
        access_type:   "offline",
        prompt:        "consent",
        state:         user.id, // pass user_id so callback can identify the user
      })

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
      console.log("GOOGLE_CLIENT_ID (first 30 chars):", GOOGLE_CLIENT_ID?.slice(0, 30) ?? "NOT SET")
      console.log("redirectUri:", redirectUri)
      console.log("Full auth URL:", authUrl)
      return json({ auth_url: authUrl })
    }

    // ── Action: exchange_code ─────────────────────────────────
    if (action === "exchange_code") {
      const { code } = body
      if (!code) return json({ error: "code is required" }, 400)

      console.log("=== exchange_code: starting ===")
      console.log("Has GOOGLE_CLIENT_ID:", !!GOOGLE_CLIENT_ID, "first 20:", GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.slice(0, 20) : "NOT SET")
      console.log("Has GOOGLE_CLIENT_SECRET:", !!GOOGLE_CLIENT_SECRET)
      console.log("redirectUri:", redirectUri)
      console.log("Code length:", code ? code.length : 0, "first 10:", code ? code.slice(0, 10) : "N/A")

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri:  redirectUri,
          grant_type:    "authorization_code",
        }),
      })

      console.log("Token exchange HTTP status:", tokenRes.status)
      const tokenText = await tokenRes.text()
      console.log("Token exchange full response:", tokenText)

      if (!tokenRes.ok) {
        return json({ error: "Token exchange failed", detail: tokenText }, 502)
      }

      const tokenData = JSON.parse(tokenText)
      const access_token: string  = tokenData.access_token
      const refresh_token: string = tokenData.refresh_token
      const expires_in: number    = tokenData.expires_in

      if (!access_token) {
        return json({ error: "No access_token in response", detail: tokenText }, 502)
      }

      console.log("Got access_token:", access_token.slice(0, 10))
      console.log("Got refresh_token:", refresh_token ? "YES" : "NO")

      // Save tokens to the dedicated Photos columns
      const { error: upsertErr } = await db
        .from("user_oauth_tokens")
        .upsert(
          {
            user_id:                         user.id,
            google_photos_access_token:      access_token,
            google_photos_refresh_token:     refresh_token ?? null,
            google_photos_token_expires_at:  new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString(),
            updated_at:                      new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )

      if (upsertErr) {
        console.error("DB upsert error:", upsertErr)
        return json({ error: "Failed to save token", detail: upsertErr.message }, 500)
      }

      console.log("Google Photos token saved successfully for user:", user.id)
      return json({ success: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err) {
    console.error("Unhandled error:", err)
    return json({ error: "Internal server error", detail: String(err) }, 500)
  }
})
