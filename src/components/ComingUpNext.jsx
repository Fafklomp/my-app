import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const EXCLUDE_PATTERNS = [
  // Academic / class sessions (including HBS-style codes like "TEM H", "DSAIL H", "FIN2 H")
  /\bsection\b/i, /\bsecton\b/i, /\bclass\b/i, /\blecture\b/i,
  /office\s+hours/i, /\boh:/i, /\brecitation\b/i,
  // Matches short course codes ending in a single capital letter or "H" e.g. "TEM H", "FIN2 H"
  /\b[A-Z][A-Z0-9]{1,6}\s+[A-Z]\b/,

  // Health / personal routine
  /\bdentist\b/i, /\bdoctor\b/i, /\btherapy\b/i, /\bgym\b/i, /\byoga\b/i, /\bhaircut\b/i,

  // Work routine
  /stand-?up/i, /\bstandup\b/i, /\b1:1\b/i, /\bsync\b/i, /check-?in/i,
  /weekly\s+call/i,

  // Cancelled / blocked
  /^cancelled?\b/i, /^canceled?\b/i, /\bblocker\b/i,
]

function shouldExclude(title) {
  return EXCLUDE_PATTERNS.some(re => re.test(title))
}

function nextMonthStr(newsletterMonth) {
  const [year, month] = newsletterMonth.split('-').map(Number)
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`
}

function toISODate(datetimeStr) {
  // Keep the date portion from the ISO timestamp without timezone shift
  return datetimeStr.slice(0, 10)
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateParts(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }),
    day:   d.getDate(),
  }
}

export { formatDateParts }

export default function ComingUpNext({ newsletterId, newsletterMonth, initialData, extractedItems, onUpdate, onClear }) {
  const [items, setItems]           = useState(initialData ?? [])
  const [addingItem, setAddingItem] = useState(false)
  const [newTitle, setNewTitle]     = useState('')
  const [newDate, setNewDate]       = useState('')
  const [editingIdx, setEditingIdx] = useState(null)
  const isInitial              = useRef(true)
  const hasAutoPopulated       = useRef((initialData ?? []).length > 0)
  const lastExtractRef         = useRef(null)

  // Auto-populate from next-month calendar events if no saved data yet
  useEffect(() => {
    if (hasAutoPopulated.current) return
    autoPopulate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Merge AI-extracted coming_up items when extractedItems changes
  useEffect(() => {
    if (!extractedItems || extractedItems === lastExtractRef.current) return
    lastExtractRef.current = extractedItems
    const aiItems = extractedItems.coming_up ?? []
    if (aiItems.length === 0) return

    setItems(prev => {
      const existingTitles = new Set(prev.map(i => i.title.toLowerCase().trim()))
      const newItems = aiItems
        .filter(ai => ai.title && !existingTitles.has(ai.title.toLowerCase().trim()))
        .map(ai => ({
          event_id: null,
          title:    ai.title,
          date:     ai.date || '',
          included: true,
          source:   'notes',
        }))
      return newItems.length > 0 ? [...prev, ...newItems] : prev
    })
  }, [extractedItems])

  async function autoPopulate() {
    const nextMonth = nextMonthStr(newsletterMonth)
    console.log('[ComingUpNext] autoPopulate | newsletterMonth:', newsletterMonth, '→ querying month_year:', nextMonth)

    const { data: events } = await supabase
      .from('calendar_events')
      .select('id, title, start_time')
      .eq('month_year', nextMonth)
      .order('start_time', { ascending: true })

    console.log('[ComingUpNext] raw events from DB (%d):', events?.length ?? 0, events?.map(e => `${e.title} [${e.start_time?.slice(0,10)}]`))

    if (!events || events.length === 0) return

    const excluded = events.filter(e => shouldExclude(e.title))
    console.log('[ComingUpNext] excluded (%d):', excluded.length, excluded.map(e => e.title))

    const filtered = events
      .filter(e => !shouldExclude(e.title))
      .map(e => ({
        event_id: e.id,
        title:    e.title,
        date:     toISODate(e.start_time),
        included: true,
        source:   'calendar',
      }))

    console.log('[ComingUpNext] included after filter (%d):', filtered.length, filtered.map(e => e.title))

    if (filtered.length === 0) return
    hasAutoPopulated.current = true
    setItems(filtered) // triggers debounce save
  }

  // Debounced save to Supabase whenever items change
  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return }
    const timer = setTimeout(async () => {
      await supabase.from('newsletters').update({ coming_up_next: items }).eq('id', newsletterId)
      onUpdate?.(items)
    }, 500)
    return () => clearTimeout(timer)
  }, [items, newsletterId])

  function toggle(index) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, included: !item.included } : item))
  }

  function updateTitle(index, title) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, title } : item))
  }

  function deleteItem(index) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function addManualItem() {
    if (!newTitle.trim() || !newDate) return
    const item = { event_id: null, title: newTitle.trim(), date: newDate, included: true, source: 'manual' }
    setItems(prev => [...prev, item])
    setNewTitle('')
    setNewDate('')
    setAddingItem(false)
  }

  function handleClear() {
    if (!window.confirm('Clear Coming Up Next items?')) return
    setItems([])
    hasAutoPopulated.current = false
    onClear?.()
    autoPopulate()
  }

  return (
    <div className="bg-cream-100 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-warm-gray-400">
          📅 Coming Up Next Month
        </p>
        {items.length > 0 && (
          <button onClick={handleClear} className="text-sm text-warm-gray-400 hover:text-terra-500 transition-colors cursor-pointer">Clear</button>
        )}
      </div>

      {items.length === 0 && !addingItem && (
        <p className="text-sm text-warm-gray-300 italic">No events found for next month.</p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className={`flex items-center gap-3 ${!item.included ? 'opacity-50' : ''}`}>

              {/* Checkbox toggle */}
              <button
                onClick={() => toggle(i)}
                className={`shrink-0 w-4 h-4 rounded border-2 transition-colors cursor-pointer flex items-center justify-center ${
                  item.included ? 'bg-terra-500 border-terra-500' : 'bg-transparent border-warm-gray-300'
                }`}
                aria-label={item.included ? 'Exclude' : 'Include'}
              >
                {item.included && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              {/* Title — editable inline */}
              {editingIdx === i ? (
                <input
                  autoFocus
                  value={item.title}
                  onChange={(e) => updateTitle(i, e.target.value)}
                  onBlur={() => setEditingIdx(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingIdx(null) }}
                  className="flex-1 bg-white border border-cream-300 rounded px-2 py-0.5 text-sm text-warm-gray-800 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500"
                />
              ) : (
                <span
                  onClick={() => setEditingIdx(i)}
                  className={`flex-1 text-sm font-medium cursor-text group flex items-center gap-1.5 ${
                    item.included ? 'text-warm-gray-800' : 'text-warm-gray-400 line-through'
                  }`}
                >
                  {item.title}
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-warm-gray-300 text-xs font-normal">✎</span>
                </span>
              )}

              {/* Date */}
              <span className="text-xs text-warm-gray-400 shrink-0">{formatDate(item.date)}</span>

              {/* Source badge */}
              {item.source === 'notes' && (
                <span className="text-xs text-terra-500 bg-terra-500/10 px-1.5 py-0.5 rounded shrink-0">
                  from notes
                </span>
              )}
              {item.source === 'calendar' && (
                <span className="text-xs text-warm-gray-400 bg-warm-gray-100 px-1.5 py-0.5 rounded shrink-0">
                  calendar
                </span>
              )}
              {(!item.source || item.source === 'manual') && (
                <span className="text-xs text-terra-500 bg-terra-500/10 px-1.5 py-0.5 rounded shrink-0">
                  manual
                </span>
              )}

              {/* Delete (non-calendar items only) */}
              {item.source !== 'calendar' && (
                <button
                  onClick={() => deleteItem(i)}
                  className="text-warm-gray-300 hover:text-warm-gray-600 transition-colors cursor-pointer shrink-0 text-lg leading-none"
                  aria-label="Remove"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add item row */}
      {addingItem ? (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addManualItem() }}
            placeholder="Event title…"
            className="flex-1 min-w-0 bg-white border border-cream-300 rounded px-2 py-1 text-sm text-warm-gray-800 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500"
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="bg-white border border-cream-300 rounded px-2 py-1 text-sm text-warm-gray-800 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500"
          />
          <button
            onClick={addManualItem}
            disabled={!newTitle.trim() || !newDate}
            className="text-sm text-terra-500 font-medium hover:text-terra-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
          <button
            onClick={() => { setAddingItem(false); setNewTitle(''); setNewDate('') }}
            className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingItem(true)}
          className="text-sm text-warm-gray-400 hover:text-terra-500 transition-colors cursor-pointer"
        >
          ＋ Add item
        </button>
      )}
    </div>
  )
}
