/**
 * Edge Function: curate-photos
 *
 * Selects the best 10 photos from a month's metadata using a smart algorithm.
 * No image downloads, no Claude API calls — pure computation, always fast.
 *
 * Algorithm:
 *   1. Filter out likely screenshots (screen-sized dimensions or Screenshot_ filename)
 *   2. Group remaining photos by week of month
 *   3. Within each week, prefer weekend days over weekdays
 *   4. Within each day, prefer larger resolution (proxy for photo quality)
 *   5. Spread picks evenly across weeks, targeting 10 total
 *
 * Receives:  { newsletter_id, audience_list_id, photos_metadata }
 * Returns:   { selected: [...] }
 *
 * Deploy:
 *   npx supabase functions deploy curate-photos --project-ref <ref> --no-verify-jwt
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

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

type PhotoMeta = {
  google_photo_id: string
  thumbnail_url:   string
  creation_time:   string
  width:           number
  height:          number
  filename:        string
}

type ScoredPhoto = PhotoMeta & { reason: string }

// Common screen widths — photos matching these dimensions are likely screenshots
const SCREEN_WIDTHS = new Set([
  360, 375, 390, 393, 412, 414, 428, 430,   // phone portrait
  720, 750, 780, 800, 828, 834, 860, 880,   // phone @2x / tablet
  1080, 1125, 1170, 1179, 1242, 1284, 1290, 1334, 1366, 1440, // phone @3x / laptop
  1920, 2048, 2160, 2208, 2340, 2532, 2556, 2560, 2688, 2778, 2796, 2932, // hi-res
])

function isLikelyScreenshot(photo: PhotoMeta): boolean {
  if (photo.filename.toLowerCase().startsWith("screenshot")) return true
  if (photo.filename.toLowerCase().startsWith("screen_")) return true
  // Portrait screenshots have width in the common screen set
  if (SCREEN_WIDTHS.has(photo.width) && photo.height > photo.width) return true
  // Landscape screenshots
  if (SCREEN_WIDTHS.has(photo.height) && photo.width > photo.height) return true
  return false
}

function pixelCount(photo: PhotoMeta): number {
  return (photo.width ?? 0) * (photo.height ?? 0)
}

function weekOfMonth(dateStr: string): number {
  // Week 0 = days 1-7, week 1 = days 8-14, etc.
  const day = parseInt(dateStr.slice(8, 10), 10)
  return Math.floor((day - 1) / 7)
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z")
  const dow = d.getUTCDay() // 0=Sun, 6=Sat
  return dow === 0 || dow === 6
}

function selectCandidates(photos: PhotoMeta[], target = 10): ScoredPhoto[] {
  if (photos.length === 0) return []
  if (photos.length <= target) {
    return photos.map(p => ({ ...p, reason: "All photos for this month" }))
  }

  // Filter out screenshots
  const real = photos.filter(p => !isLikelyScreenshot(p))
  const pool = real.length >= target ? real : photos // fall back if too many filtered

  // Group by week
  const byWeek = new Map<number, PhotoMeta[]>()
  for (const photo of pool) {
    const date = photo.creation_time.slice(0, 10)
    const week = weekOfMonth(date)
    if (!byWeek.has(week)) byWeek.set(week, [])
    byWeek.get(week)!.push(photo)
  }

  const weeks = [...byWeek.keys()].sort((a, b) => a - b)
  const targetPerWeek = Math.ceil(target / weeks.length)

  const selected: ScoredPhoto[] = []

  for (const week of weeks) {
    if (selected.length >= target) break
    const weekPhotos = byWeek.get(week)!

    // Group by day
    const byDay = new Map<string, PhotoMeta[]>()
    for (const photo of weekPhotos) {
      const date = photo.creation_time.slice(0, 10)
      if (!byDay.has(date)) byDay.set(date, [])
      byDay.get(date)!.push(photo)
    }

    // Sort days: weekends first, then by date
    const sortedDays = [...byDay.entries()].sort(([a], [b]) => {
      const aWeekend = isWeekend(a) ? 0 : 1
      const bWeekend = isWeekend(b) ? 0 : 1
      if (aWeekend !== bWeekend) return aWeekend - bWeekend
      return a.localeCompare(b)
    })

    let addedFromWeek = 0
    for (const [date, dayPhotos] of sortedDays) {
      if (addedFromWeek >= targetPerWeek || selected.length >= target) break

      // Sort photos within the day by resolution descending (higher res = more intentional shot)
      const ranked = [...dayPhotos].sort((a, b) => pixelCount(b) - pixelCount(a))

      const pick = ranked[0]
      const dow = isWeekend(date) ? "weekend" : "weekday"
      selected.push({
        ...pick,
        reason: `${dow === "weekend" ? "Weekend" : "Weekday"} shot · ${
          pick.width && pick.height ? `${pick.width}×${pick.height}` : "photo"
        }`,
      })
      addedFromWeek++

      // Add a second pick from the same day if it's a weekend and we have room
      if (isWeekend(date) && ranked[1] && addedFromWeek < targetPerWeek && selected.length < target) {
        selected.push({
          ...ranked[1],
          reason: `Weekend shot (2nd pick)`,
        })
        addedFromWeek++
      }
    }
  }

  return selected.slice(0, target)
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

    // ── Parse request ─────────────────────────────────────────
    const body = await req.json()
    const { photos_metadata } = body

    if (!Array.isArray(photos_metadata)) {
      return json({ error: "photos_metadata array is required" }, 400)
    }

    console.log(`Curating ${photos_metadata.length} photos using smart algorithm...`)

    const selected = selectCandidates(photos_metadata as PhotoMeta[], 10)

    console.log(`Selected ${selected.length} candidates`)
    return json({ selected })

  } catch (err) {
    console.error("Unhandled error:", err)
    return json({ error: "Internal server error", detail: String(err) }, 500)
  }
})
