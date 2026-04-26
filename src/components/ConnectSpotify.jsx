import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function SpotifyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#1DB954" aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  )
}

/**
 * Starts the Spotify OAuth flow.
 * Stores a return URL in sessionStorage, then redirects to Spotify's consent screen.
 */
export async function connectSpotify(returnTo = window.location.href) {
  sessionStorage.setItem('spotify_return_to', returnTo)

  const { data, error } = await supabase.functions.invoke('spotify-auth', {
    body: { action: 'get_auth_url' },
  })

  if (error || data?.error) {
    console.error('Failed to get Spotify auth URL:', error, data)
    alert('Could not start Spotify connection. Please try again.')
    return
  }

  window.location.href = data.url
}

/**
 * ConnectSpotify — renders connection state and action buttons.
 *
 * Props:
 *   onStatusChange(connected: bool) — called when status is known/changes
 *   forceConnected — if true, skip DB check and treat as connected
 */
export default function ConnectSpotify({ onStatusChange, forceConnected }) {
  const [connected, setConnected] = useState(forceConnected ?? null) // null = loading
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    if (forceConnected) {
      setConnected(true)
      onStatusChange?.(true)
    } else {
      checkConnection()
    }
  }, [forceConnected])

  async function checkConnection() {
    const { data } = await supabase
      .from('user_oauth_tokens')
      .select('spotify_access_token')
      .maybeSingle()
    const isConnected = !!data?.spotify_access_token
    setConnected(isConnected)
    onStatusChange?.(isConnected)
  }

  async function handleConnect() {
    setLoading(true)
    await connectSpotify(window.location.href)
    // Page will redirect — loading state is just visual feedback
  }

  async function handleReconnect() {
    setLoading(true)
    await connectSpotify(window.location.href)
  }

  if (connected === null) return null // loading

  if (connected) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-sm text-sage-600 font-medium">
          <SpotifyIcon />
          Spotify connected ✓
        </div>
        <button
          onClick={handleReconnect}
          disabled={loading}
          className="text-terra-500 hover:text-terra-600 text-sm underline text-left cursor-pointer transition-colors disabled:opacity-50"
        >
          {loading ? 'Redirecting…' : 'Reconnect Spotify →'}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="bg-[#1DB954] hover:bg-[#1aa34a] disabled:opacity-60 text-white rounded-lg px-4 py-2.5 text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
    >
      <SpotifyIcon />
      {loading ? 'Redirecting…' : 'Connect Spotify'}
    </button>
  )
}
