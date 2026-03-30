import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FEATURES = [
  {
    icon: '📸',
    title: 'Aggregates your moments',
    description: 'Pulls photos and activity from your connected accounts automatically.',
  },
  {
    icon: '✍️',
    title: 'AI writes the story',
    description: 'Generates a warm, readable newsletter from your recent highlights.',
  },
  {
    icon: '✅',
    title: 'You approve before it sends',
    description: 'Nothing goes out without your sign-off. Your story, your control.',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session) {
          navigate('/dashboard', { replace: true })
        } else {
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }, [navigate])

  async function handleSignIn() {
    setSigningIn(true)
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    })
  }

  if (loading) return null

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
        <span className="font-semibold text-zinc-900 tracking-tight">Life Pulse</span>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer disabled:opacity-50"
        >
          Sign in
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 bg-zinc-100 text-zinc-600 text-xs font-medium px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
              Personal newsletters, automated
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-zinc-900 leading-tight">
              Keep your family<br className="hidden sm:block" /> in the loop
            </h1>
            <p className="text-lg text-zinc-500 max-w-xl mx-auto leading-relaxed">
              Life Pulse turns your photos and daily moments into a beautiful newsletter —
              so the people who matter always know what you've been up to.
            </p>
          </div>

          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="inline-flex items-center gap-3 bg-zinc-900 hover:bg-zinc-700 disabled:opacity-60 text-white font-medium px-7 py-3.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm text-sm"
          >
            <GitHubIcon />
            {signingIn ? 'Redirecting…' : 'Continue with GitHub'}
          </button>

          {/* Feature grid */}
          <div className="grid sm:grid-cols-3 gap-4 pt-8 text-left">
            {FEATURES.map(({ icon, title, description }) => (
              <div key={title} className="bg-zinc-50 rounded-2xl p-5 space-y-2">
                <span className="text-2xl">{icon}</span>
                <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 text-center text-xs text-zinc-400">
        Private beta · Your data is only ever shared with people you choose
      </footer>
    </div>
  )
}

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482
           0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.154-1.11-1.462-1.11-1.462
           -.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832
           .092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943
           0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647
           0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844a9.56 9.56 0 012.504.337
           c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647
           .64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935
           .359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743
           0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12
           c0-5.523-4.477-10-10-10z"
      />
    </svg>
  )
}
