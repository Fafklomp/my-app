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

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading font-semibold text-2xl text-warm-gray-900">
              Your newsletters
            </h1>
            <p className="text-sm text-warm-gray-400 mt-0.5">
              {newsletters.length === 0
                ? 'No newsletters yet'
                : `${newsletters.length} newsletter${newsletters.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <Link
            to="/newsletters/new"
            className="inline-flex items-center gap-2 bg-terra-500 hover:bg-terra-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
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
              className="w-full bg-white border border-cream-300 rounded-lg px-4 py-2.5 text-sm text-warm-gray-800 placeholder:text-warm-gray-400 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500"
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setStatusFilter(value)}
                  className={`text-sm px-3 py-1.5 rounded-full transition-colors cursor-pointer ${
                    statusFilter === value
                      ? 'bg-warm-gray-900 text-cream-50'
                      : 'text-warm-gray-600 hover:bg-cream-200'
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
          <div className="py-20 text-center text-sm text-warm-gray-400">Loading…</div>
        ) : newsletters.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <p className="text-warm-gray-400 text-sm">You haven't created any newsletters yet.</p>
            <Link
              to="/newsletters/new"
              className="inline-block text-sm font-medium text-warm-gray-900 underline underline-offset-2"
            >
              Create your first one
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-sm text-warm-gray-400">
            No newsletters match your search.
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((n) => {
              const badge = STATUS_STYLES[n.status] ?? STATUS_STYLES.draft
              return (
                <li key={n.id}>
                  <Link
                    to={`/newsletters/${n.id}`}
                    className="flex items-center justify-between bg-white border border-cream-300 rounded-xl shadow-sm px-6 py-4 hover:shadow-md transition-shadow group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-heading font-semibold text-warm-gray-900 truncate group-hover:text-warm-gray-800">
                        {n.title}
                      </p>
                      <p className="text-sm text-warm-gray-400 mt-0.5">
                        {formatDate(n.period_start)} – {formatDate(n.period_end)}
                        {n.cadence && (
                          <span className="ml-2 capitalize">· {n.cadence}</span>
                        )}
                      </p>
                    </div>
                    <span className={`ml-4 shrink-0 ${badge.className}`}>
                      {badge.label}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
