import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const CARD_CONFIG = [
  { key: 'reading',        emoji: '📚', label: 'Reading' },
  { key: 'watching',       emoji: '🎬', label: 'Watching' },
  { key: 'recommendation', emoji: '💡', label: 'Recommendation' },
  { key: 'hot_take',       emoji: '🔥', label: 'Hot Take' },
]

function Card({ config, title, note, onChange }) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingNote,  setEditingNote]  = useState(false)
  const isEmpty = !title && !note

  return (
    <div className="bg-cream-100 rounded-lg p-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-warm-gray-400">
        {config.emoji} {config.label}
      </p>

      {/* Title */}
      {editingTitle ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => onChange({ title: e.target.value, note })}
          onBlur={() => setEditingTitle(false)}
          placeholder={`${config.label} title…`}
          className="w-full bg-white border border-cream-300 rounded px-2 py-1 text-sm font-medium text-warm-gray-800 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500"
        />
      ) : (
        <p
          onClick={() => setEditingTitle(true)}
          className={`text-sm font-medium cursor-text group flex items-center gap-1.5 min-h-[1.5rem] ${
            title ? 'text-warm-gray-800' : 'text-warm-gray-300 italic'
          }`}
        >
          {title || (isEmpty ? 'Not mentioned yet' : 'Add title…')}
          {title && (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-warm-gray-300 text-xs">✎</span>
          )}
        </p>
      )}

      {/* Note — only show once there's a title or existing note */}
      {(title || note) && (
        editingNote ? (
          <textarea
            autoFocus
            rows={2}
            value={note}
            onChange={(e) => onChange({ title, note: e.target.value })}
            onBlur={() => setEditingNote(false)}
            placeholder="Add a note…"
            className="w-full bg-white border border-cream-300 rounded px-2 py-1 text-xs text-warm-gray-500 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500 resize-none"
          />
        ) : (
          <p
            onClick={() => setEditingNote(true)}
            className="text-xs text-warm-gray-500 cursor-text group flex items-center gap-1.5 min-h-[1.25rem]"
          >
            {note
              ? <>{note} <span className="opacity-0 group-hover:opacity-100 transition-opacity text-warm-gray-300">✎</span></>
              : <span className="text-warm-gray-300 italic">Add a note…</span>
            }
          </p>
        )
      )}
    </div>
  )
}

export default function ContentCards({ newsletterId, initialData, extractionResult, onUpdate }) {
  const [content, setContent] = useState(() => ({
    reading:        { title: '', note: '' },
    watching:       { title: '', note: '' },
    recommendation: { title: '', note: '' },
    hot_take:       { title: '', note: '' },
    ...(initialData ?? {}),
  }))
  const isInitial = useRef(true)

  // Debounced save to Supabase whenever content changes
  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return }
    const timer = setTimeout(async () => {
      await supabase.from('newsletters').update({ manual_content: content }).eq('id', newsletterId)
      onUpdate?.(content)
    }, 500)
    return () => clearTimeout(timer)
  }, [content, newsletterId])

  // Merge extraction result — only fills empty fields
  useEffect(() => {
    if (!extractionResult) return
    setContent(prev => {
      const next = { ...prev }
      for (const key of ['reading', 'watching', 'recommendation', 'hot_take']) {
        const incoming = extractionResult[key]
        if (!incoming) continue
        next[key] = {
          title: prev[key]?.title || incoming.title || '',
          note:  prev[key]?.note  || incoming.note  || '',
        }
      }
      return next
    })
  }, [extractionResult])

  function handleCardChange(key, updated) {
    setContent(prev => ({ ...prev, [key]: updated }))
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {CARD_CONFIG.map((cfg) => (
        <Card
          key={cfg.key}
          config={cfg}
          title={content[cfg.key]?.title ?? ''}
          note={content[cfg.key]?.note ?? ''}
          onChange={(updated) => handleCardChange(cfg.key, updated)}
        />
      ))}
    </div>
  )
}
