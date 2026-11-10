import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

const FIELD = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${(import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '')}/reset-password`,
      })
      if (resetError) throw resetError
      setInfo('If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.')
    } catch (err) {
      setError(err.message || 'Unable to send the reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-[420px] rounded-2xl border border-border bg-surface p-7 shadow-sm">
        <Link to="/login" className="inline-flex"><Logo /></Link>
        <h1 className="mt-8 text-2xl font-bold text-text">Forgot your password?</h1>
        <p className="mt-2 text-sm text-muted">Enter the email address associated with your COLLIVRA account. We'll send you a password reset link.</p>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="reset-email" className="mb-1 block text-sm font-medium text-text">Email</label>
            <input id="reset-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} placeholder="you@example.com" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
          {info && <p role="status" className="rounded-lg bg-accent/10 px-3 py-2 text-[13px] text-accent">{info}</p>}
          <button type="submit" disabled={loading} className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50">
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted"><Link to="/login" className="font-semibold text-primary hover:underline">Back to sign in</Link></p>
      </div>
    </div>
  )
}
