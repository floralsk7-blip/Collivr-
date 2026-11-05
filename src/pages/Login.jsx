import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Logo from '../components/Logo'

const FIELD = 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none'

export default function Login() {
  const [params] = useSearchParams()
  const [isSignUp, setIsSignUp] = useState(params.get('mode') === 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accountType, setAccountType] = useState('student')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSignUp() {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { account_type: accountType } },
    })
    if (signUpError) return setError(signUpError.message)

    // A session means email confirmation is off and the user is already signed in.
    if (data?.session) return navigate('/profile')

    if (data?.user) {
      const { data: signedIn } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signedIn?.session) return navigate('/profile')
      setInfo('Account created. Check your email to confirm it, then sign in.')
      setIsSignUp(false)
    }
  }

  async function handleSignIn() {
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) return setError(signInError.message)
    if (data?.session) {
      const { data: profile } = await supabase.from('student_profiles').select('id, account_type').eq('id', data.session.user.id).maybeSingle()
      navigate(profile ? (profile.account_type === 'student' ? '/dashboard' : '/events') : '/profile')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (isSignUp && password.length < 6) return setError('Use a password with at least 6 characters.')
    setLoading(true)
    try {
      await (isSignUp ? handleSignUp() : handleSignIn())
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  async function handleGoogleLogin() {
  setError('')
  setLoading(true)

  const { error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/login`,
      queryParams: {
        prompt: 'select_account',
      },
    },
  })

  if (oauthError) {
    setError(oauthError.message)
    setLoading(false)
  }
}

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[44%] flex-col justify-between bg-sidebarBg p-12 md:flex">
        <Link to="/"><Logo dark size="lg" /></Link>
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight text-white">Build the right team, not just a full one.</h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-sidebarText">
            Match on skills, experience and availability, and see exactly why a team works.
          </p>
        </div>
        <p className="text-xs text-sidebarText/60">PayPal AI Hackathon, Team Asterisk*</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-bg px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 md:hidden"><Link to="/"><Logo /></Link></div>
<div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-border/40 p-1">
  <button
    type="button"
    onClick={() => {
      setIsSignUp(false)
      setError('')
      setInfo('')
    }}
    className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
      !isSignUp
        ? 'bg-surface text-primary shadow-sm'
        : 'text-muted hover:text-text'
    }`}
  >
    Sign in
  </button>

  <button
    type="button"
    onClick={() => {
      setIsSignUp(true)
      setError('')
      setInfo('')
    }}
    className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
      isSignUp
        ? 'bg-surface text-primary shadow-sm'
        : 'text-muted hover:text-text'
    }`}
  >
    Create account
  </button>
</div>
          <h2 className="text-2xl font-bold text-text">{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
          <p className="mt-1 text-sm text-muted">{isSignUp ? 'It is free to start.' : 'Sign in to continue.'}</p>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text hover:border-borderStrong"
          >
            <span className="font-bold text-primary">G</span> Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" /> or use email <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isSignUp && (
              <div>
                <label htmlFor="accountType" className="mb-1 block text-sm font-medium text-text">Account type</label>
                <select id="accountType" value={accountType} onChange={(e) => setAccountType(e.target.value)} className={FIELD}>
                  <option value="student">Student</option>
                  <option value="organiser">Event Organiser</option>
                </select>
                <p className="mt-1 text-xs text-muted">Students can join events. Event Organisers create and manage events directly. Set your College/University or Company/Organisation details in your profile.</p>
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-text">Email</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} placeholder="you@college.edu" />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-text">Password</label>
              <input id="password" type="password" required autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} placeholder="At least 6 characters" />
            </div>
            {!isSignUp && (
              <div className="-mt-2 text-right">
                <Link to="/forgot-password" className="text-sm font-semibold text-primary hover:underline">Forgot password?</Link>
              </div>
            )}

            {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}
            {info && <p className="rounded-lg bg-accent/10 px-3 py-2 text-[13px] text-accent">{info}</p>}

            <button type="submit" disabled={loading} className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50">
              {loading ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isSignUp ? 'Already have an account?' : 'New to COLLIVRA?'}{' '}
            <button type="button" onClick={() => { setIsSignUp((v) => !v); setError(''); setInfo('') }} className="font-semibold text-primary hover:underline">
              {isSignUp ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
