import { useEffect, useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
}

const STATUS_FILTERS = [
  { label: 'All', value: null },
  { label: 'Draft', value: 'draft' },
  { label: 'Pending approval', value: 'pending_approval' },
  { label: 'Approved', value: 'approved' },
  { label: 'Sent', value: 'sent' },
]

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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return newsletters.filter((n) => {
      const matchesSearch = !term || n.title.toLowerCase().includes(term)
      const matchesStatus = !statusFilter || n.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [newsletters, search, statusFilter])

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Your newsletters</h1>
          <Link
            to="/newsletters/new"
            className="bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            New Newsletter
          </Link>
        </div>

        {!loading && newsletters.length > 0 && (
          <div className="space-y-3 mb-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search newsletters…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setStatusFilter(value)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                    statusFilter === value
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

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
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">
            No newsletters match your search.
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((n) => (
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
