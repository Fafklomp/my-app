/**
 * Edge Function: generate-summary
 *
 * Generates a per-audience newsletter summary using Claude.
 * Mirrors the user's natural speaking style and weaves in photo context.
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY          -- set via: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *   SUPABASE_URL               -- automatically injected by Supabase runtime
 *   SUPABASE_ANON_KEY          -- automatically injected by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY  -- automatically injected by Supabase runtime
 *
 * Deploy:
 *   npx supabase functions deploy generate-summary --project-ref <ref>
 *
 * TODO: Add per-user rate limiting before production use.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ANTHROPIC_API_KEY        = Deno.env.get("ANTHROPIC_API_KEY")!
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

// Convert a fetch Response body to a base64 string
async function toBase64(res: Response): Promise<string> {
  const buffer = await res.arrayBuffer()
  const bytes  = new Uint8Array(buffer)
  let binary   = ""
  const chunk  = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return btoa(binary)
}

// Ask Claude Haiku to describe a single photo in one sentence (fast + cheap)
async function describePhotoWithVision(base64: string, mimeType: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
          { type: "text",  text:  "Describe what is happening in this photo in one short sentence. Be specific and factual." },
        ],
      }],
    }),
  })
  if (!res.ok) return ""
  const data = await res.json()
  return data.content?.[0]?.text?.trim() ?? ""
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      console.error("Auth error:", authError?.message)
      return json({ error: "Unauthorized" }, 401)
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── Parse request ─────────────────────────────────────────
    const { newsletter_id, audience_list_id } = await req.json()
    if (!newsletter_id || !audience_list_id) {
      return json({ error: "newsletter_id and audience_list_id are required" }, 400)
    }

    // ── Fetch context ─────────────────────────────────────────
    const [newsletterRes, audienceRes] = await Promise.all([
      db.from("newsletters").select("*").eq("id", newsletter_id).eq("user_id", user.id).single(),
      db.from("audience_lists").select("*").eq("id", audience_list_id).eq("user_id", user.id).single(),
    ])

    const newsletter = newsletterRes.data
    const audience   = audienceRes.data

    if (!newsletter) return json({ error: "Newsletter not found" }, 404)
    if (!audience)   return json({ error: "Audience not found" }, 404)

    // ── Get or create the newsletter_version ──────────────────
    let { data: version } = await db
      .from("newsletter_versions")
      .select("*")
      .eq("newsletter_id", newsletter_id)
      .eq("audience_list_id", audience_list_id)
      .maybeSingle()

    if (!version) {
      const { data: newVersion, error: insertErr } = await db
        .from("newsletter_versions")
        .insert({ newsletter_id, audience_list_id, summary: "", status: "draft" })
        .select("*")
        .single()
      if (insertErr) {
        console.error("Version insert error:", insertErr.message)
        return json({ error: "Failed to create newsletter version" }, 500)
      }
      version = newVersion
    }

    // ── Fetch photos (up to 5 for context) ───────────────────
    const { data: allPhotos } = await db
      .from("newsletter_photos")
      .select("id, caption, storage_path, sort_order")
      .eq("newsletter_version_id", version.id)
      .order("sort_order", { ascending: true })

    const contextPhotos = (allPhotos ?? []).slice(0, 5)
    const photoCount    = allPhotos?.length ?? 0

    // Build photo descriptions: use existing captions where available,
    // otherwise run Claude vision on the stored image (fetched via signed URL)
    const photoDescriptions: string[] = await Promise.all(
      contextPhotos.map(async (photo) => {
        if (photo.caption) {
          return photo.caption
        }
        if (!photo.storage_path) return ""

        try {
          const { data: signedData } = await db.storage
            .from(BUCKET)
            .createSignedUrl(photo.storage_path, 60)

          if (!signedData?.signedUrl) return ""

          const imgRes = await fetch(signedData.signedUrl)
          if (!imgRes.ok) return ""

          const contentType = imgRes.headers.get("content-type") ?? "image/jpeg"
          const mimeType    = contentType.split(";")[0].trim()
          const base64      = await toBase64(imgRes)
          const description = await describePhotoWithVision(base64, mimeType)
          console.log(`Vision description for photo ${photo.id}:`, description)
          return description
        } catch (e) {
          console.error(`Vision failed for photo ${photo.id}:`, e)
          return ""
        }
      }),
    )

    const validDescriptions = photoDescriptions.filter(Boolean)
    const photoContextBlock = validDescriptions.length > 0
      ? `PHOTOS FROM THIS MONTH (use these for additional context about what the user did):
${validDescriptions.map((d, i) => `Photo ${i + 1}: ${d}`).join("\n")}

Use these photos as context to enrich the summary. If a photo shows a dinner, hike, or event that the user mentioned, reference it naturally. Do not list the photos -- weave them into the narrative.`
      : photoCount > 0
        ? `The user has included ${photoCount} photo${photoCount !== 1 ? "s" : ""} in this update.`
        : ""

    // ── Guard: require some input ─────────────────────────────
    const voiceInput  = newsletter.voice_input?.trim() || ""
    const prevSummary = version.summary?.trim() || ""

    if (!voiceInput && !prevSummary) {
      return json({ error: "NO_INPUT" }, 422)
    }

    // ── Build prompt ──────────────────────────────────────────
    const userName  = user.user_metadata?.full_name || user.user_metadata?.user_name || "the user"
    const month     = new Date(newsletter.period_start).toLocaleString("en-US", { month: "long", year: "numeric" })
    const toneGuide = audience.description?.trim() || "Friendly and natural -- write as a warm personal update."

    const prompt = `You are a personal newsletter ghostwriter for ${userName}.

IMPORTANT STYLE INSTRUCTION: Write in the same casual, natural voice as the user's raw input below. Mirror their slang, sentence rhythm, and personality. If they say 'bru' or 'lekker' or 'hectic', use those words. If they write in short punchy sentences, do the same. Do not polish their voice into generic newsletter language -- keep it authentically them. The newsletter should sound like the user talking to their friends, not a copywriter.

Read the user's raw input carefully and match their tone, vocabulary, and energy level. If they sound excited, be excited. If they're chill, be chill.

Write a warm, engaging monthly life update for the audience described below. Write in first person as ${userName}. Aim for 150-250 words across 2-3 paragraphs. End with a line that invites connection (e.g. "Would love to hear what you've been up to" or "Let me know when you're free for a call").

NEWSLETTER MONTH: ${month}

AUDIENCE: "${audience.name}"
TONE: ${toneGuide}

${voiceInput ? `USER'S RAW INPUT FOR THIS MONTH (mirror this voice exactly):\n${voiceInput}` : ""}

${prevSummary ? `PREVIOUS DRAFT (improve and refine this):\n${prevSummary}` : ""}

${photoContextBlock}

Rules:
- Mirror the user's exact voice, slang, and sentence style from their raw input
- Match the tone to the audience description
- Only reference events or details mentioned in the user's notes or visible in the photos -- do not invent details
- Write the newsletter body only -- no subject line, no "Dear [name]", no "Best regards"
- Be authentic and personal, not corporate
- Never use em dashes (use commas, periods, or short sentences instead)`

    // ── Call Claude ───────────────────────────────────────────
    console.log("Calling Claude for summary generation...")
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 1024,
        messages:   [{ role: "user", content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text()
      console.error(`Anthropic ${anthropicRes.status}:`, errBody)
      return json({ error: "AI generation failed", detail: errBody, status: anthropicRes.status }, 502)
    }

    const anthropicData    = await anthropicRes.json()
    const generatedSummary: string = anthropicData.content?.[0]?.text?.trim() || ""

    if (!generatedSummary) {
      console.error("Empty Anthropic response:", JSON.stringify(anthropicData))
      return json({ error: "Empty response from AI" }, 502)
    }

    // ── Persist ───────────────────────────────────────────────
    await db
      .from("newsletter_versions")
      .update({ summary: generatedSummary, updated_at: new Date().toISOString() })
      .eq("id", version.id)

    return json({ summary: generatedSummary, version_id: version.id })

  } catch (err) {
    console.error("Unhandled error:", err)
    return json({ error: "Internal server error", detail: String(err) }, 500)
  }
})
