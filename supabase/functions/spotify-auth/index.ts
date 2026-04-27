/**
 * Edge Function: spotify-auth
 *
 * Handles the Spotify OAuth flow and data fetching.
 * Follows the same pattern as google-photos-auth.
 *
 * Actions (passed in request body):
 *   { action: 'get_auth_url' }
 *     → Returns the Spotify OAuth URL the frontend should redirect to.
 *
 *   { action: 'exchange_code', code: '...' }
 *     → Exchanges the authorization code for tokens and saves them to
 *       user_oauth_tokens (spotify_* columns).
 *
 *   { action: 'fetch_top_items', month: '2026-04' }
 *     → Fetches top 5 tracks + top 3 artists from Spotify API,
 *       refreshing the token if needed, then upserts into spotify_monthly_data.
 *
 * Required env vars:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   SPOTIFY_REDIRECT_URI  — e.g. http://localhost:5173/callbacks/spotify
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *
 * Deploy:
 *   npx supabase functions deploy spotify-auth --no-verify-jwt --project-ref tocaemuhsttqmzztxzme
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SPOTIFY_CLIENT_ID     = Deno.env.get("SPOTIFY_CLIENT_ID")!
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!
const REDIRECT_URI          = Deno.env.get("SPOTIFY_REDIRECT_URI")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const SPOTIFY_SCOPE = "user-top-read"

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

function basicAuth() {
  return "Basic " + btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)
}

async function refreshSpotifyToken(db: ReturnType<typeof createClient>, userId: string, refreshToken: string) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": basicAuth(),
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token refresh failed: ${text}`)
  }

  const data = await res.json()
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()

  await db.from("user_oauth_tokens").update({
    spotify_access_token:     data.access_token,
    spotify_token_expires_at: expiresAt,
    // refresh_token is only returned when it rotates; keep the old one if absent
    ...(data.refresh_token ? { spotify_refresh_token: data.refresh_token } : {}),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId)

  return data.access_token as string
}

serve(async (req) => {
  const cors = corsHeaders(req.headers.get("Origin"))
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

    console.log(`spotify-auth: action=${action}, user=${user.id}`)

    // ── Action: get_auth_url ──────────────────────────────────
    if (action === "get_auth_url") {
      const state = crypto.randomUUID()

      const params = new URLSearchParams({
        client_id:     SPOTIFY_CLIENT_ID,
        response_type: "code",
        redirect_uri:  REDIRECT_URI,
        scope:         SPOTIFY_SCOPE,
        state,
      })

      const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`
      console.log("Spotify auth URL built. REDIRECT_URI:", REDIRECT_URI)
      return json({ url: authUrl })
    }

    // ── Action: exchange_code ─────────────────────────────────
    if (action === "exchange_code") {
      const { code } = body
      if (!code) return json({ error: "code is required" }, 400)

      console.log("exchange_code: exchanging authorization code")

      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type":  "application/x-www-form-urlencoded",
          "Authorization": basicAuth(),
        },
        body: new URLSearchParams({
          grant_type:   "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      })

      console.log("Spotify token exchange HTTP status:", tokenRes.status)
      const tokenText = await tokenRes.text()

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

      const { error: upsertErr } = await db
        .from("user_oauth_tokens")
        .upsert(
          {
            user_id:                  user.id,
            spotify_access_token:     access_token,
            spotify_refresh_token:    refresh_token ?? null,
            spotify_token_expires_at: new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString(),
            spotify_connected:        true,
            updated_at:               new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )

      if (upsertErr) {
        console.error("DB upsert error:", upsertErr)
        return json({ error: "Failed to save token", detail: upsertErr.message }, 500)
      }

      console.log("Spotify token saved for user:", user.id)
      return json({ success: true })
    }

    // ── Action: fetch_top_items ───────────────────────────────
    if (action === "fetch_top_items") {
      const { month } = body
      if (!month) return json({ error: "month is required" }, 400)

      // Load stored token
      const { data: tokenRow, error: tokenErr } = await db
        .from("user_oauth_tokens")
        .select("spotify_access_token, spotify_refresh_token, spotify_token_expires_at")
        .eq("user_id", user.id)
        .maybeSingle()

      if (tokenErr || !tokenRow?.spotify_access_token) {
        return json({ error: "Spotify not connected" }, 400)
      }

      // Refresh if expired (or expiring within 60s)
      let accessToken = tokenRow.spotify_access_token
      const expiresAt = tokenRow.spotify_token_expires_at
        ? new Date(tokenRow.spotify_token_expires_at).getTime()
        : 0

      if (Date.now() >= expiresAt - 60_000) {
        if (!tokenRow.spotify_refresh_token) {
          return json({ error: "Token expired and no refresh token available. Please reconnect Spotify." }, 401)
        }
        console.log("Token expired, refreshing…")
        accessToken = await refreshSpotifyToken(db, user.id, tokenRow.spotify_refresh_token)
      }

      const headers = { "Authorization": `Bearer ${accessToken}` }

      // Fetch top 5 tracks (short_term ≈ last 4 weeks)
      const tracksRes = await fetch(
        "https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5",
        { headers }
      )
      if (!tracksRes.ok) {
        const detail = await tracksRes.text()
        return json({ error: "Failed to fetch top tracks", detail }, 502)
      }
      const tracksData = await tracksRes.json()

      // Fetch top 3 artists (short_term)
      const artistsRes = await fetch(
        "https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=3",
        { headers }
      )
      if (!artistsRes.ok) {
        const detail = await artistsRes.text()
        return json({ error: "Failed to fetch top artists", detail }, 502)
      }
      const artistsData = await artistsRes.json()

      // Map tracks
      const top_tracks = (tracksData.items ?? []).map((t: any) => ({
        name:          t.name,
        artist:        t.artists?.[0]?.name ?? "",
        album:         t.album?.name ?? "",
        album_art_url: t.album?.images?.[0]?.url ?? null,
        spotify_url:   t.external_urls?.spotify ?? null,
        preview_url:   t.preview_url ?? null,
      }))

      // Map artists
      const top_artists = (artistsData.items ?? []).map((a: any) => ({
        name:        a.name,
        image_url:   a.images?.[0]?.url ?? null,
        genres:      (a.genres ?? []).slice(0, 3),
        spotify_url: a.external_urls?.spotify ?? null,
      }))

      // Upsert into spotify_monthly_data
      const { error: upsertErr } = await db
        .from("spotify_monthly_data")
        .upsert(
          {
            user_id:     user.id,
            month,
            top_tracks,
            top_artists,
            fetched_at:  new Date().toISOString(),
          },
          { onConflict: "user_id,month" }
        )

      if (upsertErr) {
        console.error("spotify_monthly_data upsert error:", upsertErr)
        return json({ error: "Failed to save music data", detail: upsertErr.message }, 500)
      }

      console.log(`Fetched ${top_tracks.length} tracks, ${top_artists.length} artists for ${user.id} / ${month}`)
      return json({ top_tracks, top_artists })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err) {
    console.error("Unhandled error:", err)
    return json({ error: "Internal server error", detail: String(err) }, 500)
  }
})
