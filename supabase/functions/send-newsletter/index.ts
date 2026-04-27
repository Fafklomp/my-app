/**
 * Edge Function: send-newsletter
 *
 * Sends a teaser email to all members of a newsletter version's audience list.
 *
 * Required env vars:
 *   RESEND_API_KEY              -- set via: npx supabase secrets set RESEND_API_KEY=re_...
 *   SUPABASE_URL                -- automatically injected
 *   SUPABASE_ANON_KEY           -- automatically injected
 *   SUPABASE_SERVICE_ROLE_KEY   -- automatically injected
 *
 * Deploy:
 *   npx supabase functions deploy send-newsletter --no-verify-jwt
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY         = Deno.env.get("RESEND_API_KEY")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const APP_URL  = Deno.env.get("APP_URL") ?? "https://fafklomp.dev"
const BUCKET   = "newsletter-photos"
const SIGN_TTL = 604800 // 7 days

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

function teaser(summary: string): string {
  const first = summary.replace(/\n+/g, " ").trim()
  if (first.length <= 150) return first
  const cut = first.lastIndexOf(" ", 150)
  return first.slice(0, cut > 80 ? cut : 150) + "…"
}

function buildEmailHtml(params: {
  senderName: string
  month: string
  teaserText: string
  heroPhotoUrl: string
  readUrl: string
  availabilityUrl: string
  audienceName: string
}): string {
  const { senderName, month, teaserText, heroPhotoUrl, readUrl, availabilityUrl, audienceName } = params

  const heroRow = heroPhotoUrl
    ? `<tr><td style="padding:0 32px 28px;">
        <img src="${heroPhotoUrl}" width="536" style="width:100%;border-radius:12px;display:block;max-height:320px;object-fit:cover;" alt="">
      </td></tr>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0eb;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f0eb;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="background:#c17a5a;padding:28px 32px;">
    <p style="margin:0;color:rgba(255,255,255,0.7);font-size:10px;font-family:system-ui,sans-serif;text-transform:uppercase;letter-spacing:2.5px;">Monthly Update</p>
    <h1 style="margin:5px 0 0;color:#fff;font-size:24px;font-weight:700;font-family:Georgia,serif;line-height:1.2;">${month}</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;font-family:system-ui,sans-serif;">${senderName}</p>
  </td></tr>

  <!-- Hero photo -->
  ${heroRow}

  <!-- Teaser -->
  <tr><td style="padding:${heroPhotoUrl ? "0" : "28px"} 32px 24px;">
    <p style="margin:0;color:#3d3530;font-size:16px;line-height:1.75;font-family:Georgia,serif;">${teaserText}</p>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 32px 12px;">
    <a href="${readUrl}" style="display:inline-block;background:#c17a5a;color:#fff;font-size:15px;font-weight:600;font-family:system-ui,sans-serif;text-decoration:none;padding:13px 28px;border-radius:8px;">Read full update →</a>
  </td></tr>
  <tr><td style="padding:0 32px 32px;">
    <a href="${availabilityUrl}" style="color:#c17a5a;font-size:13px;font-family:system-ui,sans-serif;text-decoration:none;">See when I'm free →</a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 32px;border-top:1px solid #ede8e3;text-align:center;">
    <p style="margin:0 0 4px;color:#b0a49c;font-size:11px;font-family:system-ui,sans-serif;">Made with Life Pulse</p>
    <p style="margin:0;color:#c8bdb8;font-size:11px;font-family:system-ui,sans-serif;">${senderName} added you to their ${audienceName} list. Reply to unsubscribe.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

async function sendEmail(params: {
  to: string
  toName: string
  fromName: string
  replyTo: string
  subject: string
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:     `${params.fromName} <hello@fafklomp.dev>`,
      to:       [`${params.toName} <${params.to}>`],
      reply_to: params.replyTo,
      subject:  params.subject,
      html:     params.html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`Resend error for ${params.to} (${res.status}):`, body)
    return { ok: false, error: `${res.status}: ${body}` }
  }

  return { ok: true }
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

    // ── Parse request ─────────────────────────────────────────
    const { version_id } = await req.json()
    if (!version_id) return json({ error: "version_id is required" }, 400)

    // ── Fetch version + newsletter + audience ─────────────────
    const { data: version } = await db
      .from("newsletter_versions")
      .select("id, newsletter_id, audience_list_id, summary, status")
      .eq("id", version_id)
      .single()

    if (!version) return json({ error: "Version not found" }, 404)

    const [newsletterRes, audienceRes] = await Promise.all([
      db.from("newsletters").select("id, user_id, period_start").eq("id", version.newsletter_id).single(),
      db.from("audience_lists").select("id, name").eq("id", version.audience_list_id).single(),
    ])

    const newsletter = newsletterRes.data
    const audience   = audienceRes.data

    if (!newsletter || newsletter.user_id !== user.id) return json({ error: "Unauthorized" }, 401)
    if (!audience)   return json({ error: "Audience not found" }, 404)
    if (!version.summary?.trim()) return json({ error: "Version has no summary" }, 422)

    // ── Fetch recipients ──────────────────────────────────────
    const { data: members } = await db
      .from("audience_members")
      .select("id, name, email")
      .eq("audience_list_id", version.audience_list_id)
      .eq("user_id", user.id)

    if (!members || members.length === 0) {
      return json({ error: "No recipients in this audience" }, 422)
    }

    // ── First photo → signed URL ──────────────────────────────
    let heroPhotoUrl = ""
    const { data: firstPhoto } = await db
      .from("newsletter_photos")
      .select("storage_path")
      .eq("newsletter_version_id", version_id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstPhoto?.storage_path) {
      const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(firstPhoto.storage_path, SIGN_TTL)
      heroPhotoUrl = signed?.signedUrl ?? ""
    }

    // ── Build email params ────────────────────────────────────
    const senderName  = user.user_metadata?.full_name || user.user_metadata?.user_name || "Your friend"
    const senderEmail = user.email ?? ""
    const month       = new Date(newsletter.period_start).toLocaleString("en-US", { month: "long", year: "numeric" })
    const subject     = `${senderName}'s ${month} Update`
    const readUrl     = `${APP_URL}/update/${version_id}`
    const availUrl    = `${APP_URL}/availability`

    // ── Send to each recipient ────────────────────────────────
    let sent = 0, failed = 0
    const errors: string[] = []

    for (const member of members) {
      const html = buildEmailHtml({
        senderName,
        month,
        teaserText:      teaser(version.summary),
        heroPhotoUrl,
        readUrl,
        availabilityUrl: availUrl,
        audienceName:    audience.name,
      })

      const result = await sendEmail({
        to:       member.email,
        toName:   member.name,
        fromName: senderName,
        replyTo:  senderEmail,
        subject,
        html,
      })

      if (result.ok) { sent++ } else { failed++; errors.push(`${member.email}: ${result.error}`) }
    }

    console.log(`Send complete: ${sent} sent, ${failed} failed`)

    // ── Persist ───────────────────────────────────────────────
    await db.from("newsletter_versions").update({
      status: "sent", sent_at: new Date().toISOString(),
      sent_count: sent, send_errors: errors.length > 0 ? errors : null,
      updated_at: new Date().toISOString(),
    }).eq("id", version_id)

    await db.from("newsletters").update({ status: "sent" }).eq("id", version.newsletter_id)

    return json({ sent, failed, errors })

  } catch (err) {
    console.error("Unhandled error:", err)
    return json({ error: "Internal server error", detail: String(err) }, 500)
  }
})
