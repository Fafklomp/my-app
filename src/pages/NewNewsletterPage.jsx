import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

const inputClass = 'w-full bg-white border border-cream-300 rounded-lg px-4 py-2.5 text-sm text-warm-gray-800 placeholder:text-warm-gray-400 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500'

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
    <div className="min-h-screen bg-cream-100">
      <Navbar user={user} />

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="font-heading font-semibold text-2xl text-warm-gray-900">
            New Newsletter
          </h1>
          <p className="text-sm text-warm-gray-400 mt-1">
            Fill in the details to create a new newsletter edition.
          </p>
        </div>

        <div className="bg-white border border-cream-300 rounded-xl shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-warm-gray-800 mb-1.5">
                Title <span className="text-terra-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                required
                placeholder="e.g. March update"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-gray-800 mb-1.5">
                Cadence <span className="text-terra-500">*</span>
              </label>
              <select
                name="cadence"
                value={form.cadence}
                onChange={handleChange}
                required
                className={inputClass}
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
                <label className="block text-sm font-medium text-warm-gray-800 mb-1.5">
                  Period start <span className="text-terra-500">*</span>
                </label>
                <input
                  type="date"
                  name="period_start"
                  value={form.period_start}
                  onChange={handleChange}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-gray-800 mb-1.5">
                  Period end <span className="text-terra-500">*</span>
                </label>
                <input
                  type="date"
                  name="period_end"
                  value={form.period_end}
                  onChange={handleChange}
                  required
                  className={inputClass}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-lg border border-red-200">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex-1 bg-cream-200 hover:bg-cream-300 text-warm-gray-800 text-sm font-medium px-5 py-2.5 rounded-lg border border-cream-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-terra-500 hover:bg-terra-600 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
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
