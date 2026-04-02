import { useEffect, useRef } from 'react'

function formatTime(isoString, tz) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('en-US', {
    timeZone:  tz,
    hour:      'numeric',
    minute:    '2-digit',
    hour12:    true,
  })
}

/**
 * Floating popover showing full event details.
 * Positioned via fixed x/y (from click coordinates), clamped to viewport.
 *
 * Props:
 *   event     — calendar_events row (possibly masked: { title: 'Busy', masked: true })
 *   x, y      — viewport coordinates from the click
 *   tz        — IANA timezone string for time display
 *   onClose   — called when dismissed
 */
export default function EventPopover({ event, x, y, tz, onClose }) {
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    // Delay so the click that opened the popover doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', handle), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handle) }
  }, [onClose])

  // Clamp to viewport
  const left = Math.min(x + 8, window.innerWidth  - 240)
  const top  = Math.min(y - 8, window.innerHeight - 180)

  const startFmt = formatTime(event.start_time, tz)
  const endFmt   = event.end_time ? formatTime(event.end_time, tz) : null

  return (
    <div
      ref={ref}
      className="fixed z-50 w-56 bg-white border border-cream-300 rounded-xl shadow-xl p-4 text-sm"
      style={{ left, top }}
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-warm-gray-400 hover:text-warm-gray-600 text-lg leading-none cursor-pointer"
        aria-label="Close"
      >
        ×
      </button>

      <p className="font-semibold text-warm-gray-900 pr-5 leading-snug">{event.title}</p>

      {(startFmt || event.all_day) && (
        <p className="text-warm-gray-500 mt-2 text-xs">
          {event.all_day ? 'All day' : `${startFmt}${endFmt ? ` – ${endFmt}` : ''}`}
        </p>
      )}

      {!event.masked && event.location && (
        <p className="text-warm-gray-400 mt-1 text-xs">{event.location}</p>
      )}

      {!event.masked && event.calendar_name && (
        <p className="text-warm-gray-300 mt-1.5 text-xs">from {event.calendar_name}</p>
      )}
    </div>
  )
}
