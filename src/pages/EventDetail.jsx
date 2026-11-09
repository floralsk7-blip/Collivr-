
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { formEventTeams } from '../lib/events'
import { quotePrice } from '../lib/pricing'
import AppShell from '../components/AppShell'
import PayPalCheckout from '../components/PayPalCheckout'
import EventWorkflow from '../components/EventWorkflow'
import { useProfile } from '../hooks/useProfile'
import { StatusBadge } from './Events'
import { EVENT_STATUS } from '../constants/eventStatus'

const CURRENCY = import.meta.env.VITE_EVENT_PASS_CURRENCY || 'USD'
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || ''

const BREAKDOWN_LABELS = [
  ['skill', 'Skills', 35],
  ['interest', 'Interest', 20],
  ['availability', 'Availability', 15],
  ['experience', 'Experience', 15],
  ['diversity', 'Branch mix', 15],
]

function ScoreBars({ breakdown }) {
  return (
    <div className="space-y-2">
      {BREAKDOWN_LABELS.map(([key, label, weight]) => {
        const value = Math.round(Number(breakdown?.[key]) || 0)
        const width = Math.min(100, Math.max(0, value))

        return (
          <div key={key} className="flex items-center gap-3 text-xs">
            <span className="w-24 shrink-0 text-textSecondary">
              {label}{' '}
              <span className="text-muted">({weight}%)</span>
            </span>

            <div className="h-2 flex-1 rounded-full bg-surface2">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: width + '%' }}
              />
            </div>

            <span className="w-9 text-right font-semibold text-text">
              {value}%
            </span>
          </div>
        )
      })}
    </div>
  )
}
   

function TeamCard({ team }) {
  const members = team.event_team_members || []
  return (
    <div className="rounded-[14px] border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-text">Team {team.team_index}</h3>
        <div className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-accent bg-accent/10">
          <span className="text-sm font-extrabold text-accent">{Math.round(team.score)}%</span>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-border">
        {members.map((m) => (
          <li key={m.student_id} className="flex items-center justify-between py-2 text-sm">
            <Link to={`/profile/${m.student_id}`} className="font-medium text-text hover:text-primary">
              {m.student_profiles?.name || 'Student'}
            </Link>
            <span className="rounded-md bg-surface2 px-2 py-0.5 text-xs text-primary">{m.role || 'Member'}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4"><ScoreBars breakdown={team.score_breakdown} /></div>
      {team.missing_skills?.length > 0 && (
        <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          Not covered by anyone on this team: {team.missing_skills.join(', ')}
        </p>
      )}
      {team.reasoning && <p className="mt-4 text-sm leading-relaxed text-text">{team.reasoning}</p>}
      {team.coaching_notes && <p className="mt-2 text-sm leading-relaxed text-textSecondary"><span className="font-semibold">Coaching: </span>{team.coaching_notes}</p>}
    </div>
  )
}

export default function EventDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { profile } = useProfile()
  const [event, setEvent] = useState(null)
  const [participants, setParticipants] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingDraft, setEditingDraft] = useState(false)
  const [draftForm, setDraftForm] = useState(null)

  const load = useCallback(async () => {
    const { data: ev } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
    setEvent(ev)
    if (!ev) {
      setLoading(false)
      return
    }
    const [{ data: parts }, { data: formed }] = await Promise.all([
      supabase.from('event_participants')
        .select('student_id, student_profiles(id, name, college, branch, skills, experience)')
        .eq('event_id', id),
      supabase.from('event_teams')
        .select('*, event_team_members(student_id, role, student_profiles(id, name))')
        .eq('event_id', id)
        .order('team_index'),
    ])
    setParticipants(parts || [])
    setTeams(formed || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const joined = !!user && participants.some((p) => p.student_id === user.id)
  const accountType = profile?.account_type || user?.user_metadata?.account_type
  const isOrganizer = !!user && accountType !== 'student' && event?.organizer_id === user.id
  const isEventCreator = isOrganizer
  const isEvaluator = isOrganizer
  const quote = quotePrice(event?.event_pass_tier || 'standard')
  const now = Date.now()
  const registrationOpen = event?.status === EVENT_STATUS.PUBLISHED
    && (!event?.registration_opens_at || new Date(event.registration_opens_at).getTime() <= now)
    && (!event?.registration_deadline_at || new Date(event.registration_deadline_at).getTime() > now)
  const canPay = isEventCreator && [EVENT_STATUS.DRAFT, EVENT_STATUS.PENDING_PAYMENT].includes(event?.status)
  const canForm = isOrganizer && [EVENT_STATUS.PAID, EVENT_STATUS.PUBLISHED, EVENT_STATUS.TEAMS_FORMED].includes(event?.status)
  const canEditDraft = isEventCreator && [EVENT_STATUS.DRAFT, EVENT_STATUS.PENDING_PAYMENT].includes(event?.status) && !event?.paid_at

  function beginDraftEdit() {
    setDraftForm({
      name: event.name || '',
      description: event.description || '',
      domain: event.domain || 'AI/ML',
      team_size: event.team_size || 4,
      event_pass_tier: event.event_pass_tier || 'standard',
      registration_opens_at: event.registration_opens_at ? new Date(event.registration_opens_at).toISOString().slice(0, 16) : '',
      registration_deadline_at: event.registration_deadline_at ? new Date(event.registration_deadline_at).toISOString().slice(0, 16) : '',
      skills_focus: (event.skills_focus || []).join(', '),
    })
    setEditingDraft(true)
    setError('')
    setNotice('')
  }

  async function saveDraft(e) {
    e.preventDefault()
    if (!canEditDraft || !draftForm) return
    const name = draftForm.name.trim()
    const teamSize = Number(draftForm.team_size)
    if (name.length < 3) return setError('Event name must contain at least 3 characters.')
    if (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 8) return setError('Team size must be between 2 and 8.')
    if (draftForm.registration_opens_at && draftForm.registration_deadline_at && new Date(draftForm.registration_deadline_at) <= new Date(draftForm.registration_opens_at)) {
      return setError('Registration deadline must be after registration opens.')
    }

    setBusy(true)
    setError('')
    const skills = [...new Set(draftForm.skills_focus.split(',').map((value) => value.trim()).filter(Boolean))].slice(0, 10)
    const { error: updateError } = await supabase.from('events').update({
      name,
      description: draftForm.description.trim() || null,
      domain: draftForm.domain,
      team_size: teamSize,
      event_pass_tier: draftForm.event_pass_tier,
      registration_opens_at: draftForm.registration_opens_at ? new Date(draftForm.registration_opens_at).toISOString() : null,
      registration_deadline_at: draftForm.registration_deadline_at ? new Date(draftForm.registration_deadline_at).toISOString() : null,
      skills_focus: skills,
    }).eq('id', id).eq('organizer_id', user.id).in('status', [EVENT_STATUS.DRAFT, EVENT_STATUS.PENDING_PAYMENT]).is('paid_at', null)

    setBusy(false)
    if (updateError) return setError(updateError.message)
    setEditingDraft(false)
    setNotice('Draft saved. You can continue editing it until you publish it.')
    await load()
  }

  async function toggleJoin() {
    if (!user) return
    setBusy(true)
    setError('')
    const result = joined
      ? await supabase.from('event_participants').delete().eq('event_id', id).eq('student_id', user.id)
      : await supabase.from('event_participants').insert({ event_id: id, student_id: user.id })
    if (result.error) setError(result.error.message)
    await load()
    setBusy(false)
  }

  async function handlePaid() {
    setNotice('Payment confirmed. Publish your event to open registration for students.')
    setError('')
    await load()
  }

  async function handlePublish() {
    setBusy(true)
    setError('')
    setNotice('')
    const { data, error: publishError } = await supabase.functions.invoke('publish-event', { body: { eventId: id } })
    if (publishError || data?.error) setError(publishError?.message || data.error)
    else {
      setNotice('Event published. Participants can now discover and register.')
      await load()
    }
    setBusy(false)
  }

  async function handleForm() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await formEventTeams(id)
      setNotice(`Formed ${res.teams} balanced teams (average score ${res.overallScore}%).`)
    } catch (err) {
      setError(err.message)
    }
    await load()
    setBusy(false)
  }

  async function exportParticipants() {
    const rows = [['Name', 'Branch', 'Experience', 'Student ID'], ...participants.map((p) => [
      p.student_profiles?.name || '',
      p.student_profiles?.branch || '',
      p.student_profiles?.experience || '',
      p.student_id,
    ])]
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${event?.name || 'event'}-participants.csv`.replace(/[^a-z0-9._-]/gi, '-')
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function removeParticipant(studentId) {
    if (event?.status === EVENT_STATUS.TEAMS_FORMED) return setError('Participants cannot be removed after teams have been formed.')
    if (!window.confirm('Remove this participant from the event?')) return
    setBusy(true)
    setError('')
    setNotice('')
    const { error: removeError } = await supabase.from('event_participants').delete().eq('event_id', id).eq('student_id', studentId)
    if (removeError) setError(removeError.message)
    else setNotice('Participant removed.')
    await load()
    setBusy(false)
  }

  async function deleteEvent() {
    if (!window.confirm('Delete this unpaid draft event? This also deletes its draft workflow data.')) return
    setBusy(true)
    setError('')
    const { error: deleteError } = await supabase.from('events').delete().eq('id', id).eq('organizer_id', user.id)
    if (deleteError) {
      setError(deleteError.message)
      setBusy(false)
      return
    }
    window.location.assign('/events')
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-content px-6 py-7"><div className="skeleton h-8 w-1/3" /></div>
      </AppShell>
    )
  }

  if (!event) {
    return (
      <AppShell breadcrumb={<span>Events</span>}>
        <div className="mx-auto max-w-content px-6 py-7">
          <p className="text-muted">Event not found.</p>
          <Link to="/events" className="mt-3 inline-block text-sm text-primary">Back to events</Link>
        </div>
      </AppShell>
    )
  }

  const isSandbox = !PAYPAL_CLIENT_ID || import.meta.env.VITE_PAYPAL_ENV !== 'live'

  return (
    <AppShell breadcrumb={<span>Events <span className="mx-1">›</span> {event.name}</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text">{event.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {event.domain} · teams of {event.team_size} · {participants.length} participant{participants.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={event.status} />
            {canEditDraft && <button onClick={beginDraftEdit} className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary">Edit draft</button>}
            {isEventCreator && [EVENT_STATUS.DRAFT, EVENT_STATUS.PENDING_PAYMENT].includes(event.status) && !event.paid_at && <button onClick={deleteEvent} disabled={busy} className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger disabled:opacity-50">Delete draft</button>}
          </div>
        </div>

        {editingDraft && draftForm && (
          <form onSubmit={saveDraft} className="mt-5 rounded-xl border border-primary/30 bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-text">Edit event draft</h2>
                <p className="mt-1 text-xs text-muted">Changes are saved to your unpublished draft only.</p>
              </div>
              <button type="button" onClick={() => setEditingDraft(false)} className="text-sm text-muted">Cancel</button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-muted md:col-span-2">Event name<input required minLength={3} maxLength={120} value={draftForm.name} onChange={(e) => setDraftForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
              <label className="text-xs text-muted md:col-span-2">Description<textarea rows={3} value={draftForm.description} onChange={(e) => setDraftForm((f) => ({ ...f, description: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
              <label className="text-xs text-muted">Theme<select value={draftForm.domain} onChange={(e) => setDraftForm((f) => ({ ...f, domain: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text">{['AI/ML', 'Web Dev', 'Mobile', 'Data Science', 'Cybersecurity', 'IoT', 'Other'].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-xs text-muted">Team size<input type="number" min={2} max={8} value={draftForm.team_size} onChange={(e) => setDraftForm((f) => ({ ...f, team_size: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
              <label className="text-xs text-muted">Event Pass tier<select value={draftForm.event_pass_tier} onChange={(e) => setDraftForm((f) => ({ ...f, event_pass_tier: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text">{['standard', 'advanced', 'complex'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="text-xs text-muted">Registration opens<input type="datetime-local" value={draftForm.registration_opens_at} onChange={(e) => setDraftForm((f) => ({ ...f, registration_opens_at: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
              <label className="text-xs text-muted">Registration deadline<input type="datetime-local" value={draftForm.registration_deadline_at} onChange={(e) => setDraftForm((f) => ({ ...f, registration_deadline_at: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label>
              <label className="text-xs text-muted md:col-span-2">Required team skills (comma separated)<input value={draftForm.skills_focus} onChange={(e) => setDraftForm((f) => ({ ...f, skills_focus: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" placeholder="React, Python, UI/UX" /></label>
            </div>
            <button type="submit" disabled={busy} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save draft changes'}</button>
          </form>
        )}

        {event.description && <p className="mt-4 max-w-3xl text-sm leading-relaxed text-textSecondary">{event.description}</p>}
        {event.registration_deadline_at && <p className="mt-2 text-xs text-muted">Registration deadline: {new Date(event.registration_deadline_at).toLocaleString()}</p>}
        {!registrationOpen && [EVENT_STATUS.PUBLISHED, EVENT_STATUS.PAID].includes(event.status) && <p className="mt-3 rounded-lg bg-surface2 px-3 py-2 text-sm text-textSecondary">Registration is not currently open.</p>}

        {event.skills_focus?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {event.skills_focus.map((s) => <span key={s} className="rounded-full bg-surface2 px-3 py-1 text-xs font-medium text-primary">{s}</span>)}
          </div>
        )}

        {error && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {notice && <p className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">{notice}</p>}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="rounded-[14px] border border-border bg-surface p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-text">Participants ({participants.length})</h2>
                {isOrganizer && participants.length > 0 && <button onClick={exportParticipants} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text">Export CSV</button>}
              </div>
              {registrationOpen && !isOrganizer && accountType === 'student' && (
                <button onClick={toggleJoin} disabled={busy} className={`rounded-[9px] px-4 py-2 text-sm font-semibold disabled:opacity-50 ${joined ? 'border border-border text-textSecondary hover:bg-surface2' : 'bg-primary text-white hover:bg-primaryHover'}`}>
                  {joined ? 'Leave event' : 'Join event'}
                </button>
              )}
            </div>

            {participants.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nobody has joined yet. Share this page with your students.</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {participants.map((p) => (
                  <li key={p.student_id} className="flex items-center gap-2.5 rounded-lg bg-surface2 px-3 py-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{p.student_profiles?.name?.charAt(0)?.toUpperCase() || '?'}</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-text">{p.student_profiles?.name || 'Student'}</p>
                      <p className="truncate text-[11px] text-muted">{[p.student_profiles?.branch, p.student_profiles?.experience].filter(Boolean).join(' · ')}</p>
                    </div>
                    {isOrganizer && event.status !== EVENT_STATUS.TEAMS_FORMED && <button onClick={() => removeParticipant(p.student_id)} disabled={busy} className="ml-auto text-xs text-danger disabled:opacity-50">Remove</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isOrganizer && (
            <aside className="rounded-[14px] border border-border bg-surface p-5">
              <h2 className="text-base font-bold text-text">Event access & team formation</h2>
              <p className="mt-1 text-sm text-textSecondary">One-time Event Pass: <span className="font-semibold text-text">{CURRENCY} {quote.price}</span> — {quote.label}. Payment is required before publishing and opening registration.</p>

              {canPay && (
                <div className="mt-4">
                  <PayPalCheckout eventId={event.id} onPaid={handlePaid} />
                  {isSandbox && <p className="mt-2 text-[11px] text-muted">Test mode: use a PayPal sandbox account. No real money is charged.</p>}
                </div>
              )}

              {event.status === EVENT_STATUS.PAID && isEventCreator && (
                <button onClick={handlePublish} disabled={busy} className="mt-3 w-full rounded-[9px] bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Publishing...' : 'Publish event'}</button>
              )}

              {canForm && (
                <div className="mt-4">
                  <p className="mb-3 text-sm text-accent">✓ Event Pass paid</p>
                  <button onClick={handleForm} disabled={busy || participants.length < 2} className="w-full rounded-[9px] bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50">{busy ? 'Forming teams...' : event.status === EVENT_STATUS.TEAMS_FORMED ? 'Re-run team formation' : 'Form teams with AI'}</button>
                  {participants.length < 2 && <p className="mt-2 text-xs text-muted">At least 2 participants are needed.</p>}
                </div>
              )}

              <p className="mt-4 text-[11px] leading-relaxed text-muted">Payments go from the organizer to COLLIVRA only. Card details are handled by PayPal. COLLIVRA never holds or sends money for students.</p>
            </aside>
          )}
        </div>

        <EventWorkflow eventId={event.id} eventName={event.name} eventTier={event.event_pass_tier || 'standard'} userId={user?.id} isManager={isOrganizer} isEvaluator={isEvaluator} joined={joined} />

        {teams.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-text">Teams</h2>
            <p className="mt-1 text-sm text-muted">Scores come from a weighted formula. Each team gets a plain-language explanation.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{teams.map((t) => <TeamCard key={t.id} team={t} />)}</div>
          </section>
        )}
      </div>
    </AppShell>
  )
}