import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const NAV_LINKS = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'New Newsletter', to: '/newsletters/new' },
]

export default function Navbar({ user }) {
  const location = useLocation()
  const navigate = useNavigate()

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.user_name ||
    user?.email

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  return (
    <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-6">
        <Link to="/dashboard" className="font-semibold text-zinc-900 tracking-tight shrink-0">
          Life Pulse
        </Link>

        <nav className="flex items-center gap-1 flex-1">
          {NAV_LINKS.map(({ label, to }) => {
            const active = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-zinc-100 text-zinc-900 font-medium'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-4 shrink-0">
          {displayName && (
            <span className="text-sm text-zinc-400 hidden sm:block truncate max-w-[160px]">
              {displayName}
            </span>
          )}
          <button
            onClick={handleSignOut}
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
