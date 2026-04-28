// TODO: Add public read RLS policy for published versions
// newsletter_versions: allow anon select where status in ('approved', 'sent')
// newsletter_photos: allow anon select via newsletter_versions join

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Lightbox from '../components/Lightbox'

function formatMonth(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function firstSentence(text, maxLen = 150) {
  if (!text) return ''
  const dot = text.search(/[.!?]/)
  const cut = dot > 0 && dot < maxLen ? dot + 1 : maxLen
  return text.slice(0, cut).trim()
}

function Divider() {
  return <div className="w-16 h-px bg-cream-300 mx-auto my-10" />
}

export default function PublishedUpdatePage() {
  const { versionId } = useParams()

  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)
  const [restricted, setRestricted] = useState(false)
  const [version, setVersion]       = useState(null)
  const [newsletter, setNewsletter] = useState(null)
  const [photos, setPhotos]         = useState([])
  const [isOwner, setIsOwner]       = useState(false)
  const [copied, setCopied]         = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)

  useEffect(() => {
    load()
  }, [versionId])

  async function load() {
    // Fetch version
    const { data: vData } = await supabase
      .from('newsletter_versions')
      .select('id, newsletter_id, audience_list_id, summary, status')
      .eq('id', versionId)
      .single()

    if (!vData) {
      setNotFound(true)
      setLoading(false)
      return
    }

    // Check auth — is the viewer the newsletter owner?
    const { data: { session } } = await supabase.auth.getSession()
    let owner = false

    if (session) {
      const { data: nl } = await supabase
        .from('newsletters')
        .select('id, period_start, user_id, manual_content, coming_up_next')
        .eq('id', vData.newsletter_id)
        .single()

      if (nl) {
        owner = nl.user_id === session.user.id
        setNewsletter(nl)
      }
    } else {
      // Unauthenticated — still need the newsletter for the date and owner id
      const { data: nl } = await supabase
        .from('newsletters')
        .select('id, period_start, user_id, manual_content, coming_up_next')
        .eq('id', vData.newsletter_id)
        .single()
      if (nl) setNewsletter(nl)
    }

    setIsOwner(owner)

    // Gate draft visibility
    if (vData.status === 'draft' && !owner) {
      setRestricted(true)
      setLoading(false)
      return
    }

    setVersion(vData)

    // Fetch photos and generate signed URLs (1 hour expiry)
    const { data: photoData } = await supabase
      .from('newsletter_photos')
      .select('id, storage_path, photo_url, caption, sort_order')
      .eq('newsletter_version_id', versionId)
      .order('sort_order', { ascending: true })

    const raw = photoData ?? []
    const paths = raw.map((p) => p.storage_path).filter(Boolean)

    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('newsletter-photos')
        .createSignedUrls(paths, 3600)
      const urlMap = {}
      signed?.forEach(({ path, signedUrl }) => { urlMap[path] = signedUrl })
      setPhotos(raw.map((p) => ({ ...p, displayUrl: urlMap[p.storage_path] ?? p.photo_url ?? '' })))
    } else {
      setPhotos(raw.map((p) => ({ ...p, displayUrl: p.photo_url ?? '' })))
    }
    setLoading(false)
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback — select URL bar
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <p className="text-sm text-warm-gray-400">Loading…</p>
      </div>
    )
  }

  // ── 404 ──
  if (notFound) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="font-heading text-2xl text-warm-gray-800">Update not found</p>
          <p className="text-sm text-warm-gray-400">This link may be invalid or has been removed.</p>
        </div>
      </div>
    )
  }

  // ── Draft restricted ──
  if (restricted) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="font-heading text-2xl text-warm-gray-800">Not published yet</p>
          <p className="text-sm text-warm-gray-400">This update hasn't been published yet. Check back soon.</p>
        </div>
      </div>
    )
  }

  const monthYear  = newsletter ? formatMonth(newsletter.period_start) : ''
  const pullQuote  = firstSentence(version?.summary)
  const hasPhotos  = photos.length > 0

  return (
    <div className="min-h-screen bg-cream-100">
      <main className="max-w-2xl mx-auto px-6 py-12">

        {/* ── Back link (owner only) ── */}
        {isOwner && (
          <div className="mb-8">
            <Link
              to={`/dashboard`}
              className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors"
            >
              ← Back
            </Link>
          </div>
        )}

        {/* ── Header ── */}
        <div className="text-center space-y-4">
          <p className="text-terra-500 text-xs font-semibold tracking-widest uppercase">
            Monthly Update
          </p>

          <h1 className="font-heading text-4xl font-bold text-warm-gray-900">
            {monthYear}
          </h1>

          {/* Share button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={handleShare}
              className="bg-cream-200 text-warm-gray-600 hover:bg-cream-300 rounded-full px-4 py-2 text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5"
            >
              🔗 Share
            </button>
            {copied && (
              <span className="text-xs text-terra-500 font-medium">Link copied!</span>
            )}
          </div>

          {/* Pull quote */}
          {pullQuote && (
            <p className="font-heading text-xl text-warm-gray-500 italic leading-relaxed mt-6 max-w-xl mx-auto">
              "{pullQuote}"
            </p>
          )}
        </div>

        {/* ── Full summary ── */}
        {version?.summary && (
          <>
            <Divider />
            <div className="prose-like">
              <p className="text-warm-gray-600 text-base leading-relaxed whitespace-pre-wrap">
                {version.summary}
              </p>
            </div>
          </>
        )}

        {/* ── What's On My Radar ── */}
        {(() => {
          const mc = newsletter?.manual_content ?? {}
          const items = [
            { key: 'reading',        emoji: '📚', label: 'Reading',        data: mc.reading },
            { key: 'watching',       emoji: '🎬', label: 'Watching',       data: mc.watching },
            { key: 'recommendation', emoji: '💡', label: 'Recommendation', data: mc.recommendation },
            { key: 'hot_take',       emoji: '🔥', label: 'Hot Take',       data: mc.hot_take },
          ].filter(item => item.data?.title)

          if (items.length === 0) return null

          return (
            <>
              <Divider />
              <h2 className="font-heading text-xl font-semibold text-warm-gray-900 text-center mb-6">
                What's On My Radar
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {items.map(item => (
                  <div key={item.key} className="bg-white border border-cream-200 rounded-xl p-4 space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-warm-gray-400">
                      {item.emoji} {item.label}
                    </p>
                    <p className="font-medium text-warm-gray-800 text-sm">{item.data.title}</p>
                    {item.data.note && (
                      <p className="text-sm text-warm-gray-500">{item.data.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
        })()}

        {/* ── Coming Up ── */}
        {(() => {
          const included = (newsletter?.coming_up_next ?? []).filter(item => item.included && item.title)
          if (included.length === 0) return null

          return (
            <>
              <Divider />
              <h2 className="font-heading text-xl font-semibold text-warm-gray-900 text-center mb-6">
                Coming Up
              </h2>
              <div className="space-y-3">
                {included.map((item, i) => {
                  const [year, month, day] = item.date.split('-').map(Number)
                  const d = new Date(year, month - 1, day)
                  const monthStr = d.toLocaleDateString('en-US', { month: 'short' })
                  const dayNum   = d.getDate()
                  return (
                    <div key={i} className="flex items-center gap-4 bg-white border border-cream-200 rounded-xl px-4 py-3">
                      <div className="shrink-0 w-10 text-center">
                        <p className="text-xs font-semibold text-terra-500 uppercase leading-none">{monthStr}</p>
                        <p className="text-xl font-bold text-warm-gray-800 leading-tight">{dayNum}</p>
                      </div>
                      <p className="font-medium text-warm-gray-800 text-sm">{item.title}</p>
                    </div>
                  )
                })}
              </div>
            </>
          )
        })()}

        {/* ── Photos ── */}
        {hasPhotos && (
          <>
            <Divider />
            <p className="text-terra-500 text-xs font-semibold tracking-widest uppercase text-center mb-6">
              Highlights
            </p>
            <div className="grid grid-cols-3 gap-4">
              {photos.map((photo, i) => (
                <div key={photo.id}>
                  <div
                    className="rounded-xl overflow-hidden shadow-sm cursor-zoom-in"
                    onClick={() => setLightboxIndex(i)}
                  >
                    <img
                      src={photo.displayUrl}
                      alt={photo.caption ?? ''}
                      className="w-full object-cover aspect-[4/3]"
                    />
                  </div>
                  {photo.caption && (
                    <p className="text-warm-gray-600 text-sm mt-2">{photo.caption}</p>
                  )}
                </div>
              ))}
            </div>
            {lightboxIndex !== null && (
              <Lightbox
                photos={photos.map((p) => ({ displayUrl: p.displayUrl, caption: p.caption }))}
                index={lightboxIndex}
                onIndex={setLightboxIndex}
                onClose={() => setLightboxIndex(null)}
              />
            )}
          </>
        )}

        {/* ── Availability CTA ── */}
        <div className="mt-12 text-center space-y-2">
          <p className="font-heading text-lg text-warm-gray-800">Want to catch up?</p>
          <Link
            to="/availability"
            className="text-terra-500 hover:text-terra-600 font-medium text-sm transition-colors"
          >
            See when I'm free →
          </Link>
        </div>

        {/* ── Footer ── */}
        <div className="py-8 mt-12 border-t border-cream-200 text-center">
          <p className="text-warm-gray-300 text-xs">
            Made with life pulse · A personal life update
          </p>
        </div>

      </main>
    </div>
  )
}
