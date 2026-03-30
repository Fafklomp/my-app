import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import { STATUS_STYLES } from '../lib/constants'

const inputClass = 'flex-1 bg-white border border-cream-300 rounded-lg px-4 py-2.5 text-sm text-warm-gray-800 placeholder:text-warm-gray-400 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500'

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
      <dt className="text-xs font-medium text-warm-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm text-warm-gray-800">{value ?? '—'}</dd>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-cream-300 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-cream-300">
        <h2 className="font-heading font-semibold text-warm-gray-800">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
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

  const badge = STATUS_STYLES[newsletter.status] ?? STATUS_STYLES.draft

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar user={user} />

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        {/* Title bar */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-heading font-semibold text-2xl text-warm-gray-900 truncate">
              {newsletter.title}
            </h1>
            <span className={`shrink-0 ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={`/newsletters/${id}/edit`}
              className="bg-cream-200 hover:bg-cream-300 text-warm-gray-800 text-sm font-medium px-5 py-2.5 rounded-lg border border-cream-300 transition-colors"
            >
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium px-5 py-2.5 rounded-lg border border-red-200 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>

        {/* Details */}
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
            <p className="text-sm text-warm-gray-800 whitespace-pre-wrap leading-relaxed">
              {newsletter.content}
            </p>
          ) : (
            <p className="text-sm text-warm-gray-400 italic">
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
                className={inputClass}
              />
              <input
                type="email"
                placeholder="Email"
                value={recipientForm.email}
                onChange={(e) => setRecipientForm((p) => ({ ...p, email: e.target.value }))}
                required
                className={inputClass}
              />
              <button
                type="submit"
                disabled={addingRecipient}
                className="bg-terra-500 hover:bg-terra-600 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                {addingRecipient ? 'Adding…' : 'Add'}
              </button>
            </form>

            {recipientError && (
              <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg border border-red-200">
                {recipientError}
              </p>
            )}

            {recipients.length === 0 ? (
              <p className="text-sm text-warm-gray-400 italic">No recipients yet.</p>
            ) : (
              <ul className="divide-y divide-cream-200">
                {recipients.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-warm-gray-800">{r.name}</p>
                      <p className="text-sm text-warm-gray-400">{r.email}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveRecipient(r.id)}
                      className="text-sm text-warm-gray-400 hover:text-terra-500 transition-colors cursor-pointer"
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
