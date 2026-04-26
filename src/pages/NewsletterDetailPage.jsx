import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import { STATUS_STYLES } from '../lib/constants'
import PhotoUpload from '../components/PhotoUpload'
import VoiceRecorder from '../components/VoiceRecorder'
import Lightbox from '../components/Lightbox'
import ConnectGoogle from '../components/ConnectGoogle'
import MiniCalendar from '../components/MiniCalendar'
import PhotoCurator from '../components/PhotoCurator'
import SpotifyMonthlyMusic from '../components/SpotifyMonthlyMusic'
import ContentCards from '../components/ContentCards'
import ComingUpNext from '../components/ComingUpNext'

const BUCKET         = 'newsletter-photos'
const SIGNED_URL_TTL = 3600

const textareaClass =
  'w-full bg-white border border-cream-300 rounded-lg px-4 py-3 text-sm text-warm-gray-800 placeholder:text-warm-gray-400 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500 resize-none leading-relaxed'

function formatMonth(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function NewsletterDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [user, setUser]                   = useState(null)
  const [newsletter, setNewsletter]       = useState(null)
  const [audienceLists, setAudienceLists] = useState([])
  const [versions, setVersions]           = useState([])
  const [activeTab, setActiveTab]         = useState('all')
  const [editingId, setEditingId]         = useState(null)
  const [editDraft, setEditDraft]         = useState('')
  const [savingEdit, setSavingEdit]       = useState(false)
  const [generatingId, setGeneratingId]   = useState(null)
  const [approving, setApproving]         = useState(false)
  // All photos across all versions (for the All Audiences overview)
  const [allPhotos, setAllPhotos]         = useState([])
  // Voice input
  const [voiceInputExpanded, setVoiceInputExpanded] = useState(false)
  // All-audiences lightbox
  const [allPhotosLightbox, setAllPhotosLightbox] = useState(null)
  // AI generation
  const [regenerating, setRegenerating]         = useState(false)
  const [regenError, setRegenError]             = useState(null)
  const [captioning, setCaptioning]             = useState(false)
  const [captionRefreshKey, setCaptionRefreshKey] = useState(0)
  // Calendar + Google Photos + Spotify
  const [googleConnected, setGoogleConnected]       = useState(false)
  const [googlePhotosEnabled, setGooglePhotosEnabled] = useState(false)
  const [spotifyConnected, setSpotifyConnected]     = useState(false)
  const [calendarEvents, setCalendarEvents]         = useState([])
  const [syncingCalendar, setSyncingCalendar]       = useState(false)
  // Content cards
  const [manualContent, setManualContent]           = useState({})
  const [extractionResult, setExtractionResult]     = useState(null)
  const [comingUpNext, setComingUpNext]             = useState([])
  // Send flow
  const [memberCounts, setMemberCounts]             = useState({})
  const [sendModal, setSendModal]                   = useState(false)
  const [sendTargets, setSendTargets]               = useState(new Set())
  const [sending, setSending]                       = useState(false)
  const [sendProgressMsg, setSendProgressMsg]       = useState('')
  const [sendToast, setSendToast]                   = useState(null)
  // Reset flow
  const [resetModal, setResetModal]                 = useState(false)
  const [resetting, setResetting]                   = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate('/', { replace: true }); return }
      setUser(session.user)
      fetchAll(session.user.id)
    })
  }, [id, navigate])

  async function fetchAll(userId) {
    const [
      { data: newsletterData },
      { data: audienceData },
      { data: versionData },
      { data: membersData },
    ] = await Promise.all([
      supabase
        .from('newsletters')
        .select('id, title, status, period_start, period_end, voice_input, manual_content, coming_up_next')
        .eq('id', id)
        .eq('user_id', userId)
        .single(),
      supabase
        .from('audience_lists')
        .select('id, name, description')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
      supabase
        .from('newsletter_versions')
        .select('id, audience_list_id, summary, status, sent_at')
        .eq('newsletter_id', id),
      supabase
        .from('audience_members')
        .select('audience_list_id')
        .eq('user_id', userId),
    ])

    if (!newsletterData) { navigate('/dashboard', { replace: true }); return }

    setNewsletter(newsletterData)
    setManualContent(newsletterData.manual_content ?? {})
    setComingUpNext(newsletterData.coming_up_next ?? [])
    setAudienceLists(audienceData ?? [])
    setVersions(versionData ?? [])
    await loadAllPhotos(versionData ?? [])

    const counts = {}
    membersData?.forEach(m => { counts[m.audience_list_id] = (counts[m.audience_list_id] ?? 0) + 1 })
    setMemberCounts(counts)

    // Load any previously synced calendar events for this month
    const monthYear = newsletterData.period_start.slice(0, 7)
    const [{ data: evData }, { data: tokenRow }] = await Promise.all([
      supabase
        .from('calendar_events')
        .select('id, title, start_time, end_time, location, all_day, calendar_name')
        .eq('user_id', userId)
        .eq('month_year', monthYear)
        .order('start_time', { ascending: true }),
      supabase
        .from('user_oauth_tokens')
        .select('google_access_token, google_photos_access_token, spotify_access_token')
        .eq('user_id', userId)
        .maybeSingle(),
    ])
    setCalendarEvents(evData ?? [])
    setGoogleConnected(!!tokenRow?.google_access_token)
    setGooglePhotosEnabled(!!tokenRow?.google_photos_access_token)
    setSpotifyConnected(!!tokenRow?.spotify_access_token)
  }

  // Fetch + sign all photos for every version of this newsletter
  async function loadAllPhotos(versionList) {
    const vIds = versionList.map((v) => v.id)
    if (vIds.length === 0) { setAllPhotos([]); return }

    const { data } = await supabase
      .from('newsletter_photos')
      .select('id, newsletter_version_id, storage_path, photo_url, caption, sort_order, taken_at, camera_info')
      .in('newsletter_version_id', vIds)
      .order('sort_order', { ascending: true })

    const photos = data ?? []
    if (photos.length === 0) { setAllPhotos([]); return }

    const paths = photos.map((p) => p.storage_path).filter(Boolean)
    if (paths.length === 0) { setAllPhotos(photos); return }

    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL)

    const urlMap = {}
    signed?.forEach(({ path, signedUrl }) => { urlMap[path] = signedUrl })

    setAllPhotos(photos.map((p) => ({
      ...p,
      displayUrl: urlMap[p.storage_path] ?? p.photo_url ?? '',
    })))
  }

  // Called by PhotoUpload after any mutation so the All Audiences grid stays fresh
  function refreshAllPhotos() {
    loadAllPhotos(versions)
  }

  function getVersion(audienceListId) {
    return versions.find((v) => v.audience_list_id === audienceListId) ?? null
  }

  // ── Approve & Publish ──
  async function handleApprove() {
    setApproving(true)
    await supabase.from('newsletters').update({ status: 'approved' }).eq('id', id)
    setNewsletter((prev) => ({ ...prev, status: 'approved' }))
    setApproving(false)
  }

  // ── Generate Draft ──
  async function handleGenerate(audienceListId) {
    setGeneratingId(audienceListId)
    const { data } = await supabase
      .from('newsletter_versions')
      .insert({ newsletter_id: id, audience_list_id: audienceListId, summary: '', status: 'draft' })
      .select('id, audience_list_id, summary, status')
      .single()
    if (data) setVersions((prev) => [...prev, data])
    setGeneratingId(null)
  }

  // ── Save summary edit ──
  async function handleSaveEdit(versionId) {
    setSavingEdit(true)
    await supabase.from('newsletter_versions').update({ summary: editDraft }).eq('id', versionId)
    setVersions((prev) => prev.map((v) => (v.id === versionId ? { ...v, summary: editDraft } : v)))
    setEditingId(null)
    setSavingEdit(false)
  }

  // ── Regenerate summary via Edge Function ──
  async function handleRegenerate() {
    const version = getVersion(activeTab)
    if (activeTab === 'all') return

    if (!newsletter.voice_input && !version?.summary) {
      setRegenError('Add some input first — record a voice memo or type your thoughts above.')
      return
    }

    setRegenError(null)
    setRegenerating(true)

    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-summary`
    const reqBody = { newsletter_id: id, audience_list_id: activeTab }
    console.log('[generate-summary] calling:', fnUrl)
    console.log('[generate-summary] body:', reqBody)

    const { data, error } = await supabase.functions.invoke('generate-summary', {
      body: reqBody,
    })

    console.log('[generate-summary] data:', data)
    console.log('[generate-summary] error:', error)
    if (error?.context) {
      console.log('[generate-summary] error.context:', error.context)
      try {
        const cloned = error.context.clone()
        const text = await cloned.text()
        console.log('[generate-summary] error body text:', text)
      } catch (e) {
        console.log('[generate-summary] could not read error body:', e)
      }
    }

    if (error) {
      let errorBody = {}
      try { errorBody = await error.context?.json() } catch { /* no-op */ }
      console.log('[generate-summary] parsed errorBody:', errorBody)
      const code = errorBody?.error ?? error?.message ?? 'Generation failed.'
      const msg = code === 'NO_INPUT'
        ? 'Add some input first — record a voice memo or type your thoughts above.'
        : (errorBody?.detail ? `${code}: ${errorBody.detail}` : code)
      setRegenError(msg)
      setRegenerating(false)
      return
    }

    if (data?.error) {
      const msg = data.error === 'NO_INPUT'
        ? 'Add some input first — record a voice memo or type your thoughts above.'
        : data.error
      setRegenError(msg)
      setRegenerating(false)
      return
    }

    // Update local version state with generated summary
    setVersions((prev) =>
      prev.map((v) =>
        v.audience_list_id === activeTab ? { ...v, summary: data.summary } : v
      )
    )
    // If a new version was created server-side, ensure it's in our list
    if (data.version_id && !versions.find((v) => v.audience_list_id === activeTab)) {
      const { data: newVersion } = await supabase
        .from('newsletter_versions')
        .select('id, audience_list_id, summary, status')
        .eq('id', data.version_id)
        .single()
      if (newVersion) setVersions((prev) => [...prev, newVersion])
    }

    setRegenerating(false)
  }

  // ── Load cached calendar events for the newsletter's month ──
  async function loadCalendarEvents() {
    if (!newsletter) return
    const monthYear = newsletter.period_start.slice(0, 7) // 'YYYY-MM'
    const { data } = await supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, location, all_day, calendar_name')
      .eq('user_id', user.id)
      .eq('month_year', monthYear)
      .order('start_time', { ascending: true })
    setCalendarEvents(data ?? [])
  }

  // ── Sync calendar from Google ──
  async function handleSyncCalendar() {
    if (!newsletter) return
    setSyncingCalendar(true)
    const date = new Date(newsletter.period_start)
    const { data, error } = await supabase.functions.invoke('fetch-calendar-events', {
      body: { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() },
    })
    if (!error && !data?.error) {
      await loadCalendarEvents()
    } else {
      let errorBody = {}
      try { errorBody = await error?.context?.json() } catch { /* no-op */ }
      console.error('Calendar sync error:', errorBody || data?.error || error?.message)
    }
    setSyncingCalendar(false)
  }

  // ── Extract content from voice/text note ──
  async function handleExtract(text) {
    const { data, error } = await supabase.functions.invoke('extract-content', {
      body: { transcript: text },
    })
    if (error || data?.error) {
      console.error('extract-content error:', error || data?.error)
      return
    }
    setExtractionResult(data)
  }

  // ── Generate captions via Edge Function ──
  async function handleGenerateCaptions(versionId) {
    setCaptioning(true)
    const { data, error } = await supabase.functions.invoke('generate-captions', {
      body: { newsletter_version_id: versionId },
    })
    if (!error && !data?.error) {
      // Trigger PhotoUpload to re-fetch its photos
      setCaptionRefreshKey((k) => k + 1)
      refreshAllPhotos()
    }
    setCaptioning(false)
  }

  // ── Open send modal ──
  function openSendModal(audienceListId) {
    let targets
    if (audienceListId) {
      targets = new Set([audienceListId])
    } else {
      targets = new Set(
        audienceLists
          .filter(a => { const v = getVersion(a.id); return v?.summary && v?.status !== 'sent' })
          .map(a => a.id)
      )
    }
    setSendTargets(targets)
    setSendModal(true)
  }

  // ── Send newsletter versions ──
  async function handleSend() {
    if (sending || sendTargets.size === 0) return
    setSending(true)
    let totalSent = 0
    const errs = []

    for (const alId of sendTargets) {
      const version = getVersion(alId)
      const audName = audienceLists.find(a => a.id === alId)?.name ?? 'audience'
      if (!version?.summary) continue
      setSendProgressMsg(`Sending to ${audName}…`)

      const { data, error } = await supabase.functions.invoke('send-newsletter', {
        body: { version_id: version.id },
      })

      if (error || data?.error) {
        errs.push(data?.error || error?.message || 'Send failed')
      } else {
        totalSent += data?.sent ?? 0
        setVersions(prev => prev.map(v =>
          v.id === version.id ? { ...v, status: 'sent', sent_at: new Date().toISOString() } : v
        ))
      }
    }

    setSending(false)
    setSendModal(false)
    setSendProgressMsg('')
    setSendTargets(new Set())

    if (errs.length === 0) {
      setNewsletter(prev => ({ ...prev, status: 'sent' }))
      setSendToast(`Sent to ${totalSent} ${totalSent === 1 ? 'person' : 'people'}!`)
    } else {
      setSendToast(`Sent with ${errs.length} error(s). Check console for details.`)
      console.error('Send errors:', errs)
    }
    setTimeout(() => setSendToast(null), 5000)
  }

  // ── Reset newsletter ──
  async function handleReset() {
    setResetting(true)

    const vIds = versions.map((v) => v.id)
    if (vIds.length > 0) {
      // Delete storage files
      const { data: photos } = await supabase
        .from('newsletter_photos')
        .select('storage_path')
        .in('newsletter_version_id', vIds)
      const paths = (photos ?? []).map((p) => p.storage_path).filter(Boolean)
      if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)

      // Delete DB rows
      await supabase.from('newsletter_photos').delete().in('newsletter_version_id', vIds)
      await supabase.from('newsletter_versions').delete().eq('newsletter_id', id)
    }

    // Reset newsletter fields
    await supabase
      .from('newsletters')
      .update({ voice_input: null, manual_content: {}, coming_up_next: [], status: 'draft' })
      .eq('id', id)

    // Reset local state
    setVersions([])
    setAllPhotos([])
    setNewsletter((prev) => ({ ...prev, voice_input: null, manual_content: {}, coming_up_next: [], status: 'draft' }))
    setManualContent({})
    setComingUpNext([])
    setVoiceInputExpanded(false)
    setActiveTab('all')
    setEditingId(null)
    setResetModal(false)
    setResetting(false)
  }

  if (!user || !newsletter) return null

  const badge = STATUS_STYLES[newsletter.status] ?? STATUS_STYLES.draft
  const tabs  = [{ id: 'all', label: 'All Audiences' }, ...audienceLists.map((a) => ({ id: a.id, label: a.name }))]

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar user={user} />

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* ── Top section ── */}
        <div>
          <Link to="/dashboard" className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors">
            ← Back to dashboard
          </Link>

          <div className="flex items-start justify-between gap-4 mt-3 flex-wrap">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-heading font-bold text-3xl text-warm-gray-900">
                  {formatMonth(newsletter.period_start)}
                </h1>
                <span className={badge.className}>{badge.label}</span>
              </div>
              <p className="text-warm-gray-400 text-sm mt-1">
                {audienceLists.length} audience{audienceLists.length !== 1 ? 's' : ''} · {versions.length} version{versions.length !== 1 ? 's' : ''} generated
              </p>
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Approve & Publish — opens all-audiences send modal */}
              {newsletter.status !== 'sent' && audienceLists.some(a => {
                const v = getVersion(a.id)
                return v?.summary && v?.status !== 'sent'
              }) && (
                <button
                  onClick={() => openSendModal(null)}
                  className="bg-sage-500 hover:bg-sage-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
                >
                  Approve & Publish
                </button>
              )}
              {/* Per-audience Send button */}
              {activeTab !== 'all' && (() => {
                const v   = getVersion(activeTab)
                const aud = audienceLists.find(a => a.id === activeTab)
                if (!v?.summary || v?.status === 'sent') return null
                return (
                  <button
                    onClick={() => openSendModal(activeTab)}
                    className="bg-terra-500 hover:bg-terra-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Send to {aud?.name}
                  </button>
                )
              })()}
              {activeTab !== 'all' && getVersion(activeTab) && (
                <a
                  href={`/update/${getVersion(activeTab).id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-cream-200 hover:bg-cream-300 text-warm-gray-800 text-sm font-medium px-5 py-2.5 rounded-lg border border-cream-300 transition-colors"
                >
                  Preview ↗
                </a>
              )}
              {activeTab !== 'all' && (
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="bg-cream-200 hover:bg-cream-300 disabled:opacity-60 text-warm-gray-800 text-sm font-medium px-5 py-2.5 rounded-lg border border-cream-300 transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {regenerating && (
                    <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  )}
                  {regenerating ? 'Generating…' : 'Regenerate Summary'}
                </button>
              )}
              <button
                onClick={() => setResetModal(true)}
                className="text-warm-gray-400 hover:text-red-500 text-sm font-medium px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
                title="Reset newsletter"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* ── Regen error banner ── */}
        {regenError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-red-600">{regenError}</p>
            <button onClick={() => setRegenError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none cursor-pointer shrink-0">×</button>
          </div>
        )}

        {/* ── Voice Input ── */}
        {newsletter.voice_input && !voiceInputExpanded ? (
          // Collapsed: show saved input as a compact summary
          <div
            className="bg-white border border-cream-300 rounded-xl px-5 py-4 flex items-start justify-between gap-4 cursor-pointer hover:border-cream-400 transition-colors"
            onClick={() => setVoiceInputExpanded(true)}
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-warm-gray-400 uppercase tracking-wide mb-1">Your input</p>
              <p className="text-sm text-warm-gray-600 line-clamp-2">{newsletter.voice_input}</p>
            </div>
            <span className="text-warm-gray-300 text-xs shrink-0 mt-0.5">Edit</span>
          </div>
        ) : (
          <VoiceRecorder
            newsletterId={id}
            initialValue={newsletter.voice_input ?? ''}
            onSaved={(text) => {
              setNewsletter((prev) => ({ ...prev, voice_input: text }))
              setVoiceInputExpanded(false)
            }}
            onExtract={handleExtract}
          />
        )}

        {/* ── What's On My Radar ── */}
        {(newsletter.voice_input || Object.values(manualContent).some(v => v?.title)) && (
          <div>
            <h2 className="font-heading font-semibold text-warm-gray-800 mb-3">What's On My Radar</h2>
            <ContentCards
              newsletterId={id}
              initialData={manualContent}
              extractionResult={extractionResult}
              onUpdate={(next) => setManualContent(next)}
            />
          </div>
        )}

        {/* ── Coming Up Next Month ── */}
        <ComingUpNext
          newsletterId={id}
          newsletterMonth={newsletter.period_start.slice(0, 7)}
          initialData={comingUpNext}
          onUpdate={(next) => setComingUpNext(next)}
        />

        {/* ── Audience tabs ── */}
        <div>
          <div className="flex gap-0 border-b border-cream-300 overflow-x-auto">
            {tabs.map((tab) => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setEditingId(null) }}
                  className={`shrink-0 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'text-terra-500 border-b-2 border-terra-500 -mb-px'
                      : 'text-warm-gray-400 hover:text-warm-gray-800'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* ── All Audiences overview ── */}
          {activeTab === 'all' && (
            <div className="mt-6 space-y-4">
              {audienceLists.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-cream-300 rounded-xl p-10 text-center space-y-3">
                  <p className="font-heading text-xl text-warm-gray-800">No audiences yet</p>
                  <p className="text-sm text-warm-gray-400">
                    Create audience lists first, then generate drafts for each one.
                  </p>
                  <Link
                    to="/audiences"
                    className="inline-block bg-terra-500 hover:bg-terra-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors mt-1"
                  >
                    Manage Audiences
                  </Link>
                </div>
              ) : (
                <>
                  {/* Audience cards */}
                  {audienceLists.map((audience) => {
                    const version = getVersion(audience.id)
                    const vBadge  = version ? (STATUS_STYLES[version.status] ?? STATUS_STYLES.draft) : null

                    return (
                      <div
                        key={audience.id}
                        className="bg-white border border-cream-300 rounded-xl p-5 flex items-start justify-between gap-4 cursor-pointer hover:border-terra-400 transition-colors"
                        onClick={() => { setActiveTab(audience.id); setEditingId(null) }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-heading font-semibold text-warm-gray-900">{audience.name}</p>
                            {vBadge && <span className={vBadge.className}>{vBadge.label}</span>}
                          </div>
                          {version?.summary ? (
                            <p className="text-sm text-warm-gray-500 mt-1 line-clamp-2">
                              {version.summary.slice(0, 120)}{version.summary.length > 120 ? '…' : ''}
                            </p>
                          ) : (
                            <p className="text-sm text-warm-gray-300 italic mt-1">No draft generated yet</p>
                          )}
                        </div>
                        <span className="text-warm-gray-400 shrink-0">→</span>
                      </div>
                    )
                  })}

                  {/* All-photos read-only grid */}
                  {allPhotos.length > 0 && (
                    <div className="bg-white border border-cream-300 rounded-xl shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-cream-300">
                        <h2 className="font-heading font-semibold text-warm-gray-800">
                          All Photos ({allPhotos.length})
                        </h2>
                      </div>
                      <div className="p-6">
                        <div className="grid grid-cols-3 gap-3">
                          {allPhotos.map((photo, i) => (
                            <div key={photo.id} className="space-y-1">
                              <div
                                className="rounded-lg overflow-hidden aspect-square bg-cream-200 cursor-zoom-in"
                                onClick={() => setAllPhotosLightbox(i)}
                              >
                                {photo.displayUrl && (
                                  <img
                                    src={photo.displayUrl}
                                    alt={photo.caption || ''}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              {photo.caption && (
                                <p className="text-xs text-warm-gray-500 truncate">{photo.caption}</p>
                              )}
                              {photo.taken_at && (
                                <p className="text-xs text-warm-gray-400">
                                  {new Date(photo.taken_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              )}
                              {photo.camera_info && (
                                <p className="text-xs text-warm-gray-300 truncate">{photo.camera_info}</p>
                              )}
                            </div>
                          ))}
                        </div>
                        {allPhotosLightbox !== null && (
                          <Lightbox
                            photos={allPhotos.map((p) => ({ displayUrl: p.displayUrl, caption: p.caption }))}
                            index={allPhotosLightbox}
                            onIndex={setAllPhotosLightbox}
                            onClose={() => setAllPhotosLightbox(null)}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Per-audience tab ── */}
          {activeTab !== 'all' && (() => {
            const audience = audienceLists.find((a) => a.id === activeTab)
            const version  = getVersion(activeTab)
            if (!audience) return null

            return (
              <div className="mt-6 space-y-5">

                {/* Summary card */}
                <div className="bg-white border border-cream-300 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-cream-300 flex items-center justify-between gap-3">
                    <h2 className="font-heading font-semibold text-warm-gray-800">Summary</h2>
                    {version && editingId !== version.id && (
                      <button
                        onClick={() => { setEditingId(version.id); setEditDraft(version.summary ?? '') }}
                        className="text-sm text-warm-gray-400 hover:text-terra-500 transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  <div className="p-6">
                    {!version ? (
                      <div className="text-center space-y-3 py-4">
                        <p className="text-sm text-warm-gray-400 italic">No draft for this audience yet.</p>
                        <button
                          onClick={() => handleGenerate(audience.id)}
                          disabled={generatingId === audience.id}
                          className="bg-terra-500 hover:bg-terra-600 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          {generatingId === audience.id ? 'Generating…' : 'Generate Draft'}
                        </button>
                      </div>
                    ) : editingId === version.id ? (
                      <div className="space-y-3">
                        <textarea
                          rows={8}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          className={textareaClass}
                          placeholder="Write or edit the summary for this audience…"
                        />
                        <div className="flex gap-3">
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(version.id)}
                            disabled={savingEdit}
                            className="text-sm text-terra-500 hover:text-terra-600 font-medium transition-colors cursor-pointer disabled:opacity-60"
                          >
                            {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : version.summary ? (
                      <p className="text-sm text-warm-gray-800 leading-relaxed whitespace-pre-wrap">
                        {version.summary}
                      </p>
                    ) : (
                      <p className="text-sm text-warm-gray-400 italic">
                        Draft exists but has no summary yet. Click Edit to write one.
                      </p>
                    )}
                  </div>
                </div>

                {/* Photos card */}
                <div className="bg-white border border-cream-300 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-cream-300 flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="font-heading font-semibold text-warm-gray-800">Photos</h2>
                    <div className="flex items-center gap-3 flex-wrap">
                      {version && (
                        <PhotoCurator
                          newsletterId={id}
                          versionId={version.id}
                          audienceId={audience.id}
                          audienceName={audience.name}
                          month={new Date(newsletter.period_start).getUTCMonth() + 1}
                          year={new Date(newsletter.period_start).getUTCFullYear()}
                          googlePhotosEnabled={googlePhotosEnabled}
                          googleConnected={googleConnected}
                          onImportComplete={() => {
                            refreshAllPhotos()
                            if (newsletter.voice_input) handleGenerateCaptions(version.id)
                          }}
                        />
                      )}
                      {version && newsletter.voice_input && (
                        <button
                          onClick={() => handleGenerateCaptions(version.id)}
                          disabled={captioning}
                          className="text-terra-500 hover:text-terra-600 disabled:opacity-50 text-sm transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          {captioning ? (
                            <>
                              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                              </svg>
                              Captioning…
                            </>
                          ) : '✨ Auto-caption'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-6">
                    {version ? (
                      <PhotoUpload
                        versionId={version.id}
                        userId={user.id}
                        onPhotoChange={refreshAllPhotos}
                        refreshTrigger={captionRefreshKey}
                      />
                    ) : (
                      <p className="text-sm text-warm-gray-400 italic text-center py-4">
                        Generate a draft first to add photos.
                      </p>
                    )}
                  </div>
                </div>

                {/* Music card */}
                <div className="bg-white border border-cream-300 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-cream-300">
                    <h2 className="font-heading font-semibold text-warm-gray-800">What I've Been Listening To</h2>
                  </div>
                  <div className="p-6">
                    <SpotifyMonthlyMusic
                      month={newsletter.period_start.slice(0, 7)}
                      spotifyConnected={spotifyConnected}
                    />
                  </div>
                </div>

                {/* Events card — mini calendar */}
                <div className="bg-white border border-cream-300 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-cream-300">
                    <h2 className="font-heading font-semibold text-warm-gray-800">Events</h2>
                  </div>
                  <div className="p-6">
                    <MiniCalendar
                      events={calendarEvents}
                      year={new Date(newsletter.period_start).getUTCFullYear()}
                      month={new Date(newsletter.period_start).getUTCMonth()}
                      googleConnected={googleConnected}
                      syncing={syncingCalendar}
                      onSync={handleSyncCalendar}
                    />
                  </div>
                </div>

                {/* Links placeholder */}
                <div className="bg-white border border-cream-300 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-cream-300">
                    <h2 className="font-heading font-semibold text-warm-gray-800">Links &amp; Highlights</h2>
                  </div>
                  <div className="p-6">
                    <div className="border-2 border-dashed border-cream-300 rounded-xl p-8 text-center text-warm-gray-400 text-sm">
                      Shared links and highlights will appear here
                    </div>
                  </div>
                </div>

              </div>
            )
          })()}
        </div>

      </main>

      {/* ── Send confirmation modal ── */}
      {sendModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-5 border-b border-cream-200">
              <h2 className="font-heading text-xl font-bold text-warm-gray-900">Send Newsletter</h2>
              <p className="text-sm text-warm-gray-500 mt-1">
                Choose which audiences to send this update to.
              </p>
            </div>

            <div className="px-6 py-4 space-y-1 max-h-72 overflow-y-auto">
              {audienceLists
                .filter(a => { const v = getVersion(a.id); return v?.summary && v?.status !== 'sent' })
                .map(audience => {
                  const isChecked = sendTargets.has(audience.id)
                  const count = memberCounts[audience.id] ?? 0
                  return (
                    <label
                      key={audience.id}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-cream-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSendTargets(prev => {
                            const next = new Set(prev)
                            if (next.has(audience.id)) next.delete(audience.id)
                            else next.add(audience.id)
                            return next
                          })
                        }}
                        disabled={sending}
                        className="w-4 h-4 cursor-pointer accent-terra-500"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-warm-gray-900 text-sm">{audience.name}</p>
                        <p className="text-xs text-warm-gray-400">
                          {count} recipient{count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </label>
                  )
                })}
              {audienceLists.filter(a => { const v = getVersion(a.id); return v?.summary && v?.status !== 'sent' }).length === 0 && (
                <p className="text-sm text-warm-gray-400 italic px-3 py-2">
                  No unsent drafts available. Generate summaries first.
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-cream-200 flex items-center justify-between gap-4">
              {sending ? (
                <p className="text-sm text-warm-gray-500 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  {sendProgressMsg || 'Sending…'}
                </p>
              ) : (
                <button
                  onClick={() => { setSendModal(false); setSendTargets(new Set()) }}
                  className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={sending || sendTargets.size === 0}
                className="bg-sage-500 hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                {sending ? 'Sending…' : (() => {
                  const total = [...sendTargets].reduce((sum, id) => sum + (memberCounts[id] ?? 0), 0)
                  return `Send to ${total} ${total === 1 ? 'person' : 'people'}`
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send toast ── */}
      {sendToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-warm-gray-900 text-white text-sm font-medium px-5 py-3 rounded-full shadow-xl whitespace-nowrap">
          {sendToast}
        </div>
      )}

      {/* ── Reset confirmation modal ── */}
      {resetModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-5 border-b border-cream-200">
              <h2 className="font-heading text-xl font-bold text-warm-gray-900">Reset Newsletter?</h2>
              <p className="text-sm text-warm-gray-500 mt-2">
                This will clear your voice input, all content cards, all photos, and all generated drafts.
                The newsletter period and title are kept. This can't be undone.
              </p>
            </div>
            <div className="px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setResetModal(false)}
                disabled={resetting}
                className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
              >
                {resetting && (
                  <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                )}
                {resetting ? 'Resetting…' : 'Yes, Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
