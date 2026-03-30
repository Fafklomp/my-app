import { useEffect, useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import { STATUS_STYLES } from '../lib/constants'

const STATUS_FILTERS = [
  { label: 'All',              value: null },
  { label: 'Draft',            value: 'draft' },
  { label: 'Pending approval', value: 'pending_approval' },
  { label: 'Approved',         value: 'approved' },
  { label: 'Sent',             value: 'sent' },
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
    <div className="min-h-screen bg-cream-100">
      <Navbar user={user} />

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-warm-gray-900">Your newsletters</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              {newsletters.length === 0
                ? 'No newsletters yet'
                : `${newsletters.length} newsletter${newsletters.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <Link
            to="/newsletters/new"
            className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            <span className="text-base leading-none">+</span>
            New Newsletter
          </Link>
        </div>

        {/* Search + filters */}
        {!loading && newsletters.length > 0 && (
          <div className="space-y-3 mb-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search newsletters…"
              className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-warm-gray-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm"
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setStatusFilter(value)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                    statusFilter === value
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-warm-gray-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* List states */}
        {loading ? (
          <div className="py-20 text-center text-sm text-zinc-400">Loading…</div>
        ) : newsletters.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <p className="text-zinc-400 text-sm">You haven't created any newsletters yet.</p>
            <Link
              to="/newsletters/new"
              className="inline-block text-sm font-medium text-warm-gray-900 underline underline-offset-2"
            >
              Create your first one
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-sm text-zinc-400">
            No newsletters match your search.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((n) => (
              <li key={n.id}>
                <Link
                  to={`/newsletters/${n.id}`}
                  className="flex items-center justify-between bg-white border border-zinc-200 rounded-xl px-5 py-4 hover:border-zinc-400 hover:shadow-sm transition-all group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-warm-gray-900 truncate group-hover:text-zinc-700">
                      {n.title}
                    </p>
                    <p className="text-sm text-zinc-400 mt-0.5">
                      {formatDate(n.period_start)} – {formatDate(n.period_end)}
                      {n.cadence && (
                        <span className="ml-2 capitalize">· {n.cadence}</span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`ml-4 shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${(STATUS_STYLES[n.status] ?? STATUS_STYLES.draft).bg} ${(STATUS_STYLES[n.status] ?? STATUS_STYLES.draft).text}`}
                  >
                    {(STATUS_STYLES[n.status] ?? STATUS_STYLES.draft).label}
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
