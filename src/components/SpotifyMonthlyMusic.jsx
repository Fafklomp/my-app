import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * SpotifyMonthlyMusic — displays top tracks and artists for a given month.
 *
 * Props:
 *   month            — "YYYY-MM" string, e.g. "2026-04"
 *   spotifyConnected — bool, whether Spotify is linked (edit mode only)
 *   readOnly         — if true, hide the "Fetch" button (for published/recipient view)
 *   userId           — optional; if provided, fetches data for that user (public view)
 */
export default function SpotifyMonthlyMusic({ month, spotifyConnected, readOnly = false, userId }) {
  const [data, setData]       = useState(null)   // { top_tracks, top_artists } | null
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (month) loadData()
  }, [month, userId])

  async function loadData() {
    setLoading(true)
    let query = supabase
      .from('spotify_monthly_data')
      .select('top_tracks, top_artists')
      .eq('month', month)
    if (userId) query = query.eq('user_id', userId)
    const { data: row } = await query.maybeSingle()
    setData(row ?? null)
    setLoading(false)
  }

  async function handleFetch() {
    setFetching(true)
    setError(null)
    const { data: result, error: err } = await supabase.functions.invoke('spotify-auth', {
      body: { action: 'fetch_top_items', month },
    })
    if (err || result?.error) {
      setError(result?.error ?? err?.message ?? 'Failed to fetch Spotify data.')
    } else {
      setData({ top_tracks: result.top_tracks, top_artists: result.top_artists })
    }
    setFetching(false)
  }

  if (loading) {
    return (
      <div className="py-4 text-sm text-warm-gray-400">Loading music data…</div>
    )
  }

  // No data yet
  if (!data) {
    if (readOnly) return null
    if (!spotifyConnected) {
      return (
        <p className="text-sm text-warm-gray-400 italic">
          Connect Spotify in the dashboard to show your monthly listening.
        </p>
      )
    }
    return (
      <div className="text-center space-y-3 py-4">
        {error && <p className="text-sm text-red-500">{error}</p>}
        <p className="text-sm text-warm-gray-400 italic">No music data for this month yet.</p>
        <button
          onClick={handleFetch}
          disabled={fetching}
          className="bg-[#1DB954] hover:bg-[#1aa34a] disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {fetching ? 'Fetching…' : 'Fetch My Music'}
        </button>
      </div>
    )
  }

  const tracks  = data.top_tracks  ?? []
  const artists = data.top_artists ?? []

  return (
    <div className="space-y-6">
      {/* Refresh button (edit mode only) */}
      {!readOnly && (
        <div className="flex justify-end">
          <button
            onClick={handleFetch}
            disabled={fetching}
            className="text-terra-500 hover:text-terra-600 disabled:opacity-50 text-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {fetching ? 'Refreshing…' : '↻ Refresh Data'}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Top Tracks */}
      {tracks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-warm-gray-400 uppercase tracking-wide">Top Tracks</h3>
          <ol className="space-y-2">
            {tracks.map((track, i) => (
              <li key={i}>
                <a
                  href={track.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 group"
                >
                  <span className="text-xs text-warm-gray-300 w-4 shrink-0 text-right">{i + 1}</span>
                  {track.album_art_url ? (
                    <img
                      src={track.album_art_url}
                      alt={track.album}
                      className="w-10 h-10 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded bg-cream-200 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-warm-gray-800 text-sm truncate group-hover:text-terra-500 transition-colors">
                      {track.name}
                    </p>
                    <p className="text-xs text-warm-gray-500 truncate">{track.artist}</p>
                  </div>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Top Artists */}
      {artists.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-warm-gray-400 uppercase tracking-wide">Top Artists</h3>
          <div className="flex gap-4">
            {artists.map((artist, i) => (
              <a
                key={i}
                href={artist.spotify_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 text-center group"
              >
                {artist.image_url ? (
                  <img
                    src={artist.image_url}
                    alt={artist.name}
                    className="w-16 h-16 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-cream-200 shrink-0" />
                )}
                <p className="text-sm font-medium text-warm-gray-800 group-hover:text-terra-500 transition-colors leading-tight max-w-[80px] truncate">
                  {artist.name}
                </p>
                {artist.genres?.[0] && (
                  <span className="text-xs bg-cream-200 text-warm-gray-600 px-2 py-0.5 rounded-full truncate max-w-[80px]">
                    {artist.genres[0]}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
