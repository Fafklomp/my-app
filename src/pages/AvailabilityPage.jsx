import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import ConnectGoogle from '../components/ConnectGoogle'
import WeeklyAvailabilityGrid from '../components/WeeklyAvailabilityGrid'
import {
  getMondayOf, getWeekDates, monthYearsForWeek, formatWeekRange, isToday,
} from '../lib/calendarUtils'

// ── Timezone helpers ──────────────────────────────────────────
const TZ_OPTIONS = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Amsterdam', 'Africa/Johannesburg', 'Asia/Dubai',
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
]

function detectTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone }
  catch { return 'America/New_York' }
}

// ── Component ─────────────────────────────────────────────────
export default function AvailabilityPage() {
  const [searchParams] = useSearchParams()
  const targetUserId   = searchParams.get('user')

  const [authUser,  setAuthUser]  = useState(undefined) // undefined = not checked
  const [ownerId,   setOwnerId]   = useState(null)
  const [isOwner,   setIsOwner]   = useState(false)

  const [viewerTz,  setViewerTz]  = useState(detectTz)
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()))

  const [events,         setEvents]         = useState([])
  const [hiddenEventIds, setHiddenEventIds] = useState(new Set())
  const [googleConnected, setGoogleConnected] = useState(false)
  const [loadingEvents,  setLoadingEvents]  = useState(false)
  const [syncing,        setSyncing]        = useState(false)
  const [noCalendar,     setNoCalendar]     = useState(false) // public view, no data at all

  const weekDates = getWeekDates(weekStart)

  // ── Auth & ownership ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null
      setAuthUser(user)
      if (targetUserId) {
        setOwnerId(targetUserId)
        setIsOwner(user?.id === targetUserId)
      } else if (user) {
        setOwnerId(user.id)
        setIsOwner(true)
      } else {
        setOwnerId(null)
        setIsOwner(false)
      }
    })
  }, [targetUserId])

  // ── Fetch events for the displayed week ──
  const fetchEvents = useCallback(async () => {
    if (!ownerId) return
    setLoadingEvents(true)

    const months = monthYearsForWeek(weekStart)

    const [evResult, hiddenResult] = await Promise.all([
      supabase
        .from('calendar_events')
        .select('id, title, start_time, end_time, all_day, location, calendar_name')
        .eq('user_id', ownerId)
        .in('month_year', months),
      supabase
        .from('hidden_events')
        .select('calendar_event_id')
        .eq('user_id', ownerId),
    ])

    const evs = evResult.data ?? []
    setEvents(evs)
    setNoCalendar(evs.length === 0 && !isOwner)
    setHiddenEventIds(new Set((hiddenResult.data ?? []).map(h => h.calendar_event_id)))
    setLoadingEvents(false)
  }, [ownerId, weekStart, isOwner])

  useEffect(() => {
    if (ownerId !== null && authUser !== undefined) fetchEvents()
  }, [ownerId, authUser, weekStart, fetchEvents])

  // ── Week navigation ──
  function prevWeek() {
    setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
  }
  function nextWeek() {
    setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })
  }
  function goToday() { setWeekStart(getMondayOf(new Date())) }

  // ── Toggle hidden events (owner only) ──
  async function handleToggleHide(eventId) {
    if (!authUser) return
    if (hiddenEventIds.has(eventId)) {
      await supabase.from('hidden_events').delete()
        .eq('user_id', authUser.id).eq('calendar_event_id', eventId)
      setHiddenEventIds(prev => { const s = new Set(prev); s.delete(eventId); return s })
    } else {
      await supabase.from('hidden_events').insert({ user_id: authUser.id, calendar_event_id: eventId })
      setHiddenEventIds(prev => new Set([...prev, eventId]))
    }
  }

  // ── Calendar sync (owner only) ──
  async function handleSync() {
    if (!authUser) return
    setSyncing(true)
    const months = monthYearsForWeek(weekStart)
    for (const my of months) {
      const [y, m] = my.split('-').map(Number)
      await supabase.functions.invoke('fetch-calendar-events', { body: { month: m, year: y } })
    }
    await fetchEvents()
    setSyncing(false)
  }

  const stillLoading = authUser === undefined

  return (
    <div className="min-h-screen bg-cream-100">
      {authUser && <Navbar user={authUser} />}

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-heading text-3xl font-bold text-warm-gray-900">Availability</h1>
            <p className="text-warm-gray-400 text-base mt-1">
              See what I'm up to and when I'm free to catch up.
            </p>
          </div>

          {/* Owner controls */}
          {isOwner && (
            <div className="flex items-center gap-2 flex-wrap">
              {googleConnected ? (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="bg-cream-200 hover:bg-cream-300 disabled:opacity-60 text-warm-gray-800 text-sm font-medium px-4 py-2 rounded-lg border border-cream-300 transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {syncing && (
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  )}
                  {syncing ? 'Syncing…' : '↻ Sync Calendar'}
                </button>
              ) : (
                <ConnectGoogle onStatusChange={setGoogleConnected} />
              )}
            </div>
          )}
        </div>

        {/* ── Timezone bar ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-warm-gray-400">Showing times in</span>
          <select
            value={viewerTz}
            onChange={e => setViewerTz(e.target.value)}
            className="text-sm text-warm-gray-700 bg-white border border-cream-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-terra-500/30"
          >
            {/* Current tz always shown even if not in list */}
            {!TZ_OPTIONS.includes(viewerTz) && (
              <option value={viewerTz}>{viewerTz}</option>
            )}
            {TZ_OPTIONS.map(tz => (
              <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {/* ── No owner found ── */}
        {!stillLoading && !ownerId && (
          <div className="bg-white border border-cream-300 rounded-xl p-8 text-center space-y-2">
            <p className="font-heading text-xl text-warm-gray-800">No calendar found</p>
            <p className="text-sm text-warm-gray-400">
              Sign in to manage your availability, or use a shared link to view someone's calendar.
            </p>
          </div>
        )}

        {/* ── Calendar not connected (public view) ── */}
        {!isOwner && noCalendar && !loadingEvents && (
          <div className="bg-white border border-cream-300 rounded-xl p-10 text-center space-y-2">
            <p className="font-heading text-xl text-warm-gray-800">Calendar hasn't been connected yet</p>
            <p className="text-sm text-warm-gray-400">Check back soon!</p>
          </div>
        )}

        {/* ── Week navigation + Grid ── */}
        {(ownerId || !noCalendar) && ownerId && (
          <>
            {/* Week nav */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={prevWeek}
                className="text-warm-gray-400 hover:text-warm-gray-600 text-xl cursor-pointer w-9 h-9 flex items-center justify-center rounded-lg hover:bg-cream-200 transition-colors"
              >
                ‹
              </button>
              <h2 className="font-heading text-lg font-semibold text-warm-gray-900 flex-1 text-center sm:text-left">
                {formatWeekRange(weekDates)}
              </h2>
              <button
                onClick={nextWeek}
                className="text-warm-gray-400 hover:text-warm-gray-600 text-xl cursor-pointer w-9 h-9 flex items-center justify-center rounded-lg hover:bg-cream-200 transition-colors"
              >
                ›
              </button>
              {!isToday(weekDates[0]) && (
                <button
                  onClick={goToday}
                  className="text-terra-500 text-sm font-medium hover:text-terra-600 transition-colors cursor-pointer"
                >
                  Today
                </button>
              )}
            </div>

            {/* Owner tip about hiding events */}
            {isOwner && events.length > 0 && (
              <p className="text-xs text-warm-gray-400">
                👁️ Click the eye icon on any event to hide it from recipients — they'll see it as "Busy."
              </p>
            )}

            {/* Grid */}
            {stillLoading || loadingEvents ? (
              <div className="bg-white border border-cream-300 rounded-2xl p-10 text-center">
                <p className="text-sm text-warm-gray-400">Loading…</p>
              </div>
            ) : (
              <WeeklyAvailabilityGrid
                weekDates={weekDates}
                events={events}
                hiddenEventIds={hiddenEventIds}
                isOwner={isOwner}
                viewerTz={viewerTz}
                onToggleHide={handleToggleHide}
              />
            )}
          </>
        )}

        {/* ── Footer CTA ── */}
        {!isOwner && ownerId && !noCalendar && (
          <p className="text-center text-warm-gray-400 text-sm py-2">
            Want to catch up? Message me with a time that works!
          </p>
        )}

      </main>
    </div>
  )
}
