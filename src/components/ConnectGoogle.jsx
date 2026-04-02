import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

/**
 * Starts the manual Google Photos OAuth flow.
 * Stores a return URL in sessionStorage, then redirects to Google's consent screen.
 *
 * @param returnTo  Page to return to after the Photos OAuth completes (defaults to current page)
 */
export async function connectGooglePhotos(returnTo = window.location.href) {
  sessionStorage.setItem('google_photos_return_to', returnTo)

  const { data, error } = await supabase.functions.invoke('google-photos-auth', {
    body: { action: 'get_auth_url' },
  })

  if (error || data?.error) {
    console.error('Failed to get Google Photos auth URL:', error, data)
    alert('Could not start Google Photos connection. Please try again.')
    return
  }

  window.location.href = data.auth_url
}

/**
 * Clears the stored Google calendar token then re-triggers Supabase OAuth
 * (calendar only — Photos is handled by the separate manual flow above).
 * Exported so other components can reuse the same flow.
 *
 * @param redirectTo  Page to return to after OAuth (defaults to /dashboard)
 */
export async function reconnectGoogle(redirectTo = window.location.origin + '/dashboard') {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    await supabase
      .from('user_oauth_tokens')
      .update({
        google_access_token:  null,
        google_refresh_token: null,
        updated_at:           new Date().toISOString(),
      })
      .eq('user_id', session.user.id)
  }

  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes:     CALENDAR_SCOPE,
      redirectTo,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
}

/**
 * ConnectGoogle — renders connection state and appropriate action buttons.
 *
 * Props:
 *   onStatusChange(connected: bool, photosEnabled: bool) — called when status is known/changes
 *   forceConnected     — if true, skip DB check and treat as connected
 *   forcePhotosEnabled — if true (and forceConnected), treat as photos-enabled
 */
export default function ConnectGoogle({ onStatusChange, forceConnected, forcePhotosEnabled }) {
  const [connected,     setConnected]     = useState(forceConnected ?? null) // null = loading
  const [photosEnabled, setPhotosEnabled] = useState(forcePhotosEnabled ?? false)
  const [photosLoading, setPhotosLoading] = useState(false)

  useEffect(() => {
    if (forceConnected) {
      setConnected(true)
      setPhotosEnabled(forcePhotosEnabled ?? false)
      onStatusChange?.(true, forcePhotosEnabled ?? false)
    } else {
      checkConnection()
    }
  }, [forceConnected, forcePhotosEnabled])

  async function checkConnection() {
    const { data } = await supabase
      .from('user_oauth_tokens')
      .select('google_access_token, google_photos_access_token')
      .maybeSingle()
    const isConnected = !!data?.google_access_token
    const photosOk    = !!data?.google_photos_access_token
    setConnected(isConnected)
    setPhotosEnabled(photosOk)
    onStatusChange?.(isConnected, photosOk)
  }

  async function handleConnect() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes:     CALENDAR_SCOPE,
        redirectTo: window.location.origin + '/dashboard',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
  }

  async function handleConnectPhotos() {
    setPhotosLoading(true)
    await connectGooglePhotos(window.location.href)
    // Page will redirect — loading state is just visual feedback
  }

  if (connected === null) return null // loading

  if (connected) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-sm text-sage-600 font-medium">
          <GoogleIcon />
          {photosEnabled
            ? 'Google Calendar & Photos connected ✓'
            : 'Google Calendar connected ✓'}
        </div>

        {photosEnabled ? (
          <button
            onClick={handleConnectPhotos}
            disabled={photosLoading}
            className="text-terra-500 hover:text-terra-600 text-sm underline text-left cursor-pointer transition-colors disabled:opacity-50"
          >
            {photosLoading ? 'Redirecting…' : 'Reconnect Google Photos →'}
          </button>
        ) : (
          <button
            onClick={handleConnectPhotos}
            disabled={photosLoading}
            className="text-terra-500 hover:text-terra-600 text-sm underline text-left cursor-pointer transition-colors disabled:opacity-50"
          >
            {photosLoading ? 'Redirecting…' : 'Connect Google Photos →'}
          </button>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={handleConnect}
      className="bg-white border border-cream-300 text-warm-gray-800 hover:bg-cream-100 rounded-lg px-4 py-2.5 text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer"
    >
      <GoogleIcon />
      Connect Google
    </button>
  )
}
