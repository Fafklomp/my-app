import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

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
  const [user, setUser] = useState(null)
  const [newsletter, setNewsletter] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [recipients, setRecipients] = useState([])
  const [recipientForm, setRecipientForm] = useState({ name: '', email: '' })
  const [addingRecipient, setAddingRecipient] = useState(false)
  const [recipientError, setRecipientError] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/', { replace: true })
        return
      }
      setUser(session.user)
      fetchNewsletter(session.user.id)
      fetchRecipients()
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

  async function fetchRecipients() {
    const { data } = await supabase
      .from('recipients')
      .select('id, name, email, created_at')
      .eq('newsletter_id', id)
      .order('created_at', { ascending: false })

    setRecipients(data ?? [])
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

  async function handleAddRecipient(e) {
    e.preventDefault()
    setAddingRecipient(true)
    setRecipientError(null)

    const { error } = await supabase.from('recipients').insert({
      user_id: user.id,
      newsletter_id: id,
      name: recipientForm.name,
      email: recipientForm.email,
    })

    if (error) {
      setRecipientError(error.message)
      setAddingRecipient(false)
    } else {
      setRecipientForm({ name: '', email: '' })
      setAddingRecipient(false)
      fetchRecipients()
    }
  }

  async function handleRemoveRecipient(recipientId) {
    await supabase.from('recipients').delete().eq('id', recipientId)
    setRecipients((prev) => prev.filter((r) => r.id !== recipientId))
  }

  if (!user || !newsletter) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        {/* Title + actions */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900 truncate">
              {newsletter.title}
            </h1>
            <span
              className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[newsletter.status] ?? STATUS_STYLES.draft}`}
            >
              {newsletter.status.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
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

        {/* Metadata */}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-6 bg-white border border-gray-200 rounded-lg px-6 py-5">
          <Field label="Cadence" value={newsletter.cadence ? newsletter.cadence.charAt(0).toUpperCase() + newsletter.cadence.slice(1) : null} />
          <Field label="Period start" value={formatDate(newsletter.period_start)} />
          <Field label="Period end" value={formatDate(newsletter.period_end)} />
          <Field label="Sent at" value={formatDate(newsletter.sent_at)} />
          <Field label="Created" value={formatDate(newsletter.created_at)} />
        </dl>

        {/* Content */}
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

        {/* Recipients */}
        <div className="bg-white border border-gray-200 rounded-lg px-6 py-5 space-y-5">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Recipients
          </h2>

          {/* Add form */}
          <form onSubmit={handleAddRecipient} className="flex gap-2">
            <input
              type="text"
              placeholder="Name"
              value={recipientForm.name}
              onChange={(e) => setRecipientForm((p) => ({ ...p, name: e.target.value }))}
              required
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <input
              type="email"
              placeholder="Email"
              value={recipientForm.email}
              onChange={(e) => setRecipientForm((p) => ({ ...p, email: e.target.value }))}
              required
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="submit"
              disabled={addingRecipient}
              className="bg-gray-900 hover:bg-gray-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              {addingRecipient ? 'Adding…' : 'Add'}
            </button>
          </form>

          {recipientError && (
            <p className="text-sm text-red-600">{recipientError}</p>
          )}

          {/* List */}
          {recipients.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No recipients yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recipients.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.name}</p>
                    <p className="text-sm text-gray-500">{r.email}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveRecipient(r.id)}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
