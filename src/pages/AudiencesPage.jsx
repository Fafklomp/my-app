import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

const inputClass =
  'w-full bg-white border border-cream-300 rounded-lg px-4 py-2.5 text-sm text-warm-gray-800 placeholder:text-warm-gray-400 focus:outline-none focus:ring-2 focus:ring-terra-500/30 focus:border-terra-500'

export default function AudiencesPage() {
  const navigate = useNavigate()
  const [user, setUser]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [audiences, setAudiences]     = useState([])
  const [showNewForm, setShowNewForm] = useState(false)
  const [newForm, setNewForm]         = useState({ name: '', description: '' })
  const [saving, setSaving]           = useState(false)
  const [editingId, setEditingId]     = useState(null)
  const [editForm, setEditForm]       = useState({ name: '', description: '' })
  const [memberForms, setMemberForms] = useState({})
  const [addingMember, setAddingMember] = useState({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/', { replace: true })
      } else {
        setUser(session.user)
        fetchAudiences(session.user.id)
      }
    })
  }, [navigate])

  async function fetchAudiences(userId) {
    const [{ data: lists }, { data: members }] = await Promise.all([
      supabase
        .from('audience_lists')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
      supabase
        .from('audience_members')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
    ])

    const byList = {}
    members?.forEach((m) => {
      if (!byList[m.audience_list_id]) byList[m.audience_list_id] = []
      byList[m.audience_list_id].push(m)
    })

    setAudiences((lists ?? []).map((l) => ({ ...l, members: byList[l.id] ?? [] })))
    setLoading(false)
  }

  // ── Create audience ──
  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('audience_lists').insert({
      user_id: user.id,
      name: newForm.name,
      description: newForm.description || null,
    })
    setNewForm({ name: '', description: '' })
    setShowNewForm(false)
    setSaving(false)
    fetchAudiences(user.id)
  }

  // ── Edit audience ──
  function startEdit(audience) {
    setEditingId(audience.id)
    setEditForm({ name: audience.name, description: audience.description ?? '' })
  }

  async function handleSaveEdit(e, id) {
    e.preventDefault()
    await supabase
      .from('audience_lists')
      .update({ name: editForm.name, description: editForm.description || null })
      .eq('id', id)
    setEditingId(null)
    fetchAudiences(user.id)
  }

  // ── Delete audience ──
  async function handleDelete(id) {
    const confirmed = window.confirm(
      'Delete this audience? All members will also be removed.'
    )
    if (!confirmed) return
    await supabase.from('audience_lists').delete().eq('id', id)
    fetchAudiences(user.id)
  }

  // ── Add member ──
  function getMemberForm(listId) {
    return memberForms[listId] ?? { name: '', email: '' }
  }

  function setMemberForm(listId, field, value) {
    setMemberForms((prev) => ({
      ...prev,
      [listId]: { ...getMemberForm(listId), [field]: value },
    }))
  }

  async function handleAddMember(e, listId) {
    e.preventDefault()
    setAddingMember((prev) => ({ ...prev, [listId]: true }))
    const form = getMemberForm(listId)
    await supabase.from('audience_members').insert({
      audience_list_id: listId,
      user_id: user.id,
      name: form.name,
      email: form.email,
    })
    setMemberForms((prev) => ({ ...prev, [listId]: { name: '', email: '' } }))
    setAddingMember((prev) => ({ ...prev, [listId]: false }))
    fetchAudiences(user.id)
  }

  // ── Remove member ──
  async function handleRemoveMember(memberId) {
    await supabase.from('audience_members').delete().eq('id', memberId)
    fetchAudiences(user.id)
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar user={user} />

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* ── Page header ── */}
        <div>
          <Link
            to="/dashboard"
            className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors"
          >
            ← Back to dashboard
          </Link>
          <div className="flex items-start justify-between gap-4 mt-3">
            <div>
              <h1 className="font-heading font-bold text-3xl text-warm-gray-900">
                Your Audiences
              </h1>
              <p className="text-warm-gray-400 text-base mt-1">
                Manage who receives your updates and how the AI writes for them.
              </p>
            </div>
            {!showNewForm && (
              <button
                onClick={() => setShowNewForm(true)}
                className="shrink-0 bg-terra-500 hover:bg-terra-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                + New Audience
              </button>
            )}
          </div>
        </div>

        {/* ── Inline new audience form ── */}
        {showNewForm && (
          <div className="bg-white border border-cream-300 rounded-xl shadow-sm p-6">
            <h2 className="font-heading font-semibold text-lg text-warm-gray-900 mb-4">
              New Audience
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-warm-gray-700 mb-1.5">
                  Name <span className="text-terra-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Family, Close Friends, Colleagues"
                  value={newForm.name}
                  onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-gray-700 mb-1.5">
                  Tone description
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the tone for this audience. e.g., 'Keep it wholesome and casual, family-friendly content only' or 'Unfiltered and candid, inside jokes welcome'"
                  value={newForm.description}
                  onChange={(e) => setNewForm((p) => ({ ...p, description: e.target.value }))}
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowNewForm(false); setNewForm({ name: '', description: '' }) }}
                  className="flex-1 bg-cream-200 hover:bg-cream-300 text-warm-gray-800 text-sm font-medium px-5 py-2.5 rounded-lg border border-cream-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-terra-500 hover:bg-terra-600 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {saving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <p className="text-sm text-warm-gray-400">Loading…</p>
        )}

        {/* ── Empty state ── */}
        {!loading && audiences.length === 0 && (
          <div className="bg-white border-2 border-dashed border-cream-300 rounded-xl p-10 text-center space-y-3">
            <div className="text-5xl">👥</div>
            <p className="font-heading text-xl text-warm-gray-800">No audiences yet</p>
            <p className="text-sm text-warm-gray-400">
              Create your first audience list to start sending personalized updates.
            </p>
            <button
              onClick={() => setShowNewForm(true)}
              className="inline-block bg-terra-500 hover:bg-terra-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors cursor-pointer mt-1"
            >
              + Create Audience
            </button>
          </div>
        )}

        {/* ── Audience cards ── */}
        {!loading && audiences.map((audience) => {
          const isEditing = editingId === audience.id
          const memberForm = getMemberForm(audience.id)

          return (
            <div
              key={audience.id}
              className="bg-white border border-cream-300 rounded-xl shadow-sm p-6"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-4">
                {isEditing ? (
                  <form
                    onSubmit={(e) => handleSaveEdit(e, audience.id)}
                    className="flex-1 space-y-3"
                  >
                    <input
                      type="text"
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      className={inputClass}
                    />
                    <textarea
                      rows={2}
                      value={editForm.description}
                      onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Tone description"
                      className={`${inputClass} resize-none`}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-sm text-warm-gray-400 hover:text-warm-gray-600 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="text-sm text-terra-500 hover:text-terra-600 font-medium transition-colors cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <h2 className="font-heading text-xl font-semibold text-warm-gray-900">
                    {audience.name}
                  </h2>
                )}

                {!isEditing && (
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => startEdit(audience)}
                      className="text-sm text-warm-gray-400 hover:text-terra-500 transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(audience.id)}
                      className="text-sm text-warm-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Tone description */}
              {!isEditing && (
                <p className={`text-sm mt-2 italic ${audience.description ? 'text-warm-gray-500' : 'text-warm-gray-300'}`}>
                  {audience.description ?? 'No tone description set'}
                </p>
              )}

              {/* Members */}
              <div className="border-t border-cream-200 mt-4 pt-4">
                <p className="text-sm font-medium text-warm-gray-600 mb-3">
                  Members ({audience.members.length})
                </p>

                {audience.members.length === 0 ? (
                  <p className="text-sm text-warm-gray-300 italic mb-3">No members yet.</p>
                ) : (
                  <ul className="divide-y divide-cream-100 mb-4">
                    {audience.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-sm text-warm-gray-800">{m.name}</p>
                          <p className="text-sm text-warm-gray-400">{m.email}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          className="text-sm text-warm-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Add member form */}
                <form
                  onSubmit={(e) => handleAddMember(e, audience.id)}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  <input
                    type="text"
                    placeholder="Name"
                    required
                    value={memberForm.name}
                    onChange={(e) => setMemberForm(audience.id, 'name', e.target.value)}
                    className={inputClass}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    required
                    value={memberForm.email}
                    onChange={(e) => setMemberForm(audience.id, 'email', e.target.value)}
                    className={inputClass}
                  />
                  <button
                    type="submit"
                    disabled={addingMember[audience.id]}
                    className="bg-terra-500 hover:bg-terra-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    {addingMember[audience.id] ? 'Adding…' : 'Add'}
                  </button>
                </form>
              </div>
            </div>
          )
        })}

      </main>
    </div>
  )
}
