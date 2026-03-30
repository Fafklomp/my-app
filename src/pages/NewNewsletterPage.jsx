import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

export default function NewNewsletterPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    title: '',
    cadence: '',
    period_start: '',
    period_end: '',
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/', { replace: true })
      } else {
        setUser(session.user)
      }
    })
  }, [navigate])

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { error } = await supabase.from('newsletters').insert({
      user_id: user.id,
      title: form.title,
      cadence: form.cadence,
      period_start: form.period_start,
      period_end: form.period_end,
      status: 'draft',
    })

    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      navigate('/dashboard')
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar user={user} />

      <main className="max-w-xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-900">New Newsletter</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Fill in the details to create a new newsletter edition.
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                required
                placeholder="e.g. March update"
                className="w-full border border-zinc-200 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Cadence <span className="text-red-400">*</span>
              </label>
              <select
                name="cadence"
                value={form.cadence}
                onChange={handleChange}
                required
                className="w-full border border-zinc-200 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition bg-white"
              >
                <option value="" disabled>Select cadence</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Period start <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  name="period_start"
                  value={form.period_start}
                  onChange={handleChange}
                  required
                  className="w-full border border-zinc-200 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Period end <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  name="period_end"
                  value={form.period_end}
                  onChange={handleChange}
                  required
                  className="w-full border border-zinc-200 rounded-lg px-3.5 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex-1 text-sm font-medium text-zinc-600 border border-zinc-200 hover:border-zinc-400 px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-zinc-900 hover:bg-zinc-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Create newsletter'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
