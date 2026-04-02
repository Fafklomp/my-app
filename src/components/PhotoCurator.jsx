import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { connectGooglePhotos } from './ConnectGoogle'

function Spinner({ className = 'w-5 h-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  )
}

/**
 * PhotoCurator — Google Photos Picker integration for a newsletter version.
 *
 * Uses the Google Photos Picker API (photospicker.googleapis.com), which
 * replaced the deprecated Library API (shut down March 31 2025).
 *
 * Flow:
 *   1. Create a picker session → get pickerUri
 *   2. Open pickerUri+'/autoclose' in a popup
 *   3. Poll every 3s until mediaItemsSet = true
 *   4. Load selected items, show confirmation grid (all checked by default)
 *   5. User confirms → download each via store-google-photo Edge Function
 *
 * Props:
 *   versionId           — newsletter_version.id (null if no version yet)
 *   googlePhotosEnabled — bool: user has Photos token in DB
 *   googleConnected     — bool: user has any Google connection
 *   onImportComplete    — fn() called after photos are stored
 */
export default function PhotoCurator({
  versionId,
  googlePhotosEnabled,
  googleConnected,
  onImportComplete,
}) {
  // step: idle | creating | waiting | reviewing | importing | error
  const [step,           setStep]           = useState('idle')
  const [statusMsg,      setStatusMsg]      = useState('')
  const [pickedPhotos,   setPickedPhotos]   = useState([])      // from list_items
  const [selected,       setSelected]       = useState(new Set()) // picker_media_item_id set
  const [importProgress, setImportProgress] = useState(null)    // { current, total }
  const [errorMsg,       setErrorMsg]       = useState('')

  const pollRef    = useRef(null)  // interval ID
  const popupRef   = useRef(null)  // popup window reference
  const sessionRef = useRef(null)  // current sessionId

  // Lock body scroll while overlay is open
  useEffect(() => {
    if (step !== 'idle') document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [step])

  // Clear polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // ── Step 1: create session and open picker popup ─────────────
  async function handlePickPhotos() {
    if (!versionId) return
    setStep('creating')
    setErrorMsg('')

    const { data, error } = await supabase.functions.invoke('google-photos-picker', {
      body: { action: 'create_session' },
    })

    if (error || data?.error) {
      const errMsg = data?.error || error?.message || 'Failed to create picker session.'
      if (errMsg === 'GOOGLE_PHOTOS_NOT_CONNECTED') {
        setErrorMsg('Google Photos is not connected. Click "Connect Google Photos →" to set it up.')
      } else {
        setErrorMsg(errMsg)
      }
      setStep('error')
      return
    }

    const { sessionId, pickerUri } = data
    sessionRef.current = sessionId

    // Open the Google-hosted picker in a popup.
    // The /autoclose suffix tells Google to close the window when the user is done.
    popupRef.current = window.open(
      `${pickerUri}/autoclose`,
      'googlephotosPicker',
      'width=1200,height=800,left=100,top=100,menubar=no,toolbar=no',
    )

    setStep('waiting')
    setStatusMsg('Select photos in the Google Photos window — it will close automatically when you\'re done.')

    // Poll every 3 seconds
    pollRef.current = setInterval(() => pollSession(sessionId), 3000)
  }

  // ── Step 2: poll until user finishes picking ─────────────────
  async function pollSession(sessionId) {
    const { data, error } = await supabase.functions.invoke('google-photos-picker', {
      body: { action: 'poll_session', sessionId },
    })

    if (error || data?.error) {
      clearInterval(pollRef.current)
      setErrorMsg(data?.error || error?.message || 'Lost connection to picker session.')
      setStep('error')
      return
    }

    if (data.mediaItemsSet) {
      clearInterval(pollRef.current)
      popupRef.current?.close()
      await loadItems(sessionId)
    }
  }

  // ── Step 3: load the selected items ─────────────────────────
  async function loadItems(sessionId) {
    setStatusMsg('Loading your selected photos...')

    const { data, error } = await supabase.functions.invoke('google-photos-picker', {
      body: { action: 'list_items', sessionId },
    })

    if (error || data?.error) {
      setErrorMsg(data?.error || error?.message || 'Failed to load selected photos.')
      setStep('error')
      return
    }

    const photos = data.photos ?? []
    if (photos.length === 0) {
      setErrorMsg('No photos were selected. Close and try again.')
      setStep('error')
      return
    }

    setPickedPhotos(photos)
    setSelected(new Set(photos.map(p => p.picker_media_item_id)))
    setStep('reviewing')
  }

  // ── Step 4: confirm and import selected photos ───────────────
  async function handleConfirmImport() {
    const toImport = pickedPhotos.filter(p => selected.has(p.picker_media_item_id))
    if (!versionId || toImport.length === 0) return

    setStep('importing')
    setImportProgress({ current: 0, total: toImport.length })

    for (let i = 0; i < toImport.length; i++) {
      setImportProgress({ current: i + 1, total: toImport.length })
      const { error } = await supabase.functions.invoke('store-google-photo', {
        body: {
          base_url:              toImport[i].base_url,
          filename:              toImport[i].filename,
          newsletter_version_id: versionId,
          taken_at:              toImport[i].create_time  ?? null,
          camera_info:           toImport[i].camera_info  ?? null,
        },
      })
      if (error) console.error(`Failed to import photo ${i + 1}:`, error)
    }

    resetState()
    onImportComplete?.()
  }

  function togglePhoto(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function resetState() {
    if (pollRef.current) clearInterval(pollRef.current)
    popupRef.current?.close()
    setStep('idle')
    setPickedPhotos([])
    setSelected(new Set())
    sessionRef.current = null
    setErrorMsg('')
    setImportProgress(null)
  }

  const confirmCount = pickedPhotos.filter(p => selected.has(p.picker_media_item_id)).length

  return (
    <>
      {/* ── Inline trigger buttons ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {googlePhotosEnabled && versionId && (
          <button
            onClick={handlePickPhotos}
            className="bg-terra-500 text-white hover:bg-terra-600 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5"
          >
            Pick from Google Photos
          </button>
        )}
        {googleConnected && !googlePhotosEnabled && (
          <button
            onClick={() => connectGooglePhotos(window.location.href)}
            className="text-terra-500 hover:text-terra-600 text-sm underline cursor-pointer transition-colors"
          >
            Connect Google Photos →
          </button>
        )}
      </div>

      {/* ── Overlay ── */}
      {step !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            {(step === 'reviewing' || step === 'error' || step === 'waiting') && (
              <button
                onClick={resetState}
                className="absolute top-4 right-4 text-warm-gray-400 hover:text-warm-gray-600 text-2xl leading-none cursor-pointer z-10"
                aria-label="Close"
              >
                ×
              </button>
            )}

            {/* ── Creating session ── */}
            {step === 'creating' && (
              <div className="p-10 flex flex-col items-center gap-4 text-center">
                <Spinner className="w-8 h-8 text-terra-500" />
                <p className="text-warm-gray-700 font-medium">Opening Google Photos picker…</p>
              </div>
            )}

            {/* ── Waiting for user to pick ── */}
            {step === 'waiting' && (
              <div className="p-10 flex flex-col items-center gap-6 text-center">
                <Spinner className="w-8 h-8 text-terra-500" />
                <div>
                  <p className="text-warm-gray-800 font-semibold text-lg">Select photos in the popup</p>
                  <p className="text-warm-gray-500 text-sm mt-2">{statusMsg}</p>
                </div>
                <p className="text-xs text-warm-gray-400">
                  If the popup was blocked, allow popups for this site and try again.
                </p>
                <button
                  onClick={resetState}
                  className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors cursor-pointer underline"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* ── Loading items after picker closed ── */}
            {step === 'creating' && statusMsg && (
              <div className="p-10 flex flex-col items-center gap-4 text-center">
                <Spinner className="w-8 h-8 text-terra-500" />
                <p className="text-warm-gray-700 font-medium">{statusMsg}</p>
              </div>
            )}

            {/* ── Importing ── */}
            {step === 'importing' && importProgress && (
              <div className="p-10 flex flex-col items-center gap-4 text-center">
                <Spinner className="w-8 h-8 text-terra-500" />
                <p className="text-warm-gray-700 font-medium">
                  Importing photo {importProgress.current} of {importProgress.total}…
                </p>
                <div className="w-full max-w-xs bg-cream-200 rounded-full h-2">
                  <div
                    className="bg-terra-500 h-2 rounded-full transition-all"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {step === 'error' && (
              <div className="p-10 flex flex-col items-center gap-4 text-center">
                <p className="text-2xl">⚠️</p>
                <p className="text-warm-gray-700 font-medium">{errorMsg}</p>
                <div className="flex gap-3">
                  <button
                    onClick={resetState}
                    className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    onClick={handlePickPhotos}
                    className="bg-terra-500 text-white hover:bg-terra-600 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {/* ── Review: confirm selection ── */}
            {step === 'reviewing' && (
              <div>
                <div className="px-6 pt-6 pb-4 border-b border-cream-200">
                  <h2 className="font-heading text-xl font-bold text-warm-gray-900 pr-8">
                    {pickedPhotos.length} photo{pickedPhotos.length !== 1 ? 's' : ''} selected
                  </h2>
                  <p className="text-sm text-warm-gray-500 mt-1">
                    Uncheck any you don't want to import, then click Confirm.
                  </p>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-3 gap-3 max-h-[28rem] overflow-y-auto pr-1">
                    {pickedPhotos.map(photo => {
                      const isChecked = selected.has(photo.picker_media_item_id)
                      return (
                        <div
                          key={photo.picker_media_item_id}
                          onClick={() => togglePhoto(photo.picker_media_item_id)}
                          className={`relative rounded-xl border-2 cursor-pointer transition-all overflow-hidden ${
                            isChecked ? 'border-terra-500' : 'border-transparent opacity-50'
                          }`}
                        >
                          {/* Checkbox */}
                          <div className={`absolute top-2 right-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shadow ${
                            isChecked ? 'bg-terra-500 border-terra-500' : 'bg-white/80 border-warm-gray-300'
                          }`}>
                            {isChecked && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>

                          {/* Thumbnail */}
                          {photo.thumbnail_base64 ? (
                            <img
                              src={photo.thumbnail_base64}
                              alt={photo.filename}
                              className="w-full h-28 object-cover"
                            />
                          ) : (
                            <div className="w-full h-28 bg-cream-200 flex items-center justify-center">
                              <svg className="w-8 h-8 text-warm-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}

                          {/* Metadata strip */}
                          <div className="px-2 py-1.5 bg-white">
                            {photo.create_time && (
                              <p className="text-xs text-warm-gray-500">
                                {new Date(photo.create_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            )}
                            {photo.camera_info && (
                              <p className="text-xs text-warm-gray-400 truncate">{photo.camera_info}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Bottom bar */}
                <div className="px-6 py-4 border-t border-cream-200 flex items-center justify-between gap-4 bg-cream-50 rounded-b-2xl">
                  <p className="text-sm text-warm-gray-600">
                    {confirmCount} of {pickedPhotos.length} photo{pickedPhotos.length !== 1 ? 's' : ''} will be imported
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={resetState}
                      className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmImport}
                      disabled={confirmCount === 0}
                      className="bg-terra-500 text-white hover:bg-terra-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-5 py-2 text-sm font-medium transition-colors cursor-pointer"
                    >
                      Import {confirmCount} photo{confirmCount !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
