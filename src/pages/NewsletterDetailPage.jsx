import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import { STATUS_STYLES } from '../lib/constants'

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
      <dt className="text-xs font-medium text-zinc-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm text-warm-gray-900">{value ?? '—'}</dd>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-medium text-warm-gray-900">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
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
    <div className="min-h-screen bg-cream-100">
      <Navbar user={user} />

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        {/* Title bar */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl font-semibold text-warm-gray-900 truncate">
              {newsletter.title}
            </h1>
            <span
              className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${(STATUS_STYLES[newsletter.status] ?? STATUS_STYLES.draft).bg} ${(STATUS_STYLES[newsletter.status] ?? STATUS_STYLES.draft).text}`}
            >
              {(STATUS_STYLES[newsletter.status] ?? STATUS_STYLES.draft).label}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={`/newsletters/${id}/edit`}
              className="text-sm font-medium text-zinc-700 border border-zinc-200 hover:border-zinc-400 bg-white px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm font-medium text-red-500 border border-red-100 hover:border-red-300 bg-white disabled:opacity-50 px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>

        {/* Metadata */}
        <Section title="Details">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-6">
            <Field
              label="Cadence"
              value={newsletter.cadence
                ? newsletter.cadence.charAt(0).toUpperCase() + newsletter.cadence.slice(1)
                : null}
            />
            <Field label="Period start" value={formatDate(newsletter.period_start)} />
            <Field label="Period end"   value={formatDate(newsletter.period_end)} />
            <Field label="Sent at"      value={formatDate(newsletter.sent_at)} />
            <Field label="Created"      value={formatDate(newsletter.created_at)} />
          </dl>
        </Section>

        {/* Content */}
        <Section title="Content">
          {newsletter.content ? (
            <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
              {newsletter.content}
            </p>
          ) : (
            <p className="text-sm text-zinc-400 italic">
              No content yet — this will be filled in when the newsletter is generated.
            </p>
          )}
        </Section>

        {/* Recipients */}
        <Section title={`Recipients${recipients.length > 0 ? ` (${recipients.length})` : ''}`}>
          <div className="space-y-5">
            <form onSubmit={handleAddRecipient} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Name"
                value={recipientForm.name}
                onChange={(e) => setRecipientForm((p) => ({ ...p, name: e.target.value }))}
                required
                className="flex-1 border border-zinc-200 rounded-lg px-3.5 py-2.5 text-sm text-warm-gray-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
              />
              <input
                type="email"
                placeholder="Email"
                value={recipientForm.email}
                onChange={(e) => setRecipientForm((p) => ({ ...p, email: e.target.value }))}
                required
                className="flex-1 border border-zinc-200 rounded-lg px-3.5 py-2.5 text-sm text-warm-gray-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
              />
              <button
                type="submit"
                disabled={addingRecipient}
                className="bg-zinc-900 hover:bg-zinc-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                {addingRecipient ? 'Adding…' : 'Add'}
              </button>
            </form>

            {recipientError && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                {recipientError}
              </p>
            )}

            {recipients.length === 0 ? (
              <p className="text-sm text-zinc-400 italic">No recipients yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {recipients.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-warm-gray-900">{r.name}</p>
                      <p className="text-sm text-zinc-400">{r.email}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveRecipient(r.id)}
                      className="text-xs text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </main>
    </div>
  )
}
