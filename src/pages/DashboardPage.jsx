import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [newsletters, setNewsletters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/', { replace: true })
      } else {
        setUser(session.user)
        fetchNewsletters(session.user.id)
      }
    })
  }, [navigate])

  async function fetchNewsletters(userId) {
    const { data } = await supabase
      .from('newsletters')
      .select('id, title, cadence, status, period_start, period_end')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    setNewsletters(data ?? [])
    setLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  if (!user) return null

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.user_name ||
    user.email

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-semibold text-gray-900">Life Pulse</span>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Welcome back, {displayName}
            </h1>
            <p className="mt-1 text-gray-500">Your newsletters</p>
          </div>
          <Link
            to="/newsletters/new"
            className="bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            New Newsletter
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : newsletters.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-sm">No newsletters yet.</p>
            <Link
              to="/newsletters/new"
              className="mt-3 inline-block text-sm text-gray-900 underline underline-offset-2"
            >
              Create your first one
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {newsletters.map((n) => (
              <li key={n.id}>
                <Link
                  to={`/newsletters/${n.id}`}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-5 py-4 hover:border-gray-400 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{n.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {formatDate(n.period_start)} – {formatDate(n.period_end)}
                      {n.cadence && (
                        <span className="ml-2 capitalize">· {n.cadence}</span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`ml-4 shrink-0 text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[n.status] ?? STATUS_STYLES.draft}`}
                  >
                    {n.status.replace('_', ' ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
