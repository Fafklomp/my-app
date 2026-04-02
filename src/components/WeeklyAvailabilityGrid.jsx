import { useState, useEffect, useRef } from 'react'
import EventPopover from './EventPopover'
import {
  HOUR_HEIGHT, START_HOUR, END_HOUR, GRID_HEIGHT,
  DAY_NAMES_SHORT, isToday, categorizeEvent, CATEGORY_TILE, CATEGORY_LABEL,
  layoutDayEvents, formatWeekRange,
} from '../lib/calendarUtils'

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

function formatHour(h) {
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

// Current-time red line position (null if outside visible range)
function useCurrentTimePx() {
  const [px, setPx] = useState(null)
  useEffect(() => {
    function update() {
      const now = new Date()
      const h = now.getHours() + now.getMinutes() / 60
      setPx(h >= START_HOUR && h <= END_HOUR ? (h - START_HOUR) * HOUR_HEIGHT : null)
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])
  return px
}

// ── EventTile ─────────────────────────────────────────────────
function EventTile({ event, isOwner, isHidden, onToggleHide, onPopover }) {
  const cat   = categorizeEvent(event.title)
  const tileClass = isHidden
    ? 'bg-warm-gray-100 text-warm-gray-400 border-l-2 border-warm-gray-300 opacity-60'
    : CATEGORY_TILE[cat]

  const widthPct = 100 / (event.totalCols || 1)
  const leftPct  = (event.col || 0) * widthPct

  const top    = event.startMin * (HOUR_HEIGHT / 60)
  const height = Math.max(18, (event.endMin - event.startMin) * (HOUR_HEIGHT / 60))

  // Show as "Busy" if masked for public view
  const displayTitle = event.masked ? 'Busy' : event.title

  return (
    <div
      className={`absolute rounded-md px-1.5 py-0.5 text-xs leading-tight overflow-hidden cursor-pointer select-none ${tileClass}`}
      style={{
        top:    `${top}px`,
        height: `${height}px`,
        left:   `calc(${leftPct}% + 1px)`,
        width:  `calc(${widthPct}% - 3px)`,
        zIndex: 2,
      }}
      onClick={e => { e.stopPropagation(); onPopover(e, event) }}
    >
      <span className="font-medium truncate block">{displayTitle}</span>
      {height > 28 && !event.masked && (
        <span className="opacity-70 truncate block">{formatHour(START_HOUR + Math.floor(event.startMin / 60))}</span>
      )}

      {/* Owner visibility toggle */}
      {isOwner && !event.masked && (
        <button
          onClick={e => { e.stopPropagation(); onToggleHide(event.id) }}
          className="absolute top-0.5 right-0.5 text-[10px] opacity-50 hover:opacity-100 cursor-pointer"
          title={isHidden ? 'Make visible' : 'Hide from recipients'}
        >
          {isHidden ? '🚫' : '👁️'}
        </button>
      )}
    </div>
  )
}

// ── WeeklyAvailabilityGrid ────────────────────────────────────
/**
 * Props:
 *   weekDates      — array of 7 Date objects (Mon–Sun)
 *   events         — array of calendar_events rows (all raw, pre-masking)
 *   hiddenEventIds — Set<string> of event IDs the owner has hidden
 *   isOwner        — bool
 *   viewerTz       — IANA timezone string
 *   onToggleHide   — fn(eventId) — called when owner clicks eye toggle
 */
export default function WeeklyAvailabilityGrid({
  weekDates, events, hiddenEventIds, isOwner, viewerTz, onToggleHide,
}) {
  const [popover, setPopover] = useState(null)  // { event, x, y }
  const currentTimePx = useCurrentTimePx()

  function handlePopover(e, event) {
    setPopover({ event, x: e.clientX, y: e.clientY })
  }

  // Prepare events for each day: apply masking, layout
  function getDayData(dayDate) {
    // Apply masking: hidden events show as generic "Busy" to recipients
    const maskedEvents = events.map(ev => {
      if (hiddenEventIds.has(ev.id) && !isOwner) {
        return { ...ev, title: 'Busy', location: null, calendar_name: null, description: null, masked: true }
      }
      return ev
    })
    const { timedEvents, allDayEvents } = layoutDayEvents(maskedEvents, dayDate, viewerTz)
    // Tag hidden events on timed list so owner can see them styled differently
    const tagged = timedEvents.map(ev => ({ ...ev, isHiddenByOwner: hiddenEventIds.has(ev.id) }))
    return { timedEvents: tagged, allDayEvents }
  }

  const dayData = weekDates.map(getDayData)

  // Check if any day has all-day events to show that banner row
  const hasAllDay = dayData.some(d => d.allDayEvents.length > 0)

  return (
    <div
      className="rounded-2xl border border-cream-300 shadow-sm bg-white overflow-hidden"
      onClick={() => setPopover(null)}
    >
      {/* ── Day headers ── */}
      <div className="flex border-b border-cream-300 sticky top-0 z-10 bg-white">
        <div className="w-14 shrink-0" />
        {weekDates.map((date, i) => {
          const today = isToday(date)
          return (
            <div
              key={i}
              className={`flex-1 min-w-[80px] text-center py-2.5 border-l border-cream-200 ${today ? 'border-t-2 border-t-terra-500' : ''}`}
            >
              <p className="text-xs text-warm-gray-400 font-medium">{DAY_NAMES_SHORT[i]}</p>
              <p className={`text-lg font-bold mt-0.5 w-8 h-8 flex items-center justify-center mx-auto rounded-full ${
                today ? 'bg-terra-500 text-white' : 'text-warm-gray-800'
              }`}>
                {date.getDate()}
              </p>
            </div>
          )
        })}
      </div>

      {/* ── All-day event banner ── */}
      {hasAllDay && (
        <div className="flex border-b border-cream-200 bg-cream-50">
          <div className="w-14 shrink-0 flex items-start justify-end pr-2 pt-1">
            <span className="text-[10px] text-warm-gray-400 leading-none">All day</span>
          </div>
          {dayData.map((d, i) => (
            <div key={i} className="flex-1 min-w-[80px] border-l border-cream-200 p-1 space-y-0.5">
              {d.allDayEvents.slice(0, 3).map(ev => {
                const masked = hiddenEventIds.has(ev.id) && !isOwner
                const displayTitle = masked ? 'Busy' : ev.title
                return (
                  <div
                    key={ev.id}
                    className="text-xs rounded px-1.5 py-0.5 truncate bg-cream-200 text-warm-gray-600 cursor-pointer hover:opacity-80"
                    onClick={e => { e.stopPropagation(); handlePopover(e, { ...ev, title: displayTitle, masked }) }}
                  >
                    {displayTitle}
                  </div>
                )
              })}
              {d.allDayEvents.length > 3 && (
                <div className="text-[10px] text-warm-gray-400 pl-1">+{d.allDayEvents.length - 3} more</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Scrollable time grid ── */}
      <div className="overflow-x-auto">
        <div className="flex min-w-[560px]" style={{ height: `${GRID_HEIGHT}px` }}>

          {/* Time gutter */}
          <div className="w-14 shrink-0 relative select-none" style={{ height: `${GRID_HEIGHT}px` }}>
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute right-2 text-xs text-warm-gray-400"
                style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 8 }}
              >
                {formatHour(h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((date, i) => {
            const today = isToday(date)
            return (
              <div
                key={i}
                className={`flex-1 min-w-[80px] relative border-l border-cream-200 ${today ? 'bg-terra-500/[0.03]' : ''}`}
                style={{ height: `${GRID_HEIGHT}px` }}
              >
                {/* Hour rules */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-cream-200 pointer-events-none"
                    style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                  />
                ))}
                {/* Half-hour rules */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-cream-100 pointer-events-none"
                    style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {/* Current time line */}
                {today && currentTimePx !== null && (
                  <div
                    className="absolute inset-x-0 z-10 pointer-events-none flex items-center"
                    style={{ top: currentTimePx }}
                  >
                    <div className="w-2 h-2 rounded-full bg-terra-500 -ml-1 shrink-0" />
                    <div className="flex-1 h-px bg-terra-500" />
                  </div>
                )}

                {/* Timed events */}
                {dayData[i].timedEvents.map(ev => (
                  <EventTile
                    key={ev.id}
                    event={ev}
                    isOwner={isOwner}
                    isHidden={ev.isHiddenByOwner}
                    onToggleHide={onToggleHide}
                    onPopover={handlePopover}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center justify-center gap-5 px-4 py-3 border-t border-cream-200 bg-cream-50 flex-wrap">
        {[['social', 'bg-terra-500'], ['academic', 'bg-blue-400'], ['travel', 'bg-sage-500'], ['other', 'bg-warm-gray-400']].map(([cat, dot]) => (
          <span key={cat} className="flex items-center gap-1.5 text-xs text-warm-gray-500">
            <span className={`w-2 h-2 rounded-full ${dot} inline-block`} />
            {CATEGORY_LABEL[cat]}
          </span>
        ))}
      </div>

      {/* ── Popover ── */}
      {popover && (
        <EventPopover
          event={popover.event}
          x={popover.x}
          y={popover.y}
          tz={viewerTz}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}
