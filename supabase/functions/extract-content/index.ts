/**
 * Edge Function: extract-content
 *
 * Extracts structured "What's On My Radar" content from a voice/text transcript
 * using Claude. Returns reading, watching, recommendation, and hot_take fields.
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL / SUPABASE_ANON_KEY
 *
 * Deploy:
 *   npx supabase functions deploy extract-content --no-verify-jwt --project-ref tocaemuhsttqmzztxzme
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!
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
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: "Unauthorized" }, 401)

    const { transcript } = await req.json()
    if (!transcript?.trim()) return json({ error: "transcript is required" }, 400)

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system:     "You are extracting structured content from a personal monthly update note. Find any mentions of: books or articles being read, shows or movies being watched, recommendations (restaurants, products, apps, places, anything), strong opinions or hot takes, and upcoming plans or events mentioned for the future (trips, meetups, events, deadlines, things they're looking forward to). Return ONLY valid JSON matching this structure: { reading: { title: string, note: string }, watching: { title: string, note: string }, recommendation: { title: string, note: string }, hot_take: { title: string, note: string }, coming_up: [{ title: string, date: string }] }. Use empty strings for fields not mentioned. For coming_up, use empty string for date if no date is mentioned. The title should be the name of the thing, the note should be a brief comment about it extracted from context.",
        messages:   [{ role: "user", content: transcript }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error("Anthropic error:", errText)
      return json({ error: "AI extraction failed", detail: errText }, 502)
    }

    const aiData = await res.json()
    const text   = aiData.content?.[0]?.text?.trim() ?? ""

    let extracted
    try {
      extracted = JSON.parse(text)
    } catch {
      console.error("Failed to parse AI response:", text)
      return json({ error: "Failed to parse AI response", detail: text }, 502)
    }

    return json(extracted)

  } catch (err) {
    console.error("Unhandled error:", err)
    return json({ error: "Internal server error", detail: String(err) }, 500)
  }
})
