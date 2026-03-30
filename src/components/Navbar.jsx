import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const NAV_LINKS = [
  { label: 'Dashboard',     to: '/dashboard' },
  { label: 'Current Draft', to: '/newsletters/new' },
  { label: 'Availability',  to: '/availability' },
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
    <header className="border-b border-cream-300">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-8">

        {/* Brand */}
        <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
          <span className="font-heading font-bold text-xl text-warm-gray-900">Life</span>
          <span className="bg-terra-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            Pulse
          </span>
        </Link>

        {/* Nav links — centered */}
        <nav className="flex items-center justify-center gap-1 flex-1">
          {NAV_LINKS.map(({ label, to }) => {
            const active = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={`font-body text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  active
                    ? 'bg-cream-200 text-warm-gray-900'
                    : 'text-warm-gray-600 hover:text-warm-gray-900'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-4 shrink-0">
          {displayName && (
            <span className="text-sm text-warm-gray-400 hidden sm:block truncate max-w-[160px]">
              {displayName}
            </span>
          )}
          <button
            onClick={handleSignOut}
            className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>

      </div>
    </header>
  )
}
