import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// ── Icons ─────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="13" rx="3" fill="white" stroke="none" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8"  y1="23" x2="16" y2="23" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────

function fmt(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const textareaClass =
  'w-full bg-white border border-cream-300 rounded-lg px-4 py-3 text-sm text-warm-gray-700 placeholder:text-warm-gray-300 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500 resize-none leading-relaxed'

// ── Component ─────────────────────────────────────────────────

export default function VoiceRecorder({ newsletterId, initialValue, onSaved, onExtract }) {
  // 'idle' | 'recording' | 'completed'
  const [state,      setState]     = useState('idle')
  const [text,       setText]      = useState(initialValue ?? '')
  const [elapsed,    setElapsed]   = useState(0)   // live counter during recording
  const [duration,   setDuration]  = useState(0)   // frozen when stopped
  const [audioUrl,   setAudioUrl]  = useState(null)
  const [isPlaying,  setIsPlaying] = useState(false)
  const [micError,   setMicError]  = useState(null)
  const [saving,     setSaving]    = useState(false)
  const [extracting, setExtracting] = useState(false)

  // API support flags — set once on mount
  const [hasMedia,  setHasMedia]  = useState(true)
  const [hasSpeech, setHasSpeech] = useState(true)

  const recorderRef    = useRef(null)
  const chunksRef      = useRef([])
  const recognitionRef = useRef(null)
  const transcriptRef  = useRef('')   // accumulates finalized speech results
  const elapsedRef     = useRef(0)    // readable inside MediaRecorder callbacks
  const timerRef       = useRef(null)
  const audioRef       = useRef(null)

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) setHasMedia(false)
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
      setHasSpeech(false)
    }
    return () => {
      clearInterval(timerRef.current)
      recognitionRef.current?.abort()
    }
  }, [])

  // Keep textarea in sync if parent re-fetches and we're idle
  useEffect(() => {
    if (state === 'idle') setText(initialValue ?? '')
  }, [initialValue]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start ──────────────────────────────────────────────────
  async function startRecording() {
    setMicError(null)
    transcriptRef.current = ''
    elapsedRef.current    = 0

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setMicError('Microphone access is needed. Please allow it in your browser settings.')
      return
    }

    // MediaRecorder
    const recorder = new MediaRecorder(stream)
    recorderRef.current = recorder
    chunksRef.current   = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      setAudioUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) })
      setDuration(elapsedRef.current)
      // Pre-fill textarea with transcript (user can edit it)
      if (transcriptRef.current) setText(transcriptRef.current)
      setState('completed')
    }

    recorder.start()

    // SpeechRecognition (progressive enhancement)
    if (hasSpeech) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      const rec = new SR()
      rec.continuous     = true
      rec.interimResults = true
      rec.lang           = 'en-US'

      rec.onresult = (e) => {
        let final = ''
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '
        }
        transcriptRef.current = final.trim()
      }

      rec.onerror = () => { /* silent — textarea fallback handles missing transcript */ }

      recognitionRef.current = rec
      try { rec.start() } catch { /* ignore if already started */ }
    }

    // Timer
    setElapsed(0)
    setState('recording')
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
  }

  // ── Stop ───────────────────────────────────────────────────
  function stopRecording() {
    clearInterval(timerRef.current)
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recorderRef.current?.stop()
  }

  // ── Re-record ─────────────────────────────────────────────
  function reRecord() {
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }
    setDuration(0)
    setElapsed(0)
    setIsPlaying(false)
    if (audioRef.current) audioRef.current.pause()
    setState('idle')
  }

  // ── Playback ──────────────────────────────────────────────
  function togglePlay() {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  // ── Save ──────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    await supabase
      .from('newsletters')
      .update({ voice_input: text || null })
      .eq('id', newsletterId)
    setSaving(false)
    onSaved?.(text)
  }

  const canSave = text.trim().length > 0

  async function handleExtract() {
    if (!onExtract || !canSave || extracting) return
    setExtracting(true)
    try {
      await onExtract(text)
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div className="bg-white border border-cream-300 rounded-xl p-6 space-y-5">

      {/* Heading */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-warm-gray-900">Voice Input</h2>
        <p className="text-warm-gray-400 text-sm mt-1">
          Record a voice memo about your month. The AI will use this to generate your summaries.
        </p>
      </div>

      {/* ── Voice recording UI ── */}
      {!hasMedia ? (
        <p className="text-warm-gray-400 text-sm">
          Voice recording is not supported in this browser.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-2">

          {/* Record / Stop button */}
          {state === 'idle' && (
            <>
              <button
                onClick={startRecording}
                className="w-16 h-16 rounded-full bg-terra-500 hover:bg-terra-600 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Start recording"
              >
                <MicIcon />
              </button>
              <p className="text-warm-gray-400 text-xs">Click to start recording</p>
            </>
          )}

          {state === 'recording' && (
            <>
              <button
                onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center ring-4 ring-red-400/50 animate-pulse cursor-pointer"
                aria-label="Stop recording"
              >
                <div className="w-5 h-5 bg-white rounded-sm" />
              </button>
              <p className="text-warm-gray-800 text-sm font-mono">{fmt(elapsed)}</p>
              <p className="text-warm-gray-400 text-xs">Click to stop recording</p>
            </>
          )}

          {state === 'completed' && audioUrl && (
            <>
              {/* Hidden audio element */}
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
              {/* Playback pill */}
              <div className="w-full bg-cream-200 rounded-full px-4 py-2 flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="text-warm-gray-600 hover:text-warm-gray-900 transition-colors cursor-pointer shrink-0"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>
                {/* Waveform placeholder */}
                <div className="flex-1 flex items-center gap-px h-4">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-warm-gray-300 rounded-full"
                      style={{ height: `${30 + Math.sin(i * 0.8) * 70}%` }}
                    />
                  ))}
                </div>
                <span className="text-warm-gray-400 text-xs shrink-0 font-mono">{fmt(duration)}</span>
              </div>
              <button
                onClick={reRecord}
                className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors cursor-pointer"
              >
                Re-record
              </button>
            </>
          )}

          {/* Mic error */}
          {micError && (
            <p className="text-sm text-warm-gray-400 text-center max-w-xs">{micError}</p>
          )}
        </div>
      )}

      {/* ── Textarea (always shown) ── */}
      <div className="space-y-1.5">
        {!hasSpeech && hasMedia && (
          <p className="text-warm-gray-400 text-xs">
            Automatic transcription is not available in this browser — type your thoughts below instead.
          </p>
        )}
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your month… what happened, highlights, how you're feeling. The AI will use this to write your newsletter."
          className={textareaClass}
        />
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {onExtract && canSave && (
          <button
            onClick={handleExtract}
            disabled={extracting || saving}
            className="text-terra-500 hover:text-terra-600 disabled:opacity-50 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {extracting ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Extracting…
              </>
            ) : '✨ Extract content'}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !canSave}
          className="ml-auto bg-terra-500 hover:bg-terra-600 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Use as Input'}
        </button>
      </div>

    </div>
  )
}
