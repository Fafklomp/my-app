/**
 * Edge Function: google-photos-picker
 *
 * Orchestrates the Google Photos Picker API flow.
 * The Picker API (photospicker.googleapis.com) replaces the deprecated
 * Library API (photoslibrary.googleapis.com, shut down March 31 2025).
 *
 * Required scope: https://www.googleapis.com/auth/photospicker.mediaitems.readonly
 * Required API: Enable "Google Photos Picker API" in Google Cloud Console →
 *               APIs & Services → Library → search "Google Photos Picker API"
 *
 * Actions:
 *   { action: 'create_session' }
 *     → Creates a picker session. Returns { sessionId, pickerUri }.
 *       Frontend opens pickerUri+'/autoclose' in a popup.
 *
 *   { action: 'poll_session', sessionId: '...' }
 *     → Checks if user finished selecting. Returns { mediaItemsSet: bool }.
 *
 *   { action: 'list_items', sessionId: '...' }
 *     → Returns the selected media items with baseUrls for download.
 *
 * Deploy:
 *   npx supabase functions deploy google-photos-picker --no-verify-jwt
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GOOGLE_CLIENT_ID      = Deno.env.get("GOOGLE_CLIENT_ID")!
const GOOGLE_CLIENT_SECRET  = Deno.env.get("GOOGLE_CLIENT_SECRET")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

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

// ── Shared: fetch a thumbnail and return as a base64 data URL ──
// Picker API baseUrls require Bearer auth, so we proxy through the Edge Function.
async function fetchThumbnailBase64(baseUrl: string, token: string, mimeType: string): Promise<string> {
  try {
    const res = await fetch(`${baseUrl}=w400-h300-c`, {
      headers: { "Authorization": `Bearer ${token}` },
    })
    if (!res.ok) return ""
    const buffer = await res.arrayBuffer()
    const bytes  = new Uint8Array(buffer)
    // Convert binary to base64 in chunks to avoid stack overflow on large images
    let binary = ""
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
    }
    return `data:${mimeType};base64,${btoa(binary)}`
  } catch {
    return ""
  }
}

// ── Shared: resolve a valid Photos access token ────────────────
async function getPhotosAccessToken(db: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data: tokenRow } = await db
    .from("user_oauth_tokens")
    .select("google_photos_access_token, google_photos_refresh_token, google_photos_token_expires_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (!tokenRow?.google_photos_access_token && !tokenRow?.google_photos_refresh_token) {
    throw new Error("GOOGLE_PHOTOS_NOT_CONNECTED")
  }

  let accessToken: string = tokenRow!.google_photos_access_token ?? ""
  const expiresAt    = tokenRow?.google_photos_token_expires_at ? new Date(tokenRow.google_photos_token_expires_at) : null
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 60_000

  if (needsRefresh) {
    if (!tokenRow?.google_photos_refresh_token) {
      throw new Error("Google Photos token expired. Please reconnect Google Photos.")
    }
    console.log("Refreshing Google Photos access token...")
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokenRow!.google_photos_refresh_token,
        grant_type:    "refresh_token",
      }),
    })
    if (!refreshRes.ok) {
      const errText = await refreshRes.text()
      throw new Error(`Token refresh failed: ${errText}`)
    }
    const refreshData = await refreshRes.json()
    accessToken = refreshData.access_token
    await db.from("user_oauth_tokens").update({
      google_photos_access_token:     accessToken,
      google_photos_token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
      updated_at:                     new Date().toISOString(),
    }).eq("user_id", userId)
    console.log("Token refreshed.")
  }

  return accessToken
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
    console.log(`google-photos-picker: action=${action}, user=${user.id}`)

    // ── Action: create_session ────────────────────────────────
    if (action === "create_session") {
      const accessToken = await getPhotosAccessToken(db, user.id)

      const res = await fetch("https://photospicker.googleapis.com/v1/sessions", {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({}),
      })

      console.log("create_session response status:", res.status)
      const resText = await res.text()
      console.log("create_session response:", resText)

      if (!res.ok) {
        return json({ error: `Failed to create picker session (${res.status})`, detail: resText }, 502)
      }

      const data = JSON.parse(resText)
      return json({
        sessionId:     data.id,
        pickerUri:     data.pickerUri,
        pollingConfig: data.pollingConfig ?? {},
      })
    }

    // ── Action: poll_session ──────────────────────────────────
    if (action === "poll_session") {
      const { sessionId } = body
      if (!sessionId) return json({ error: "sessionId is required" }, 400)

      const accessToken = await getPhotosAccessToken(db, user.id)

      const res = await fetch(`https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error("poll_session error:", res.status, errText)
        return json({ error: `Poll failed (${res.status})`, detail: errText }, 502)
      }

      const data = await res.json()
      console.log("poll_session mediaItemsSet:", data.mediaItemsSet)
      return json({ mediaItemsSet: data.mediaItemsSet ?? false })
    }

    // ── Action: list_items ────────────────────────────────────
    if (action === "list_items") {
      const { sessionId } = body
      if (!sessionId) return json({ error: "sessionId is required" }, 400)

      const accessToken = await getPhotosAccessToken(db, user.id)

      // Correct endpoint: sessionId is a query param, NOT a path segment.
      // See: https://developers.google.com/photos/picker/reference/rest/v1/mediaItems/list
      const url = `https://photospicker.googleapis.com/v1/mediaItems?sessionId=${encodeURIComponent(sessionId)}&pageSize=100`
      console.log("list_items URL:", url)

      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      })

      console.log("list_items response status:", res.status)
      const resText = await res.text()

      if (!res.ok) {
        console.error("list_items error:", resText)
        return json({ error: `Failed to list items (${res.status})`, detail: resText }, 502)
      }

      const data = JSON.parse(resText)
      const rawItems: any[] = data.mediaItems ?? []
      console.log(`list_items: ${rawItems.length} items returned`)

      const photoItems = rawItems.filter((item: any) => item.type !== "VIDEO")

      // Fetch all thumbnails in parallel — each is ~20-50 KB at w400-h300-c
      console.log(`Fetching ${photoItems.length} thumbnails in parallel...`)
      const thumbnailPromises = photoItems.map((item: any) =>
        item.mediaFile?.baseUrl
          ? fetchThumbnailBase64(
              item.mediaFile.baseUrl,
              accessToken,
              item.mediaFile.mimeType ?? "image/jpeg",
            )
          : Promise.resolve(""),
      )
      const thumbnails = await Promise.all(thumbnailPromises)
      console.log("Thumbnails fetched.")

      const photos = photoItems.map((item: any, i: number) => {
        const meta        = item.mediaFile?.mediaFileMetadata ?? {}
        const photoMeta   = meta.photo ?? {}
        const cameraMake  = photoMeta.cameraMake  ?? null
        const cameraModel = photoMeta.cameraModel ?? null
        // Combine into a human-readable string only if at least one part is present
        const cameraInfo  = [cameraMake, cameraModel].filter(Boolean).join(" ") || null

        return {
          picker_media_item_id: item.id,
          base_url:        item.mediaFile?.baseUrl ?? "",
          filename:        item.mediaFile?.filename ?? "photo.jpg",
          mime_type:       item.mediaFile?.mimeType ?? "image/jpeg",
          create_time:     item.createTime ?? null,
          width:           meta.width  ?? 0,
          height:          meta.height ?? 0,
          camera_info:     cameraInfo,
          thumbnail_base64: thumbnails[i],
        }
      })

      return json({ photos })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    console.error("Unhandled error:", msg)
    if (msg === "GOOGLE_PHOTOS_NOT_CONNECTED") {
      return json({ error: "GOOGLE_PHOTOS_NOT_CONNECTED" }, 422)
    }
    return json({ error: "Internal server error", detail: msg }, 500)
  }
})
