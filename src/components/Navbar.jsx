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
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-8">
        <Link to="/dashboard" className="font-semibold text-gray-900 shrink-0">
          Life Pulse
        </Link>

        <nav className="flex items-center gap-1 flex-1">
          {NAV_LINKS.map(({ label, to }) => {
            const active = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-4 shrink-0">
          {displayName && (
            <span className="text-sm text-gray-500 hidden sm:block">
              {displayName}
            </span>
          )}
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
