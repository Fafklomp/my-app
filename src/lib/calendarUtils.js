// ── Constants ─────────────────────────────────────────────────
export const HOUR_HEIGHT = 64   // px per hour (1px per 0.9375 minutes)
export const START_HOUR  = 8    // 8:00 AM
export const END_HOUR    = 21   // 9:00 PM
export const GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT  // 832px

export const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ── Timezone conversion ───────────────────────────────────────
/**
 * Returns { year, month (1-indexed), day, hour (0-23), minute } for an ISO
 * string expressed in the given IANA timezone.
 */
export function tzParts(isoString, tz) {
  if (!isoString) return null
  try {
    const date = new Date(isoString)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year:     'numeric',
      month:    'numeric',
      day:      'numeric',
      hour:     'numeric',
      minute:   'numeric',
      hour12:   false,
    }).formatToParts(date)
    const p = {}
    parts.forEach(({ type, value }) => { if (type !== 'literal') p[type] = value })
    return {
      year:   parseInt(p.year),
      month:  parseInt(p.month),            // 1-indexed
      day:    parseInt(p.day),
      hour:   parseInt(p.hour) % 24,        // "24" edge case at midnight
      minute: parseInt(p.minute),
    }
  } catch {
    return null
  }
}

/** Returns true if a day-date (local JS Date) corresponds to today. */
export function isToday(date) {
  const t = new Date()
  return date.getFullYear() === t.getFullYear() &&
         date.getMonth()    === t.getMonth()    &&
         date.getDate()     === t.getDate()
}

// ── Week helpers ──────────────────────────────────────────────
/** Returns the Monday of the week containing `date`. */
export function getMondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()           // 0 = Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

/** Returns an array of 7 Date objects (Mon → Sun) for the week. */
export function getWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
}

/** Returns the 'YYYY-MM' strings needed to cover the entire week. */
export function monthYearsForWeek(weekStart) {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const a = fmt(weekStart), b = fmt(end)
  return a === b ? [a] : [a, b]
}

/** "Mar 31 – Apr 6, 2026" */
export function formatWeekRange(weekDates) {
  const s = weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const e = weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${s} – ${e}`
}

// ── Event categorisation ──────────────────────────────────────
export function categorizeEvent(title = '') {
  const t = title.toLowerCase()
  if (/section|lecture|\boffice hours\b|seminar|\bexam\b|\bquiz\b|recitation|\blab\b/i.test(t)) return 'academic'
  if (/\bmeeting\b|standup|stand-up|\bsync\b|webinar|\b1:1\b|one-on-one|\binterview\b/i.test(t)) return 'work'
  if (/\bflight\b|\bhotel\b|airbnb|\btrip\b|\btravel\b|\bairport\b|\blayover\b|check-in/i.test(t)) return 'travel'
  if (/dinner|brunch|lunch party|birthday|wedding|concert|\bgame\b|drinks|\bbar\b|restaurant|festival|happy hour|picnic|beach/i.test(t)) return 'social'
  return 'other'
}

// Tailwind class strings for each category (event tile bg/text/border)
export const CATEGORY_TILE = {
  academic: 'bg-blue-100 text-blue-700 border-l-2 border-blue-500',
  work:     'bg-blue-100 text-blue-700 border-l-2 border-blue-500',
  travel:   'bg-sage-500/20 text-sage-600 border-l-2 border-sage-500',
  social:   'bg-terra-500/20 text-terra-600 border-l-2 border-terra-500',
  other:    'bg-cream-200 text-warm-gray-600 border-l-2 border-warm-gray-400',
}

export const CATEGORY_DOT = {
  academic: 'bg-blue-400',
  work:     'bg-blue-400',
  travel:   'bg-sage-500',
  social:   'bg-terra-500',
  other:    'bg-warm-gray-400',
}

export const CATEGORY_LABEL = {
  academic: 'Classes / Work',
  work:     'Classes / Work',
  travel:   'Travel',
  social:   'Social',
  other:    'Other',
}

// ── Event layout (overlap handling) ──────────────────────────
/**
 * Given an array of events with { startMin, endMin } (minutes from START_HOUR),
 * assigns { col, totalCols } to each so overlapping events render side-by-side.
 */
export function computeLayout(events) {
  if (events.length === 0) return []
  const sorted = [...events].sort((a, b) =>
    a.startMin !== b.startMin
      ? a.startMin - b.startMin
      : (b.endMin - b.startMin) - (a.endMin - a.startMin)
  )

  const colEnds = []   // colEnds[i] = endMin of last event in column i
  const placed  = sorted.map(ev => {
    let col = colEnds.findIndex(end => end <= ev.startMin)
    if (col === -1) col = colEnds.length
    colEnds[col] = ev.endMin
    return { ...ev, col }
  })

  // Second pass: totalCols = widest overlap group this event belongs to
  return placed.map(ev => {
    const overlapping = placed.filter(
      o => o.startMin < ev.endMin && o.endMin > ev.startMin
    )
    const totalCols = Math.max(...overlapping.map(o => o.col)) + 1
    return { ...ev, totalCols }
  })
}

/**
 * Prepare a day's events for rendering:
 *   - filters to events on `dayDate` (in `tz`)
 *   - converts to { startMin, endMin } clipped to [0, GRID_MINS]
 *   - runs computeLayout for overlap columns
 *   - returns { timedEvents, allDayEvents }
 */
export function layoutDayEvents(allEvents, dayDate, tz) {
  const GRID_MINS = (END_HOUR - START_HOUR) * 60

  const onThisDay = (ev) => {
    const p = tzParts(ev.start_time, tz)
    if (!p) return false
    return p.year === dayDate.getFullYear() &&
           p.month === dayDate.getMonth() + 1 &&   // tzParts is 1-indexed
           p.day === dayDate.getDate()
  }

  const allDayEvents = allEvents.filter(ev => ev.all_day && onThisDay(ev))

  const rawTimed = allEvents
    .filter(ev => !ev.all_day && onThisDay(ev))
    .map(ev => {
      const sp = tzParts(ev.start_time, tz)
      if (!sp) return null
      const startMin = (sp.hour - START_HOUR) * 60 + sp.minute
      let endMin = startMin + 30
      if (ev.end_time) {
        const ep = tzParts(ev.end_time, tz)
        if (ep) {
          // Handle events spanning past midnight by capping at grid end
          const epDay = ep.day !== sp.day ? END_HOUR : ep.hour
          endMin = (epDay - START_HOUR) * 60 + (ep.day !== sp.day ? 0 : ep.minute)
        }
      }
      const clampedStart = Math.max(0, startMin)
      const clampedEnd   = Math.min(GRID_MINS, endMin)
      if (clampedStart >= GRID_MINS || clampedEnd <= 0) return null
      return { ...ev, startMin: clampedStart, endMin: clampedEnd }
    })
    .filter(Boolean)

  const timedEvents = computeLayout(rawTimed)
  return { timedEvents, allDayEvents }
}

// ── Mini-calendar grid ────────────────────────────────────────
/** Builds the 5-or-6 week grid for a monthly mini calendar. */
export function buildMonthGrid(year, month) {
  // month is 0-indexed
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)

  const startOffset = first.getDay()  // 0 = Sun
  const endOffset   = 6 - last.getDay()

  const gridStart = new Date(first); gridStart.setDate(1 - startOffset)
  const gridEnd   = new Date(last);  gridEnd.setDate(last.getDate() + endOffset)

  const days = []
  const cur  = new Date(gridStart)
  while (cur <= gridEnd) {
    days.push({ date: new Date(cur), inMonth: cur.getMonth() === month })
    cur.setDate(cur.getDate() + 1)
  }

  const weeks = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

// ── Highlight filtering (for mini-calendar events section) ────
const ROUTINE = /section|lecture|office hours|seminar|exam|quiz|recitation|\blab\b|meeting|standup|stand-up|\bsync\b|daily|weekly|check-in|yoga|dentist|doctor|therapy|appointment|class|homework|study|webinar/i

export function isHighlightEvent(event) {
  return !ROUTINE.test(event.title)
}
