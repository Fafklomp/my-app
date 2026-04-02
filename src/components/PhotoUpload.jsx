import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Lightbox from './Lightbox'

const BUCKET         = 'newsletter-photos'
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const ACCEPTED_EXTS  = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']
const MAX_BYTES      = 10 * 1024 * 1024 // 10 MB
const SIGNED_URL_TTL = 3600             // 1 hour

function validate(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  // Check MIME type first; fall back to extension for cases where the OS
  // returns an empty or non-standard type (common on Windows for .jpeg files)
  const typeOk = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTS.includes(ext)
  if (!typeOk) return 'Only JPG, PNG, WebP, and HEIC images are allowed.'
  if (file.size > MAX_BYTES) return `"${file.name}" exceeds the 10 MB limit.`
  return null
}

async function signedUrlForPath(path) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL)
  if (error) return null
  return data.signedUrl
}

// Batch-sign an array of {id, storage_path, caption, sort_order} rows
// Returns the same rows with an added `displayUrl` field
async function attachSignedUrls(photos) {
  if (photos.length === 0) return []
  const paths = photos.map((p) => p.storage_path).filter(Boolean)
  if (paths.length === 0) return photos.map((p) => ({ ...p, displayUrl: p.photo_url }))

  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL)

  const urlMap = {}
  data?.forEach(({ path, signedUrl }) => { urlMap[path] = signedUrl })

  return photos.map((p) => ({
    ...p,
    displayUrl: urlMap[p.storage_path] ?? p.photo_url ?? '',
  }))
}

// ── Component ─────────────────────────────────────────────────

export default function PhotoUpload({ versionId, userId, onPhotoChange, refreshTrigger }) {
  const [photos,    setPhotos]    = useState([])  // { id, storage_path, photo_url, caption, sort_order, displayUrl }
  const [uploading, setUploading] = useState({})  // { tempKey: true }
  const [dragOver,  setDragOver]  = useState(false)
  const [errors,       setErrors]       = useState([])
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const fileInputRef    = useRef(null)
  const captionTimers   = useRef({})

  // ── Fetch existing photos for this version ──
  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase
      .from('newsletter_photos')
      .select('id, storage_path, photo_url, caption, sort_order')
      .eq('newsletter_version_id', versionId)
      .order('sort_order', { ascending: true })

    const signed = await attachSignedUrls(data ?? [])
    setPhotos(signed)
  }, [versionId])

  useEffect(() => { fetchPhotos() }, [fetchPhotos, refreshTrigger])

  // ── Upload handler ──
  async function uploadFiles(files) {
    const fileArray = Array.from(files)
    const newErrors = []
    const valid     = []

    for (const file of fileArray) {
      const err = validate(file)
      if (err) newErrors.push(err)
      else valid.push(file)
    }

    setErrors(newErrors)
    if (valid.length === 0) return

    const baseOrder = photos.reduce((m, p) => Math.max(m, p.sort_order ?? 0), -1)

    for (let i = 0; i < valid.length; i++) {
      const file    = valid[i]
      const tempKey = `${Date.now()}-${i}`
      const ext     = file.name.split('.').pop().toLowerCase()
      const path    = `${userId}/${versionId}/${Date.now()}-${i}.${ext}`

      setUploading((prev) => ({ ...prev, [tempKey]: true }))

      const { error: storageErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })

      if (storageErr) {
        setErrors((prev) => [...prev, `Failed to upload "${file.name}": ${storageErr.message}`])
        setUploading((prev) => { const n = { ...prev }; delete n[tempKey]; return n })
        continue
      }

      await supabase.from('newsletter_photos').insert({
        newsletter_version_id: versionId,
        storage_path:          path,
        photo_url:             '',        // legacy column — path is authoritative
        caption:               '',
        sort_order:            baseOrder + i + 1,
      })

      setUploading((prev) => { const n = { ...prev }; delete n[tempKey]; return n })
    }

    await fetchPhotos()
    onPhotoChange?.()
  }

  function handleFileInput(e) {
    uploadFiles(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    uploadFiles(e.dataTransfer.files)
  }

  // ── Delete ──
  async function handleDelete(photo) {
    if (photo.storage_path) {
      await supabase.storage.from(BUCKET).remove([photo.storage_path])
    }
    await supabase.from('newsletter_photos').delete().eq('id', photo.id)
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    onPhotoChange?.()
  }

  // ── Caption (debounced) ──
  function handleCaptionChange(photoId, value) {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, caption: value } : p)))
    clearTimeout(captionTimers.current[photoId])
    captionTimers.current[photoId] = setTimeout(async () => {
      await supabase.from('newsletter_photos').update({ caption: value }).eq('id', photoId)
      onPhotoChange?.()
    }, 500)
  }

  const uploadingCount = Object.keys(uploading).length
  const hasContent     = photos.length > 0 || uploadingCount > 0

  return (
    <div className="space-y-4">

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg border border-red-200">
              {err}
            </p>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer select-none ${
          dragOver ? 'border-terra-500 bg-terra-500/5' : 'border-cream-300 hover:border-warm-gray-200'
        }`}
      >
        <div className="text-3xl mb-2">📷</div>
        <p className="text-warm-gray-400 text-sm">
          {hasContent ? 'Add more photos' : 'Drag photos here or click to browse'}
        </p>
        <p className="text-warm-gray-300 text-xs mt-1">JPG, PNG, WebP, or HEIC · Max 10 MB each</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Photo grid */}
      {hasContent && (
        <div className="grid grid-cols-3 gap-3">

          {/* Existing photos */}
          {photos.map((photo, i) => (
            <div key={photo.id} className="space-y-1.5">
              <div
                className="relative group rounded-lg overflow-hidden aspect-square bg-cream-200 cursor-zoom-in"
                onClick={() => setLightboxIndex(i)}
              >
                {photo.displayUrl && (
                  <img
                    src={photo.displayUrl}
                    alt={photo.caption || ''}
                    className="w-full h-full object-cover"
                  />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(photo) }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  aria-label="Delete photo"
                >
                  ×
                </button>
              </div>
              <input
                type="text"
                value={photo.caption ?? ''}
                onChange={(e) => handleCaptionChange(photo.id, e.target.value)}
                placeholder="AI will auto-caption · click to edit"
                className="w-full text-xs bg-transparent border-none text-warm-gray-600 placeholder:text-warm-gray-300 placeholder:italic focus:outline-none focus:ring-0 px-0"
              />
            </div>
          ))}

          {/* Uploading placeholders */}
          {Object.keys(uploading).map((key) => (
            <div key={key} className="space-y-1.5">
              <div className="rounded-lg overflow-hidden aspect-square bg-cream-200 flex items-center justify-center">
                <svg className="w-5 h-5 text-warm-gray-400 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
              <p className="text-xs text-warm-gray-300 italic">Uploading…</p>
            </div>
          ))}

        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos.map((p) => ({ displayUrl: p.displayUrl, caption: p.caption }))}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
