/**
 * Edge Function: fetch-calendar-events
 *
 * Fetches events from ALL of the user's Google Calendars for a given month,
 * including subscribed and imported calendars (ICS feeds, shared calendars, etc.).
 *
 * Flow:
 *   1. Read + refresh Google access token from user_oauth_tokens
 *   2. List all calendars via calendarList API (filter to selected=true)
 *   3. Fetch events from every calendar in parallel
 *   4. Merge, deduplicate (same title + start time), sort by start time
 *   5. Cache in calendar_events table (replace existing for that user+month)
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_ID           — npx supabase secrets set GOOGLE_CLIENT_ID=...
 *   GOOGLE_CLIENT_SECRET       — npx supabase secrets set GOOGLE_CLIENT_SECRET=...
 *   SUPABASE_URL               — automatically injected
 *   SUPABASE_ANON_KEY          — automatically injected
 *   SUPABASE_SERVICE_ROLE_KEY  — automatically injected
 *
 * Deploy:
 *   npx supabase functions deploy fetch-calendar-events --project-ref <ref> --no-verify-jwt
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GOOGLE_CLIENT_ID     = Deno.env.get("GOOGLE_CLIENT_ID")!
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!
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

async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`)
  return res.json()
}

// Fetch all calendars the user has visible in Google Calendar
async function listCalendars(accessToken: string): Promise<Array<{ id: string; summary: string; primary: boolean }>> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?fields=items(id,summary,selected,primary)",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`calendarList failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  // Only return calendars the user has selected (visible in their Google Calendar view)
  return (data.items ?? []).filter((c: any) => c.selected !== false)
}

// Fetch events for one calendar in a given time range
async function fetchEventsForCalendar(
  accessToken: string,
  calendarId: string,
  calendarName: string,
  timeMin: string,
  timeMax: string,
): Promise<any[]> {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  )
  url.searchParams.set("timeMin", timeMin)
  url.searchParams.set("timeMax", timeMax)
  url.searchParams.set("singleEvents", "true")
  url.searchParams.set("orderBy", "startTime")
  url.searchParams.set("maxResults", "250")
  url.searchParams.set("fields", "items(id,summary,start,end,location,description,status)")

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    // Log but don't throw — one bad calendar shouldn't abort the whole sync
    console.error(`Events fetch failed for calendar "${calendarName}" (${res.status}): ${await res.text()}`)
    return []
  }

  const data = await res.json()
  return (data.items ?? [])
    .filter((e: any) => e.status !== "cancelled")
    .map((e: any) => ({
      title:         e.summary || "(No title)",
      start_time:    e.start?.dateTime ?? `${e.start?.date}T00:00:00Z`,
      end_time:      e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00Z` : null),
      location:      e.location ?? null,
      description:   e.description ?? null,
      all_day:       !e.start?.dateTime,
      calendar_name: calendarName,
    }))
}

serve(async (req) => {
  const cors = corsHeaders(req.headers.get("Origin"))
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors })
  }

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
    const { month, year } = await req.json()
    if (!month || !year) return json({ error: "month and year are required" }, 400)

    const monthYear = `${year}-${String(month).padStart(2, "0")}`

    // ── Load + refresh Google token ───────────────────────────
    const { data: tokenRow } = await db
      .from("user_oauth_tokens")
      .select("google_access_token, google_refresh_token, google_token_expires_at")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!tokenRow?.google_access_token && !tokenRow?.google_refresh_token) {
      return json({ error: "GOOGLE_NOT_CONNECTED" }, 422)
    }

    let accessToken = tokenRow.google_access_token!
    const expiresAt = tokenRow.google_token_expires_at ? new Date(tokenRow.google_token_expires_at) : null
    const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 60_000

    if (needsRefresh) {
      if (!tokenRow.google_refresh_token) {
        return json({ error: "Google token expired and no refresh token stored. Please reconnect Google Calendar." }, 422)
      }
      const refreshed = await refreshGoogleToken(tokenRow.google_refresh_token)
      accessToken = refreshed.access_token
      await db
        .from("user_oauth_tokens")
        .update({
          google_access_token:     accessToken,
          google_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at:              new Date().toISOString(),
        })
        .eq("user_id", user.id)
    }

    // ── List all selected calendars ───────────────────────────
    const calendars = await listCalendars(accessToken)
    console.log(`Found ${calendars.length} selected calendars:`, calendars.map((c) => c.summary).join(", "))

    // ── Fetch events from all calendars in parallel ───────────
    const timeMin = new Date(year, month - 1, 1).toISOString()
    const timeMax = new Date(year, month, 0, 23, 59, 59).toISOString()

    const perCalendarEvents = await Promise.all(
      calendars.map((cal) =>
        fetchEventsForCalendar(accessToken, cal.id, cal.summary, timeMin, timeMax)
      )
    )

    const allEvents = perCalendarEvents.flat()
    console.log(`Total raw events across all calendars: ${allEvents.length}`)

    // ── Deduplicate by title + start_time ─────────────────────
    // If the same event appears in multiple calendars (e.g. an event shared across
    // a personal and work calendar), keep the first occurrence (which will be from
    // the primary calendar since calendarList returns primary first).
    const seen = new Set<string>()
    const dedupedEvents = allEvents.filter((e) => {
      const key = `${e.title}|${e.start_time}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Sort by start time
    dedupedEvents.sort((a, b) => a.start_time.localeCompare(b.start_time))
    console.log(`Events after dedup: ${dedupedEvents.length}`)

    // ── Cache in DB: replace all events for this user+month ───
    await db
      .from("calendar_events")
      .delete()
      .eq("user_id", user.id)
      .eq("source", "google")
      .eq("month_year", monthYear)

    if (dedupedEvents.length > 0) {
      const rows = dedupedEvents.map((e) => ({
        user_id:       user.id,
        source:        "google",
        month_year:    monthYear,
        title:         e.title,
        start_time:    e.start_time,
        end_time:      e.end_time,
        location:      e.location,
        description:   e.description,
        all_day:       e.all_day,
        calendar_name: e.calendar_name,
      }))
      await db.from("calendar_events").insert(rows)
    }

    return json({
      events: dedupedEvents.map((e) => ({
        title:         e.title,
        start_time:    e.start_time,
        end_time:      e.end_time,
        location:      e.location,
        all_day:       e.all_day,
        calendar_name: e.calendar_name,
      })),
      calendars_synced: calendars.map((c) => c.summary),
      month_year:       monthYear,
      count:            dedupedEvents.length,
    })

  } catch (err) {
    console.error("Unhandled error:", err)
    return json({ error: "Internal server error", detail: String(err) }, 500)
  }
})
