import { useState, useMemo } from 'react'
import ConnectGoogle from './ConnectGoogle'
import {
  buildMonthGrid, MONTH_NAMES,
  categorizeEvent, CATEGORY_DOT, CATEGORY_TILE,
} from '../lib/calendarUtils'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toDateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/**
 * Props:
 *   events         — array of calendar_events rows for this newsletter's month
 *   year           — 4-digit year (from newsletter.period_start)
 *   month          — 0-indexed month
 *   googleConnected — bool
 *   syncing        — bool
 *   onSync         — fn() — trigger calendar sync
 */
export default function MiniCalendar({ events, year, month, googleConnected, syncing, onSync }) {
  const [selectedKey, setSelectedKey] = useState(null)
  const weeks = buildMonthGrid(year, month)
  const today = new Date()

  // Group events by local calendar day
  const eventsByDay = useMemo(() => {
    const map = {}
    events.forEach(ev => {
      const d = new Date(ev.start_time)
      const key = toDateKey(d)
      if (!map[key]) map[key] = []
      map[key].push(ev)
    })
    return map
  }, [events])

  const selectedEvents = useMemo(() => {
    if (!selectedKey) return []
    return eventsByDay[selectedKey] ?? []
  }, [selectedKey, eventsByDay])

  const totalEvents = events.length

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <p className="text-warm-gray-500 text-sm">
          {totalEvents} event{totalEvents !== 1 ? 's' : ''} this month
        </p>
        {googleConnected && (
          <button
            onClick={onSync}
            disabled={syncing}
            className="text-xs text-warm-gray-400 hover:text-terra-500 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
          >
            {syncing ? (
              <>
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Syncing…
              </>
            ) : '↻ Sync'}
          </button>
        )}
      </div>

      {/* ── No connection state ── */}
      {!googleConnected && events.length === 0 && (
        <div className="text-center py-4 space-y-3">
          <p className="text-sm text-warm-gray-400">Connect Google Calendar to pull in your events.</p>
          <ConnectGoogle />
        </div>
      )}

      {/* ── Calendar grid ── */}
      {(events.length > 0 || googleConnected) && (
        <div>
          <p className="text-xs font-medium text-warm-gray-500 text-center mb-2">
            {MONTH_NAMES[month]} {year}
          </p>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DOW.map(d => (
              <div key={d} className="text-warm-gray-400 text-[10px] font-medium text-center py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-y-1">
              {week.map(({ date, inMonth }) => {
                const key      = toDateKey(date)
                const dayEvs   = eventsByDay[key] ?? []
                const isT      = date.getFullYear() === today.getFullYear() &&
                                  date.getMonth()    === today.getMonth()    &&
                                  date.getDate()     === today.getDate()
                const selected = key === selectedKey

                return (
                  <div
                    key={key}
                    className={`flex flex-col items-center py-0.5 cursor-pointer rounded-lg transition-colors ${
                      selected ? 'bg-cream-200' : 'hover:bg-cream-100'
                    } ${!inMonth ? 'opacity-30 pointer-events-none' : ''}`}
                    onClick={() => setSelectedKey(selected ? null : key)}
                  >
                    <span className={`w-7 h-7 flex items-center justify-center text-xs rounded-full font-medium ${
                      isT ? 'bg-terra-500 text-white' : 'text-warm-gray-800'
                    }`}>
                      {date.getDate()}
                    </span>
                    {/* Event dots (up to 3) */}
                    {dayEvs.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 h-1.5">
                        {dayEvs.slice(0, 3).map((ev, j) => (
                          <div
                            key={j}
                            className={`w-1 h-1 rounded-full ${CATEGORY_DOT[categorizeEvent(ev.title)]}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Expanded day panel ── */}
      {selectedKey && selectedEvents.length > 0 && (
        <div className="border border-cream-300 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-cream-50 border-b border-cream-200">
            <p className="text-xs font-medium text-warm-gray-600">
              {new Date(selectedEvents[0].start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="divide-y divide-cream-200">
            {selectedEvents
              .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
              .map(ev => {
                const cat = categorizeEvent(ev.title)
                return (
                  <div key={ev.id} className={`flex gap-3 px-4 py-3 items-start border-l-2 ${CATEGORY_TILE[cat].split(' ').find(c => c.startsWith('border-l'))}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-warm-gray-800">{ev.title}</p>
                      <p className="text-xs text-warm-gray-400 mt-0.5">
                        {ev.all_day ? 'All day' : `${formatTime(ev.start_time)}${ev.end_time ? ` – ${formatTime(ev.end_time)}` : ''}`}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

    </div>
  )
}
