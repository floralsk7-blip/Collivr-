import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import AppShell from '../components/AppShell'
import { useSubscription } from '../hooks/useSubscription'
import { TIER_LABEL } from '../lib/plans'

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-[23px] w-[42px] rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-border'}`}
    >
      <span className={`absolute top-[2.5px] h-[18px] w-[18px] rounded-full bg-surface transition-all ${checked ? 'left-[21px]' : 'left-[2.5px]'}`} />
    </button>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const { profile, refresh } = useProfile()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(profile?.open_to_collaborate ?? true)
  const sub = useSubscription()

  async function updatePassword(e) {
    e.preventDefault()
    if (!newPassword) return
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setMessage(error ? error.message : 'Password updated.')
    setNewPassword('')
    setSaving(false)
  }

  async function toggleVisibility(next) {
    setVisible(next)
    await supabase.from('student_profiles').update({ open_to_collaborate: next }).eq('id', user.id)
    refresh()
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <AppShell breadcrumb={<span>Settings</span>}>
      <div className="mx-auto max-w-2xl px-6 py-7 md:px-9">
        <h1 className="mb-6 text-2xl font-bold text-text">Settings</h1>

        <div className="mb-5 rounded-[14px] border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">Account</h3>
          <p className="mb-4 text-sm text-textSecondary">Signed in as <span className="font-medium text-text">{user?.email}</span></p>
          <form onSubmit={updatePassword} className="flex gap-2">
            <input
              type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="flex-1 rounded-[9px] border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
            />
            <button type="submit" disabled={saving} className="rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50">
              {saving ? 'Saving...' : 'Update'}
            </button>
          </form>
          {message && <p className="mt-2 text-xs text-accent">{message}</p>}
        </div>

        <div className="mb-5 rounded-[14px] border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">Profile Visibility</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-textSecondary">Open to collaborate</span>
            <Toggle checked={visible} onChange={toggleVisibility} />
          </div>
        </div>

        <div className="mb-5 rounded-[14px] border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">Plan</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-textSecondary">You are on the <span className="font-medium text-text">{TIER_LABEL[sub.tier]}</span> plan</span>
            <Link to="/pricing" className="text-sm font-semibold text-primary hover:underline">Manage plan</Link>
          </div>
        </div>

        <button onClick={signOut} className="w-full rounded-[9px] border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/20">
          Sign Out
        </button>
      </div>
    </AppShell>
  )
}
