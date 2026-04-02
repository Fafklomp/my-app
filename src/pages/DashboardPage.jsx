import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import ConnectGoogle from '../components/ConnectGoogle'
import { STATUS_STYLES } from '../lib/constants'

function formatMonth(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function monthAbbr(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
}


export default function DashboardPage() {
  const navigate = useNavigate()
  const [user, setUser]                   = useState(null)
  const [loading, setLoading]             = useState(true)
  const [newsletters, setNewsletters]     = useState([])
  const [photoCount, setPhotoCount]       = useState(0)
  const [audienceLists, setAudienceLists] = useState([])
  const [memberCounts, setMemberCounts]   = useState({})
  const [googleConnected,     setGoogleConnected]     = useState(false)
  const [googlePhotosEnabled, setGooglePhotosEnabled] = useState(false)
  const [toastMsg, setToastMsg]                       = useState(null)

  useEffect(() => {
    // onAuthStateChange fires reliably after OAuth redirects (unlike getSession which
    // may run before Supabase has finished exchanging the auth code for a session).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] event:', event)
      console.log('[Auth] user:', session?.user?.id ?? 'none')
      console.log('[Auth] provider_token:', session?.provider_token ? 'YES' : 'NO')
      console.log('[Auth] provider_refresh_token:', session?.provider_refresh_token ? 'YES' : 'NO')

      if (!session) {
        navigate('/', { replace: true })
        return
      }

      setUser(session.user)

      // Only fetch data on the initial load events, not on every token refresh
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        fetchAll(session.user.id)
      }

      // Capture Google provider_token whenever it's present in the session.
      // This fires right after the Google OAuth redirect completes.
      if (session.provider_token) {
        console.log('[Auth] Saving Google token to DB...')
        const wasConnected = googleConnected
        await persistGoogleToken(session.user.id, session.provider_token, session.provider_refresh_token)
        console.log('[Auth] Token saved. google_photos_scope will be set to true.')
        setGoogleConnected(true)
        setGooglePhotosEnabled(true)
        setToastMsg(wasConnected ? 'Google reconnected successfully!' : 'Google Calendar & Photos connected!')
        setTimeout(() => setToastMsg(null), 4000)
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  async function persistGoogleToken(userId, accessToken, refreshToken) {
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()
    await supabase.from('user_oauth_tokens').upsert(
      {
        user_id:                 userId,
        google_access_token:     accessToken,
        google_refresh_token:    refreshToken ?? null,
        google_token_expires_at: expiresAt,
        google_photos_scope:     true, // Both calendar + photos scopes are now always requested
        updated_at:              new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
  }

  async function fetchAll(userId) {
    const [
      { data: newsletterData },
      { data: versionData },
      { data: audienceData },
      { data: memberData },
    ] = await Promise.all([
      supabase
        .from('newsletters')
        .select('id, title, status, period_start, period_end')
        .eq('user_id', userId)
        .order('period_start', { ascending: false }),
      supabase
        .from('newsletter_versions')
        .select('id, newsletter_id'),
      supabase
        .from('audience_lists')
        .select('id, name, description')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
      supabase
        .from('audience_members')
        .select('audience_list_id')
        .eq('user_id', userId),
    ])

    const allNewsletters = newsletterData ?? []
    const allVersions    = versionData ?? []
    const allAudiences   = audienceData ?? []
    const allMembers     = memberData ?? []

    setNewsletters(allNewsletters)
    setAudienceLists(allAudiences)

    // Member counts per audience list
    const counts = {}
    allMembers.forEach(({ audience_list_id }) => {
      counts[audience_list_id] = (counts[audience_list_id] ?? 0) + 1
    })
    setMemberCounts(counts)

    // Photo count for the most recent newsletter
    const current = allNewsletters[0]
    if (current) {
      const currentVersionIds = allVersions
        .filter((v) => v.newsletter_id === current.id)
        .map((v) => v.id)

      if (currentVersionIds.length > 0) {
        const { count } = await supabase
          .from('newsletter_photos')
          .select('id', { count: 'exact', head: true })
          .in('newsletter_version_id', currentVersionIds)
        setPhotoCount(count ?? 0)
      }
    }

    setLoading(false)
  }

  if (!user) return null

  const current = newsletters[0] ?? null
  const past    = newsletters.slice(1)
  const badge   = current ? (STATUS_STYLES[current.status] ?? STATUS_STYLES.draft) : null

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar user={user} />

      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-sage-500 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toastMsg}
        </div>
      )}

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">

        {/* ── Section 1: Hero Header ── */}
        <section>
          <h1 className="font-heading font-bold text-4xl text-warm-gray-900">
            Your Life, Summarized
          </h1>
          <p className="text-warm-gray-400 text-base mt-3">
            Automated monthly updates for the people who matter.
          </p>
          <p className="text-warm-gray-400 text-base">
            Review, approve, share.
          </p>
        </section>

        {/* ── Section 2: Current Newsletter Card ── */}
        <section>
          {loading ? (
            <p className="text-warm-gray-400 text-sm">Loading…</p>
          ) : !current ? (
            <div className="bg-white border-2 border-dashed border-cream-300 rounded-2xl p-10 text-center space-y-3">
              <p className="font-heading font-semibold text-warm-gray-800 text-lg">
                No newsletter yet
              </p>
              <p className="text-sm text-warm-gray-400">
                Create your first newsletter to get started.
              </p>
              <Link
                to="/newsletters/new"
                className="inline-block bg-terra-500 hover:bg-terra-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors mt-2"
              >
                + New Newsletter
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-cream-300 rounded-2xl shadow-sm p-6 space-y-5">
              {/* Top row */}
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-heading font-semibold text-2xl text-warm-gray-900">
                  {formatMonth(current.period_start)}
                </h2>
                <span className={badge.className}>{badge.label}</span>
                <Link
                  to={`/newsletters/${current.id}`}
                  className="ml-auto bg-terra-500 hover:bg-terra-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors shrink-0"
                >
                  Review Draft →
                </Link>
              </div>

              {/* Subtitle */}
              <p className="text-sm text-warm-gray-400">
                {badge.label} · {photoCount} photo{photoCount !== 1 ? 's' : ''} · 0 events
              </p>

              {/* Photo area */}
              {photoCount > 0 ? (
                <div className="flex gap-3 overflow-x-auto">
                  {/* Thumbnails would render here when photos exist */}
                </div>
              ) : (
                <div className="border-2 border-dashed border-cream-300 rounded-xl p-8 text-center text-warm-gray-400 text-sm">
                  Photos will appear here once you connect Google Photos
                </div>
              )}

            </div>
          )}
        </section>

        {/* ── Section 3: Audience Lists ── */}
        <section className="space-y-4">
          <h2 className="font-heading font-semibold text-xl text-warm-gray-900">
            Your Audiences
          </h2>

          {loading ? (
            <p className="text-sm text-warm-gray-400">Loading…</p>
          ) : audienceLists.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-cream-300 rounded-xl p-8 text-center space-y-3">
              <p className="font-semibold text-warm-gray-800">No audiences yet</p>
              <p className="text-sm text-warm-gray-400">
                Create audience lists to send personalized updates to different groups
              </p>
              <Link
                to="/audiences"
                className="inline-block bg-terra-500 hover:bg-terra-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors mt-1"
              >
                Create Audience List
              </Link>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {audienceLists.map((list) => (
                <div
                  key={list.id}
                  className="bg-white border border-cream-300 rounded-xl p-5 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-warm-gray-800">{list.name}</p>
                    {list.description && (
                      <p className="text-sm text-warm-gray-400 mt-0.5 line-clamp-2">
                        {list.description}
                      </p>
                    )}
                    <p className="text-xs text-warm-gray-400 mt-1.5">
                      {memberCounts[list.id] ?? 0} member{(memberCounts[list.id] ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="text-warm-gray-400 shrink-0">→</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Section 4: Past Updates ── */}
        <section className="space-y-4">
          <h2 className="font-heading font-semibold text-xl text-warm-gray-900">
            Past Updates
          </h2>

          {loading ? (
            <p className="text-sm text-warm-gray-400">Loading…</p>
          ) : past.length === 0 ? (
            <p className="text-sm text-warm-gray-400">No past updates yet.</p>
          ) : (
            <ul className="space-y-2">
              {past.map((n) => {
                const b = STATUS_STYLES[n.status] ?? STATUS_STYLES.draft
                return (
                  <li key={n.id} className="flex items-center gap-4 bg-white border border-cream-300 rounded-xl px-5 py-4">
                    {/* Month circle */}
                    <div className="bg-cream-200 rounded-full w-10 h-10 flex items-center justify-center text-xs font-medium text-warm-gray-600 shrink-0">
                      {monthAbbr(n.period_start)}
                    </div>

                    {/* Title + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-semibold text-warm-gray-800 truncate">
                        {n.title}
                      </p>
                      <p className="text-xs text-warm-gray-400 mt-0.5">
                        0 photos · 0 events
                      </p>
                    </div>

                    {/* Badge + link */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={b.className}>{b.label}</span>
                      <Link
                        to={`/newsletters/${n.id}`}
                        className="text-warm-gray-400 hover:text-terra-500 transition-colors"
                      >
                        →
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ── Section 5: Connected Services ── */}
        <section className="space-y-4">
          <h2 className="font-heading font-semibold text-xl text-warm-gray-900">
            Connected Services
          </h2>
          <div className="bg-white border border-cream-300 rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-semibold text-warm-gray-800">Google Calendar &amp; Photos</p>
              <p className="text-sm text-warm-gray-400 mt-0.5">
                Sync events and pull photos into your newsletter automatically.
              </p>
            </div>
            <ConnectGoogle
              onStatusChange={(connected, photosEnabled) => {
                setGoogleConnected(connected)
                setGooglePhotosEnabled(photosEnabled)
              }}
              forceConnected={googleConnected || undefined}
              forcePhotosEnabled={googlePhotosEnabled || undefined}
            />
          </div>
        </section>

      </main>
    </div>
  )
}
