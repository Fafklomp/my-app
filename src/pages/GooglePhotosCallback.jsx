import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Handles the OAuth callback redirect from Google after the user
 * approves the Photos scope. Exchanges the authorization code for
 * tokens via the google-photos-auth Edge Function, then redirects
 * back to where the user came from.
 *
 * Route: /auth/google-photos/callback
 * Google sends: ?code=...&state=...
 */
export default function GooglePhotosCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('exchanging') // exchanging | success | error
  const [errorMsg, setErrorMsg] = useState('')
  const exchangedRef = useRef(false)

  useEffect(() => {
    if (exchangedRef.current) return
    exchangedRef.current = true

    const code  = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      setErrorMsg(`Google denied access: ${error}`)
      setStatus('error')
      return
    }

    if (!code) {
      setErrorMsg('No authorization code received from Google.')
      setStatus('error')
      return
    }

    exchangeCode(code)
  }, [])

  async function exchangeCode(code) {
    const { data, error } = await supabase.functions.invoke('google-photos-auth', {
      body: { action: 'exchange_code', code },
    })

    if (error || data?.error) {
      console.error('Token exchange error:', error, data)
      setErrorMsg(data?.error ?? error?.message ?? 'Token exchange failed.')
      setStatus('error')
      return
    }

    setStatus('success')

    // Redirect back to wherever the user came from (stored in sessionStorage)
    // or fall back to the dashboard after a short delay.
    const stored = sessionStorage.getItem('google_photos_return_to')
    sessionStorage.removeItem('google_photos_return_to')
    // Use window.location.href to avoid relative-path appending by React Router
    const returnTo = stored || '/dashboard'
    setTimeout(() => { window.location.href = returnTo }, 1500)
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center">
      <div className="bg-white border border-cream-300 rounded-2xl shadow-sm p-10 max-w-sm w-full text-center space-y-4">
        {status === 'exchanging' && (
          <>
            <svg className="w-8 h-8 animate-spin text-terra-500 mx-auto" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <p className="text-warm-gray-700 font-medium">Connecting Google Photos…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <p className="text-3xl">✓</p>
            <p className="text-warm-gray-800 font-semibold">Google Photos connected!</p>
            <p className="text-warm-gray-400 text-sm">Redirecting you back…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-3xl">⚠️</p>
            <p className="text-warm-gray-800 font-semibold">Connection failed</p>
            <p className="text-sm text-warm-gray-500">{errorMsg}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-terra-500 hover:text-terra-600 text-sm underline cursor-pointer"
            >
              Back to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  )
}
