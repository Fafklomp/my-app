/**
 * Edge Function: store-google-photo
 *
 * Downloads a photo from a Google Photos Picker API baseUrl (authenticated)
 * and stores it permanently in Supabase Storage, then inserts a newsletter_photos row.
 *
 * Picker API baseUrls require an Authorization header — they are NOT public URLs.
 * This function reads google_photos_access_token from user_oauth_tokens and uses
 * it to authenticate the download.
 *
 * Receives:  { base_url, filename, newsletter_version_id }
 * Returns:   { photo: { id, storage_path, sort_order } }
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *
 * Deploy:
 *   npx supabase functions deploy store-google-photo --no-verify-jwt
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GOOGLE_CLIENT_ID      = Deno.env.get("GOOGLE_CLIENT_ID")!
const GOOGLE_CLIENT_SECRET  = Deno.env.get("GOOGLE_CLIENT_SECRET")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const BUCKET = "newsletter-photos"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
}

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
      throw new Error(`Token refresh failed: ${await refreshRes.text()}`)
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })

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

    // ── Parse request ─────────────────────────────────────────
    const { base_url, filename, newsletter_version_id, taken_at, camera_info } = await req.json()
    if (!base_url || !newsletter_version_id) {
      return json({ error: "base_url and newsletter_version_id are required" }, 400)
    }

    const safeFilename = filename ?? "photo.jpg"
    console.log(`Storing photo: ${safeFilename} for version ${newsletter_version_id}`)

    // ── Verify the version belongs to this user ───────────────
    const { data: version } = await db
      .from("newsletter_versions")
      .select("id, newsletter_id")
      .eq("id", newsletter_version_id)
      .single()
    if (!version) return json({ error: "Version not found" }, 404)

    const { data: newsletter } = await db
      .from("newsletters")
      .select("user_id")
      .eq("id", version.newsletter_id)
      .single()
    if (!newsletter || newsletter.user_id !== user.id) {
      return json({ error: "Unauthorized" }, 401)
    }

    // ── Get Photos access token for authenticated download ────
    const accessToken = await getPhotosAccessToken(db, user.id)
    console.log("Got Photos access token, prefix:", accessToken.substring(0, 15))

    // ── Download from Picker baseUrl ──────────────────────────
    // Picker API baseUrls require Bearer auth. Append size param for full-ish resolution.
    const downloadUrl = `${base_url}=w1600-h1200`
    console.log("Downloading photo...")
    const imgRes = await fetch(downloadUrl, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    })
    console.log("Download response status:", imgRes.status)

    if (!imgRes.ok) {
      const errText = await imgRes.text()
      console.error("Download failed:", errText)
      return json({ error: `Download failed (${imgRes.status})`, detail: errText }, 502)
    }

    const imgBlob     = await imgRes.blob()
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg"
    console.log(`Downloaded: ${imgBlob.size} bytes, type=${contentType}`)

    // ── Upload to Supabase Storage (service role client) ─────
    const ext = safeFilename.split(".").pop()?.toLowerCase() ?? "jpg"
    const storagePath = `${user.id}/${newsletter_version_id}/${Date.now()}-google.${ext}`
    console.log(`Uploading to storage path: ${storagePath}`)

    const { data: uploadData, error: uploadErr } = await db.storage
      .from(BUCKET)
      .upload(storagePath, imgBlob, { contentType, upsert: false })

    console.log("Upload result:", JSON.stringify({ data: uploadData, error: uploadErr }))

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr)
      return json({ error: "Storage upload failed", detail: uploadErr.message }, 500)
    }

    // ── Get public URL for the uploaded file ──────────────────
    const { data: urlData } = db.storage
      .from(BUCKET)
      .getPublicUrl(storagePath)

    const photoUrl = urlData.publicUrl
    console.log("Generated public URL:", photoUrl)

    // ── Get next sort_order ───────────────────────────────────
    const { data: maxRow } = await db
      .from("newsletter_photos")
      .select("sort_order")
      .eq("newsletter_version_id", newsletter_version_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextOrder = (maxRow?.sort_order ?? -1) + 1

    // ── Insert newsletter_photos row ──────────────────────────
    const { data: photoRow, error: insertErr } = await db
      .from("newsletter_photos")
      .insert({
        newsletter_version_id,
        storage_path: storagePath,
        photo_url:    photoUrl,
        caption:      null,
        sort_order:   nextOrder,
        taken_at:     taken_at    ?? null,
        camera_info:  camera_info ?? null,
      })
      .select("id, storage_path, sort_order")
      .single()

    if (insertErr || !photoRow) {
      console.error("Insert error:", insertErr)
      return json({ error: "Database insert failed", detail: insertErr?.message }, 500)
    }

    console.log(`Stored photo: ${photoRow.id} at ${storagePath}`)
    return json({ photo: photoRow })

  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    console.error("Unhandled error:", msg)
    if (msg === "GOOGLE_PHOTOS_NOT_CONNECTED") {
      return json({ error: "GOOGLE_PHOTOS_NOT_CONNECTED" }, 422)
    }
    return json({ error: "Internal server error", detail: msg }, 500)
  }
})
