import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
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
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  )
}

export default function NewsletterDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [newsletter, setNewsletter] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/', { replace: true })
        return
      }
      fetchNewsletter(session.user.id)
    })
  }, [id, navigate])

  async function fetchNewsletter(userId) {
    const { data } = await supabase
      .from('newsletters')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (!data) {
      navigate('/dashboard', { replace: true })
      return
    }
    setNewsletter(data)
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      'Are you sure you want to delete this newsletter? This cannot be undone.'
    )
    if (!confirmed) return

    setDeleting(true)
    await supabase.from('newsletters').delete().eq('id', id)
    navigate('/dashboard', { replace: true })
  }

  if (!newsletter) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to={`/newsletters/${id}/edit`}
              className="text-sm font-medium text-gray-700 border border-gray-300 hover:border-gray-500 px-4 py-2 rounded-lg transition-colors"
            >
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm font-medium text-red-600 border border-red-200 hover:border-red-400 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">{newsletter.title}</h1>
          <span
            className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[newsletter.status] ?? STATUS_STYLES.draft}`}
          >
            {newsletter.status.replace('_', ' ')}
          </span>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-6 bg-white border border-gray-200 rounded-lg px-6 py-5">
          <Field label="Cadence" value={newsletter.cadence ? newsletter.cadence.charAt(0).toUpperCase() + newsletter.cadence.slice(1) : null} />
          <Field label="Period start" value={formatDate(newsletter.period_start)} />
          <Field label="Period end" value={formatDate(newsletter.period_end)} />
          <Field label="Sent at" value={formatDate(newsletter.sent_at)} />
          <Field label="Created" value={formatDate(newsletter.created_at)} />
        </dl>

        <div className="bg-white border border-gray-200 rounded-lg px-6 py-5">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Content
          </h2>
          {newsletter.content ? (
            <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
              {newsletter.content}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">
              No content yet — this will be filled in when the newsletter is generated.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
