import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// photos: [{ displayUrl, caption }]
// index: controlled current index
// onIndex: (newIndex) => void
// onClose: () => void

export default function Lightbox({ photos, index, onIndex, onClose }) {
  const photo = photos[index]
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowLeft'  && hasPrev) onIndex(index - 1)
      if (e.key === 'ArrowRight' && hasNext) onIndex(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, hasPrev, hasNext, onClose, onIndex])

  if (!photo) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close */}
      <button
        className="absolute top-6 right-6 text-white text-2xl cursor-pointer leading-none hover:opacity-70 transition-opacity"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>

      {/* Prev arrow */}
      {hasPrev && (
        <button
          className="absolute left-4 text-white text-3xl cursor-pointer px-3 py-4 hover:opacity-70 transition-opacity select-none"
          onClick={(e) => { e.stopPropagation(); onIndex(index - 1) }}
          aria-label="Previous photo"
        >
          ‹
        </button>
      )}

      {/* Image + caption */}
      <div
        className="flex flex-col items-center px-16"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photo.displayUrl}
          alt={photo.caption ?? ''}
          className="max-w-4xl max-h-[80vh] object-contain rounded-lg"
        />
        {photo.caption && (
          <p className="text-white text-sm text-center mt-3 max-w-xl opacity-90">
            {photo.caption}
          </p>
        )}
        {photos.length > 1 && (
          <p className="text-white/40 text-xs mt-2">
            {index + 1} / {photos.length}
          </p>
        )}
      </div>

      {/* Next arrow */}
      {hasNext && (
        <button
          className="absolute right-4 text-white text-3xl cursor-pointer px-3 py-4 hover:opacity-70 transition-opacity select-none"
          onClick={(e) => { e.stopPropagation(); onIndex(index + 1) }}
          aria-label="Next photo"
        >
          ›
        </button>
      )}
    </div>,
    document.body
  )
}
