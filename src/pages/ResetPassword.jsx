import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

const FIELD = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (password.length < 6) return setError('Your password must contain at least 6 characters.')
    if (password !== confirmPassword) return setError('The passwords do not match.')
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setInfo('Your password has been updated. You can now sign in with your new password.')
      await supabase.auth.signOut()
      setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (err) {
      setError(err.message || 'Unable to update your password. Request a new reset link and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface p-7 shadow-sm">
        <Link to="/login" className="inline-flex"><Logo /></Link>
        <h1 className="mt-8 text-2xl font-bold text-text">Create a new password</h1>
        <p className="mt-2 text-sm text-muted">Choose a new password for your COLLIVRA account.</p>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-text">New password</label>
            <input id="new-password" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} placeholder="At least 6 characters" />
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-text">Confirm new password</label>
            <input id="confirm-password" type="password" required minLength={6} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={FIELD} placeholder="Enter password again" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
          {info && <p role="status" className="rounded-lg bg-accent/10 px-3 py-2 text-[13px] text-accent">{info}</p>}
          <button type="submit" disabled={loading} className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50">
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted"><Link to="/login" className="font-semibold text-primary hover:underline">Back to sign in</Link></p>
      </div>
    </div>
  )
}
