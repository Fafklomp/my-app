/**
 * Edge Function: generate-captions
 *
 * Generates vision-aware photo captions using Claude's image API.
 * Each photo is downloaded from private Supabase Storage, converted to base64,
 * and sent to Claude along with audience tone and voice input context.
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY          — set via: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *   SUPABASE_URL               — automatically injected by Supabase runtime
 *   SUPABASE_ANON_KEY          — automatically injected by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY  — automatically injected by Supabase runtime
 *
 * Deploy:
 *   npx supabase functions deploy generate-captions --project-ref <ref> --no-verify-jwt
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

function mediaTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    jpg:  "image/jpeg",
    jpeg: "image/jpeg",
    png:  "image/png",
    webp: "image/webp",
    gif:  "image/gif",
    heic: "image/jpeg", // Claude doesn't support HEIC; approximate as JPEG
    heif: "image/jpeg",
  }
  return map[ext] ?? "image/jpeg"
}

// Convert ArrayBuffer to base64 without blowing the call stack on large files
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

// Returns storage path from either a full URL or a raw path string
function storagePath(value: string): string {
  if (!value) return ""
  if (value.startsWith("http")) {
    // Extract path after /object/public/<bucket>/ or /object/sign/<bucket>/
    const match = value.match(/\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/)
    return match ? match[1] : value
  }
  return value
}

async function generateCaptionForPhoto(
  imageBase64: string,
  mediaType: string,
  audienceName: string,
  audienceDescription: string,
  voiceInput: string,
): Promise<string> {
  const prompt = `You are writing a photo caption for a personal monthly newsletter.

AUDIENCE: "${audienceName}"
TONE: ${audienceDescription}
CONTEXT FROM USER ABOUT THEIR MONTH: ${voiceInput || "No additional context provided."}

Look at this photo and write a short, natural caption (5-15 words) that feels like a casual photo album note. Reference specific things you see — the location, activity, people, food, scenery. Match the tone to the audience description.

Examples of good captions:
- "Rooftop dinner with the crew — perfect sunset vibes"
- "Finally conquered Mount Washington 🏔️"
- "Found the best coffee spot in Cartagena"

Write ONLY the caption, nothing else.`

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-api-key":       ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            {
              type:   "image",
              source: {
                type:       "base64",
                media_type: mediaType,
                data:       imageBase64,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic ${res.status}: ${body}`)
  }

  const data = await res.json()
  return (data.content?.[0]?.text ?? "").trim()
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
    const { newsletter_version_id } = await req.json()
    if (!newsletter_version_id) {
      return json({ error: "newsletter_version_id is required" }, 400)
    }

    // ── Fetch version + context ───────────────────────────────
    const { data: version } = await db
      .from("newsletter_versions")
      .select("id, newsletter_id, audience_list_id, summary")
      .eq("id", newsletter_version_id)
      .single()

    if (!version) return json({ error: "Version not found" }, 404)

    const [newsletterRes, audienceRes, photosRes] = await Promise.all([
      db.from("newsletters").select("period_start, voice_input, user_id").eq("id", version.newsletter_id).single(),
      db.from("audience_lists").select("name, description").eq("id", version.audience_list_id).single(),
      db.from("newsletter_photos")
        .select("id, storage_path, photo_url, sort_order")
        .eq("newsletter_version_id", newsletter_version_id)
        .order("sort_order", { ascending: true }),
    ])

    const newsletter = newsletterRes.data
    const audience   = audienceRes.data
    const photos     = photosRes.data ?? []

    if (!newsletter || newsletter.user_id !== user.id) {
      return json({ error: "Unauthorized" }, 401)
    }

    if (photos.length === 0) return json({ captions: [] })

    const voiceInput        = newsletter.voice_input?.trim() || version.summary?.trim() || ""
    const audienceName      = audience?.name ?? "General"
    const audienceDescription = audience?.description?.trim() || "Casual and personal."

    // ── Process photos sequentially ───────────────────────────
    const results: Array<{ photo_id: string; caption: string; error?: string }> = []

    for (const photo of photos) {
      const rawPath = photo.storage_path || photo.photo_url || ""
      const path    = storagePath(rawPath)

      if (!path) {
        console.warn(`Photo ${photo.id} has no storage path — skipping`)
        results.push({ photo_id: photo.id, caption: "", error: "No storage path" })
        continue
      }

      try {
        // Download from private storage using service role client
        const { data: fileData, error: downloadErr } = await db.storage
          .from(BUCKET)
          .download(path)

        if (downloadErr || !fileData) {
          throw new Error(downloadErr?.message ?? "Download returned empty")
        }

        const arrayBuffer = await fileData.arrayBuffer()
        const base64      = arrayBufferToBase64(arrayBuffer)
        const mediaType   = mediaTypeFromPath(path)

        const caption = await generateCaptionForPhoto(
          base64,
          mediaType,
          audienceName,
          audienceDescription,
          voiceInput,
        )

        // Persist immediately
        await db.from("newsletter_photos").update({ caption }).eq("id", photo.id)

        results.push({ photo_id: photo.id, caption })
        console.log(`Captioned photo ${photo.id}: "${caption}"`)

      } catch (err) {
        console.error(`Failed to caption photo ${photo.id}:`, err)
        results.push({ photo_id: photo.id, caption: "", error: String(err) })
      }
    }

    return json({ captions: results })

  } catch (err) {
    console.error("Unhandled error:", err)
    return json({ error: "Internal server error", detail: String(err) }, 500)
  }
})
