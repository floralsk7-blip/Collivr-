import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useSubscription } from '../hooks/useSubscription'
import AppShell from '../components/AppShell'
import UpgradeNotice from '../components/UpgradeNotice'
import { cancelMentorship, listMentors, matchMentors, requestMentor, respondMentorship } from '../lib/mentorship'

const FIELD = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none'
const STATUS_STYLE = {
  pending: 'bg-warning/10 text-warning',
  accepted: 'bg-accent/10 text-accent',
  declined: 'bg-danger/10 text-danger',
  cancelled: 'bg-surface2 text-muted',
}

export default function Mentors() {
  const { user } = useAuth()
  const sub = useSubscription()
  const premium = sub.tier !== 'free'

  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [mentors, setMentors] = useState(null)
  const [notice, setNotice] = useState('')
  const [aiRanked, setAiRanked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [sent, setSent] = useState([])
  const [received, setReceived] = useState([])
  const [openFor, setOpenFor] = useState(null)
  const [message, setMessage] = useState('')
  const [mine, setMine] = useState({ is_mentor: false, topics: '', bio: '' })

  const loadRequests = useCallback(async () => {
    if (!user) return
    const { data, error: loadError } = await supabase
      .from('mentorship_requests')
      .select('*, mentor:student_profiles!mentorship_requests_mentor_id_fkey(id,name,college), mentee:student_profiles!mentorship_requests_mentee_id_fkey(id,name,college,skills)')
      .or(`mentee_id.eq.${user.id},mentor_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
    if (loadError) return setError('Mentorship is not set up yet. Run the latest database migration (see START_HERE.md).')
    setSent((data || []).filter((r) => r.mentee_id === user.id))
    setReceived((data || []).filter((r) => r.mentor_id === user.id))
  }, [user])

  useEffect(() => {
    if (!user) return
    supabase.from('projects').select('id, name').eq('creator_id', user.id).then(({ data }) => setProjects(data || []))
    supabase.from('student_profiles').select('is_mentor, mentor_topics, mentor_bio').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (data) setMine({ is_mentor: !!data.is_mentor, topics: (data.mentor_topics || []).join(', '), bio: data.mentor_bio || '' })
    })
    loadRequests()
  }, [user, loadRequests])

  const loadMentors = useCallback(async () => {
    if (!premium) return
    setError('')
    setBusy(true)
    try {
      const res = await listMentors(projectId || undefined)
      setMentors(res.mentors)
      setAiRanked(false)
      setNotice('')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }, [premium, projectId])

  useEffect(() => {
    if (!sub.loading) loadMentors()
  }, [sub.loading, loadMentors])

  async function findWithAi() {
    setBusy(true)
    setError('')
    try {
      const res = await matchMentors(projectId || undefined)
      setMentors(res.mentors)
      setAiRanked(res.source === 'ai')
      setNotice(res.notice || '')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function sendRequest(mentorId) {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await requestMentor({ mentorId, projectId: projectId || undefined, message })
      setInfo('Request sent. You will see the answer under "Your requests".')
      setOpenFor(null)
      setMessage('')
      await loadRequests()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function act(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      await loadRequests()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function saveMentorProfile() {
    setError('')
    const topics = [...new Set(mine.topics.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 10)
    const { error: saveError } = await supabase
      .from('student_profiles')
      .update({ is_mentor: mine.is_mentor, mentor_topics: topics, mentor_bio: mine.bio.trim().slice(0, 400) || null })
      .eq('id', user.id)
    if (saveError) return setError(saveError.message)
    setInfo(mine.is_mentor ? 'You are listed as a mentor.' : 'You are no longer listed as a mentor.')
  }

  const pendingFor = (mentorId) => sent.find((r) => r.mentor_id === mentorId && r.status === 'pending')
  const acceptedWith = (mentorId) => sent.find((r) => r.mentor_id === mentorId && r.status === 'accepted')

  return (
    <AppShell breadcrumb={<span>Mentors</span>}>
      <div className="mx-auto max-w-content px-6 py-8 md:px-9">
        <h1 className="text-3xl font-bold text-text">Mentors</h1>
        <p className="mt-1 text-textSecondary">Get guidance from experienced students and alumni, matched to your project.</p>

        {error && <p role="alert" className="mt-5 rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
        {info && <p className="mt-5 rounded-lg bg-accent/10 px-4 py-2.5 text-sm text-accent">{info}</p>}

        {!premium && !sub.loading && (
          <UpgradeNotice className="mt-6" message="Finding and requesting a mentor is part of Premium. Anyone can become a mentor for free, below." />
        )}

        {premium && (
          <section className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <label htmlFor="goal" className="mb-1 block text-xs font-medium text-muted">I want help with</label>
                <select id="goal" className={`${FIELD} min-w-[240px]`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">My skills and interests</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>Project: {p.name}</option>)}
                </select>
              </div>
              <button onClick={findWithAi} disabled={busy} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50">
                {busy ? 'Working...' : 'Find my best mentors with AI'}
              </button>
            </div>
            {notice && <p className="mt-3 rounded-lg bg-goldSoft px-3 py-2 text-xs text-textSecondary">{notice}</p>}
            {aiRanked && <p className="mt-3 text-xs font-medium text-primary">Ranked with AI</p>}

            <div className="mt-5">
              {mentors === null ? (
                <div className="skeleton h-32 w-full" />
              ) : mentors.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-borderStrong px-6 py-10 text-center text-sm text-muted">
                  No mentors have signed up yet. Mentors appear here as soon as someone turns it on below.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {mentors.map((m) => {
                    const pending = pendingFor(m.id)
                    const accepted = acceptedWith(m.id)
                    return (
                      <div key={m.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
                        <div className="flex items-start justify-between gap-3">
                          <Link to={`/profile/${m.id}`} className="flex min-w-0 items-center gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface2 text-base font-bold text-primary">{m.name?.charAt(0)?.toUpperCase()}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-text">{m.name}</span>
                              <span className="block truncate text-xs text-muted">{[m.college, m.experience].filter(Boolean).join(' · ')}</span>
                            </span>
                          </Link>
                          <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">{m.score}% fit</span>
                        </div>
                        {m.bio && <p className="mt-3 text-sm text-textSecondary">{m.bio}</p>}
                        <p className="mt-3 rounded-lg bg-surface2 px-3 py-2 text-xs leading-relaxed text-textSecondary">{m.notes}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {[...m.topics, ...m.skills.filter((s) => !m.topics.includes(s))].slice(0, 6).map((t) => (
                            <span key={t} className="rounded-md bg-surface2 px-2.5 py-1 text-[11.5px] font-medium text-primary">{t}</span>
                          ))}
                        </div>

                        <div className="mt-4">
                          {accepted ? (
                            <Link to={`/messages/${m.id}`} className="block rounded-lg bg-primary py-2 text-center text-sm font-semibold text-white hover:bg-primaryHover">Open chat</Link>
                          ) : pending ? (
                            <p className="rounded-lg bg-warning/10 py-2 text-center text-xs font-medium text-warning">Request sent, waiting for a reply</p>
                          ) : openFor === m.id ? (
                            <div className="space-y-2">
                              <textarea className={FIELD} rows={3} maxLength={500} placeholder="What would you like help with? (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
                              <div className="flex gap-2">
                                <button onClick={() => setOpenFor(null)} className="rounded-lg border border-border px-3 py-2 text-sm text-textSecondary hover:bg-surface2">Cancel</button>
                                <button onClick={() => sendRequest(m.id)} disabled={busy} className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50">Send request</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => { setOpenFor(m.id); setMessage('') }} className="w-full rounded-lg border border-borderStrong py-2 text-sm font-semibold text-primary hover:bg-surface2">Request mentorship</button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {sent.length > 0 && (
          <section className="mt-9">
            <h2 className="text-xl font-bold text-text">Your requests</h2>
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
              {sent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                  <span className="font-medium text-text">{r.mentor?.name || 'Mentor'}</span>
                  <span className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    {r.status === 'accepted' && <Link to={`/messages/${r.mentor_id}`} className="text-xs font-semibold text-primary hover:underline">Open chat</Link>}
                    {r.status === 'pending' && <button onClick={() => act(() => cancelMentorship(r.id))} disabled={busy} className="text-xs font-semibold text-danger hover:underline">Cancel</button>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {received.length > 0 && (
          <section className="mt-9">
            <h2 className="text-xl font-bold text-text">Requests to you</h2>
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
              {received.map((r) => (
                <li key={r.id} className="px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link to={`/profile/${r.mentee_id}`} className="font-semibold text-text hover:text-primary">{r.mentee?.name || 'A student'}</Link>
                      <span className="ml-2 text-xs text-muted">{r.mentee?.college}</span>
                      {r.message && <p className="mt-1 text-textSecondary">{r.message}</p>}
                    </div>
                    {r.status === 'pending' ? (
                      <span className="flex gap-2">
                        <button onClick={() => act(() => respondMentorship(r.id, false))} disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-textSecondary hover:bg-surface2">Decline</button>
                        <button onClick={() => act(() => respondMentorship(r.id, true))} disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryHover">Accept</button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                        {r.status === 'accepted' && <Link to={`/messages/${r.mentee_id}`} className="text-xs font-semibold text-primary hover:underline">Open chat</Link>}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-9 rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-text">Become a Verified Mentor</h2>
              <p className="mt-1 text-sm text-textSecondary">
                Guide student project teams as a College Professor or Industry Expert. Setup your professional background, availability, and institutional verification credentials.
              </p>
            </div>
            <Link
              to="/mentor/profile"
              className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-primaryHover"
            >
              Manage Mentor Profile →
            </Link>
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={mine.is_mentor} onChange={(e) => setMine((m) => ({ ...m, is_mentor: e.target.checked }))} className="h-4 w-4 accent-[#2E6B4F]" />
              Quickly list me as an active peer mentor
            </label>
            {mine.is_mentor && (
              <div className="mt-4 space-y-3">
                <input className={FIELD} placeholder="Topics you can help with, separated by commas (e.g. AI/ML, React, Hackathons)" value={mine.topics} onChange={(e) => setMine((m) => ({ ...m, topics: e.target.value }))} />
                <textarea className={FIELD} rows={3} maxLength={400} placeholder="A short bio: your experience and how you like to help" value={mine.bio} onChange={(e) => setMine((m) => ({ ...m, bio: e.target.value }))} />
                <button onClick={saveMentorProfile} className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover">Save Quick Settings</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
