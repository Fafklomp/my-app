/**
 * Edge Function: fetch-google-photos
 *
 * Fetches photo metadata from Google Photos for a given month.
 * Capped at 100 photos (single API call) to stay well within the 60s timeout.
 *
 * Reads access token from the google_photos_access_token column in user_oauth_tokens,
 * refreshing via google_photos_refresh_token when needed.
 *
 * Deploy:
 *   npx supabase functions deploy fetch-google-photos --project-ref <ref> --no-verify-jwt
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GOOGLE_CLIENT_ID      = Deno.env.get("GOOGLE_CLIENT_ID")!
const GOOGLE_CLIENT_SECRET  = Deno.env.get("GOOGLE_CLIENT_SECRET")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

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

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

serve(async (req) => {
  console.log("=== fetch-google-photos: Function started ===")

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS })

  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization")
    console.log("Auth header present:", !!authHeader)
    if (!authHeader) return json({ error: "Unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    console.log("Auth result — user:", user?.id ?? "null", "| error:", authError?.message ?? "none")
    if (authError || !user) return json({ error: "Unauthorized" }, 401)

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── Parse request ─────────────────────────────────────────
    let month: number, year: number
    try {
      const body = await req.json()
      month = body.month
      year  = body.year
      console.log("Request body — month:", month, "year:", year)
    } catch (e) {
      console.error("Failed to parse request body:", e)
      return json({ error: "Invalid JSON body" }, 400)
    }

    if (!month || !year) return json({ error: "month and year are required" }, 400)

    // ── Resolve Google Photos access token ────────────────────
    const { data: tokenRow, error: tokenErr } = await db
      .from("user_oauth_tokens")
      .select("google_access_token, google_photos_access_token, google_photos_refresh_token, google_photos_token_expires_at")
      .eq("user_id", user.id)
      .maybeSingle()

    console.log("Token row found:", !!tokenRow, "| DB error:", tokenErr?.message ?? "none")
    console.log("Reading from column: google_photos_access_token")
    console.log("Calendar token prefix (google_access_token):", tokenRow?.google_access_token ? tokenRow.google_access_token.substring(0, 15) : "NULL")
    console.log("Photos token prefix (google_photos_access_token):", tokenRow?.google_photos_access_token ? tokenRow.google_photos_access_token.substring(0, 15) : "NULL")
    console.log("Has photos refresh_token:", !!tokenRow?.google_photos_refresh_token)
    console.log("Photos token expires_at:", tokenRow?.google_photos_token_expires_at ?? "null")
    console.log("Now (UTC):", new Date().toISOString())

    if (!tokenRow?.google_photos_access_token && !tokenRow?.google_photos_refresh_token) {
      return json({ error: "GOOGLE_PHOTOS_NOT_CONNECTED" }, 422)
    }

    let accessToken = tokenRow!.google_photos_access_token ?? ""
    const expiresAt    = tokenRow?.google_photos_token_expires_at ? new Date(tokenRow.google_photos_token_expires_at) : null
    const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 60_000

    console.log("Needs refresh:", needsRefresh, "| expires_at ms from now:", expiresAt ? expiresAt.getTime() - Date.now() : "N/A")

    if (needsRefresh) {
      if (!tokenRow?.google_photos_refresh_token) {
        return json({ error: "Google Photos token expired. Please reconnect Google Photos." }, 422)
      }
      console.log("Refreshing Google Photos access token using google_photos_refresh_token...")
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
      console.log("Token refresh HTTP status:", refreshRes.status)
      const refreshText = await refreshRes.text()
      console.log("Token refresh response:", refreshText)
      if (!refreshRes.ok) {
        return json({ error: "Token refresh failed", detail: refreshText }, 502)
      }
      const refreshData = JSON.parse(refreshText)
      accessToken = refreshData.access_token
      console.log("Token refreshed. New prefix:", accessToken.substring(0, 15))
      await db.from("user_oauth_tokens").update({
        google_photos_access_token:     accessToken,
        google_photos_token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
        updated_at:                     new Date().toISOString(),
      }).eq("user_id", user.id)
    }

    console.log("Final token being sent to Google Photos API prefix:", accessToken.substring(0, 15))

    // ── Verify token scopes ───────────────────────────────────
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`)
    const tokenInfo = await tokenInfoRes.json()
    console.log("Token scopes:", tokenInfo.scope)
    console.log("Token info full:", JSON.stringify(tokenInfo))

    // ── Simple list test (GET, no filters) ───────────────────
    console.log("=== Simple list test (GET /v1/mediaItems) ===")
    const testRes = await fetch("https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=5", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    })
    console.log("Simple list test status:", testRes.status)
    const testBody = await testRes.json()
    console.log("Simple list test body:", JSON.stringify(testBody).substring(0, 500))

    // ── Call Google Photos API ────────────────────────────────
    const lastDay     = daysInMonth(year, month)
    const requestBody = JSON.stringify({
      pageSize: 100,
      filters: {
        dateFilter: {
          ranges: [{
            startDate: { year, month, day: 1 },
            endDate:   { year, month, day: lastDay },
          }],
        },
        mediaTypeFilter: { mediaTypes: ["PHOTO"] },
      },
    })

    const photosUrl = "https://photoslibrary.googleapis.com/v1/mediaItems:search"
    console.log("=== Google Photos API request ===")
    console.log("URL:", photosUrl)
    console.log("Method: POST")
    console.log("Authorization header: Bearer", accessToken.substring(0, 15), "...")
    console.log("Content-Type: application/json")
    console.log("Request body:", requestBody)
    console.log(`(fetching for ${year}-${String(month).padStart(2, "0")}, days 1-${lastDay})`)

    let photosRes: Response
    try {
      photosRes = await fetch(photosUrl, {
        method:  "POST",
        headers: {
          "Authorization":  `Bearer ${accessToken}`,
          "Content-Type":   "application/json",
          "Accept":         "application/json",
        },
        body: requestBody,
      })
    } catch (fetchErr) {
      console.error("Network error calling Google Photos API:", fetchErr)
      return json({ error: "Network error calling Google Photos", detail: String(fetchErr) }, 502)
    }

    console.log("=== Google Photos API response ===")
    console.log("Status:", photosRes.status, photosRes.statusText)
    console.log("Response headers:", JSON.stringify(Object.fromEntries(photosRes.headers.entries())))

    const responseText = await photosRes.text()
    console.log("Full response body:", responseText)

    if (!photosRes.ok) {
      return json({ error: `Google Photos API error (${photosRes.status})`, detail: responseText }, 502)
    }

    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (parseErr) {
      console.error("Failed to parse Google Photos response as JSON:", parseErr)
      return json({ error: "Invalid JSON from Google Photos API", detail: responseText.slice(0, 200) }, 502)
    }

    const items = data.mediaItems ?? []
    console.log(`Google Photos returned ${items.length} items`)

    const photos = items.map((item: any) => ({
      google_photo_id: item.id,
      thumbnail_url:   `${item.baseUrl}=w400-h400-c`,
      creation_time:   item.mediaMetadata?.creationTime ?? new Date().toISOString(),
      width:           parseInt(item.mediaMetadata?.width  ?? "0", 10),
      height:          parseInt(item.mediaMetadata?.height ?? "0", 10),
      filename:        item.filename ?? "photo.jpg",
    }))

    console.log(`Returning ${photos.length} photos`)
    return json({ photos, total_count: photos.length })

  } catch (err) {
    console.error("=== UNHANDLED EXCEPTION ===", err)
    console.error("Stack:", (err as Error)?.stack ?? "no stack")
    return json({ error: "Internal server error", detail: String(err) }, 500)
  }
})
