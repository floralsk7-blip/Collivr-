import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import AppShell from '../components/AppShell'
import { useProfile } from '../hooks/useProfile'
import { EVENT_PASS_TIERS } from '../lib/pricing'

const DOMAINS = ['AI/ML', 'Web Dev', 'Mobile', 'Data Science', 'Cybersecurity', 'IoT', 'Other']

export const EVENT_STATUS = {
  draft: { label: 'Draft · payment required', style: 'bg-warning/10 text-warning' },
  pending_payment: { label: 'Awaiting payment', style: 'bg-warning/10 text-warning' },
  published: { label: 'Published', style: 'bg-info/10 text-info' },
  paid: { label: 'Paid · ready to publish', style: 'bg-accent/10 text-accent' },
  teams_formed: { label: 'Teams formed', style: 'bg-primary/10 text-primary' },
}

export function StatusBadge({ status }) {
  const s = EVENT_STATUS[status] || EVENT_STATUS.draft
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.style}`}>{s.label}</span>
}

function CreateEventForm({ userId, onCancel }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', description: '', domain: 'AI/ML', teamSize: 4, complexity: 'standard', skills: '', registrationOpens: '', registrationDeadline: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    const name = form.name.trim()
    if (name.length < 3) return setError('Give the event a name (at least 3 characters).')
    const teamSize = Number(form.teamSize)
    if (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 8) return setError('Team size must be between 2 and 8.')

    const skillsFocus = [...new Set(form.skills.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 10)

    setSaving(true)
    const { data, error: insertError } = await supabase
      .from('events')
      .insert({
        organizer_id: userId,
        organization_id: null,
        name,
        description: form.description.trim() || null,
        domain: form.domain,
        team_size: teamSize,
        event_pass_tier: form.complexity,
        registration_opens_at: form.registrationOpens ? new Date(form.registrationOpens).toISOString() : null,
        registration_deadline_at: form.registrationDeadline ? new Date(form.registrationDeadline).toISOString() : null,
        skills_focus: skillsFocus,
      })
      .select('id')
      .single()
    setSaving(false)

    if (insertError) return setError(insertError.message)
    navigate(`/events/${data.id}`)
  }

  const input = 'w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none'

  return (
    <form onSubmit={submit} className="mb-8 rounded-[14px] border border-border bg-surface p-5">
      <h2 className="text-lg font-bold text-text">New event</h2>
      <p className="mt-1 text-sm text-muted">Students join, then you form balanced teams. The Event Pass is paid once per event.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-muted">Event name</label>
          <input className={input} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. UIET Hack Night 2026" maxLength={120} />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-muted">Description (optional)</label>
          <textarea className={input} rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Theme</label>
          <select className={input} value={form.domain} onChange={(e) => update('domain', e.target.value)}>
            {DOMAINS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Team size</label>
          <input className={input} type="number" min={2} max={8} value={form.teamSize} onChange={(e) => update('teamSize', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-muted">Event Pass complexity (determines the one-time payment)</label>
          <select className={input} value={form.complexity} onChange={(e) => update('complexity', e.target.value)}>{Object.values(EVENT_PASS_TIERS).map((tier) => <option key={tier.key} value={tier.key}>{tier.label} — ${tier.price.replace('.00', '')}</option>)}</select>
          <p className="mt-2 text-xs text-muted">{EVENT_PASS_TIERS[form.complexity].description}</p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Registration opens</label>
          <input className={input} type="datetime-local" value={form.registrationOpens} onChange={(e) => update('registrationOpens', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Registration deadline</label>
          <input className={input} type="datetime-local" value={form.registrationDeadline} onChange={(e) => update('registrationDeadline', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-muted">Skills every team needs (comma separated)</label>
          <input className={input} value={form.skills} onChange={(e) => update('skills', e.target.value)} placeholder="React, Python, UI/UX, ML" />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onCancel} className="rounded-[9px] border border-border px-4 py-2 text-sm text-textSecondary hover:bg-surface2">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50">
          {saving ? 'Creating...' : 'Create event'}
        </button>
      </div>
    </form>
  )
}

export default function Events() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [events, setEvents] = useState([])
  const [myEvents, setMyEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [domainFilter, setDomainFilter] = useState('All themes')
  const [statusFilter, setStatusFilter] = useState('All events')

  useEffect(() => {
    supabase
      .from('events')
      .select('*, event_participants(count)')
      .order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message)
        setEvents(data || [])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    let alive = true
    async function loadMyEvents() {
      if (!user?.id) { setMyEvents([]); return }
      const { data: joined } = await supabase.from('event_participants').select('event_id').eq('student_id', user.id)
      const ids = [...new Set((joined || []).map((row) => row.event_id))]
      if (!ids.length) { if (alive) setMyEvents([]); return }
      const { data: mine } = await supabase.from('events').select('id,name,status,registration_deadline_at').in('id', ids)
      const { data: stages } = await supabase.from('event_stages').select('id,event_id,title,status,deadline_at,stage_order').in('event_id', ids).order('stage_order')
      const stageIds = (stages || []).map((stage) => stage.id)
      const { data: activities } = stageIds.length
        ? await supabase.from('event_activities').select('id,stage_id,title,required').in('stage_id', stageIds)
        : { data: [] }
      const { data: submissions } = await supabase.from('event_submissions').select('activity_id,status').eq('submitted_by', user.id).in('event_id', ids)
      const submitted = new Set((submissions || []).map((item) => item.activity_id))
      const summaries = (mine || []).map((ev) => {
        const visibleStages = (stages || []).filter((stage) => stage.event_id === ev.id)
        const current = visibleStages.find((stage) => stage.status === 'open') || visibleStages[0]
        const stageActivities = (activities || []).filter((activity) => activity.stage_id === current?.id && activity.required)
        return {
          ...ev, currentStage: current,
          pending: stageActivities.filter((activity) => !submitted.has(activity.id)).length,
          completed: stageActivities.filter((activity) => submitted.has(activity.id)).length,
        }
      })
      if (alive) setMyEvents(summaries)
    }
    loadMyEvents().catch((err) => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [user?.id])

  const accountType = profile?.account_type || user?.user_metadata?.account_type
  const canCreate = Boolean(accountType === 'organiser')
  const visibleEvents = events.filter((ev) => {
    const query = searchQuery.trim().toLowerCase()
    const matchesQuery = !query || [ev.name, ev.description, ev.domain].some((value) => String(value || '').toLowerCase().includes(query))
    const matchesDomain = domainFilter === 'All themes' || ev.domain === domainFilter
    const matchesStatus = statusFilter === 'All events' || (statusFilter === 'Registration open' ? ['published', 'paid', 'teams_formed'].includes(ev.status) : ev.status === statusFilter)
    return matchesQuery && matchesDomain && matchesStatus
  })
  const eventDomains = [...new Set(events.map((ev) => ev.domain).filter(Boolean))].sort()
  const ownedEvents = events.filter((ev) => ev.organizer_id === user?.id)

  return (
    <AppShell breadcrumb={<span>Events</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{canCreate ? 'Event operations' : 'Discover & participate'}</p>
            <h1 className="mt-2 text-2xl font-bold text-text">{canCreate ? 'My Events' : 'Events'}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">{canCreate ? 'Create events, manage registrations, run rounds, evaluate submissions and issue certificates.' : 'Discover hackathons, workshops and campus challenges. Follow every stage from registration to results.'}</p>
          </div>
          {!creating && canCreate && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setCreating(true)} className="rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover">+ Create event</button>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4"><p className="text-xs text-muted">Available events</p><p className="mt-1 text-2xl font-bold text-text">{events.length}</p></div>
          <div className="rounded-xl border border-border bg-surface p-4"><p className="text-xs text-muted">Themes</p><p className="mt-1 text-2xl font-bold text-text">{eventDomains.length}</p></div>
          <div className="rounded-xl border border-border bg-surface p-4"><p className="text-xs text-muted">Your registrations</p><p className="mt-1 text-2xl font-bold text-text">{myEvents.length}</p></div>
        </div>

        {myEvents.length > 0 && (
          <section className="mt-6 rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-base font-bold text-text">Continue your events</h2><p className="mt-1 text-xs text-muted">Your current stages, required activities and deadlines.</p></div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{myEvents.length} joined</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {myEvents.map((ev) => (
                <Link key={ev.id} to={`/events/${ev.id}`} className="rounded-lg bg-surface2 p-4 transition-colors hover:bg-border/40">
                  <p className="text-sm font-semibold text-text">{ev.name}</p>
                  <p className="mt-1 text-xs text-textSecondary">{ev.currentStage?.title || 'Event registered'} · {ev.currentStage?.status || ev.status}</p>
                  <p className="mt-2 text-xs text-muted">{ev.pending} required task(s) pending · {ev.completed} completed</p>
                  {(ev.currentStage?.deadline_at || ev.registration_deadline_at) && <p className="mt-1 text-xs text-muted">Deadline: {new Date(ev.currentStage?.deadline_at || ev.registration_deadline_at).toLocaleString()}</p>}
                </Link>
              ))}
            </div>
          </section>
        )}


        <div className="mt-7">
          {canCreate && ownedEvents.length > 0 && (
            <section className="mb-7 rounded-xl border border-border bg-surface p-5">
              <h2 className="text-base font-bold text-text">Events you manage</h2>
              <p className="mt-1 text-xs text-muted">Open an event to manage registrations, rounds, judging, results and certificates.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {ownedEvents.map((ev) => (
                  <Link key={ev.id} to={`/events/${ev.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-surface2 p-3 hover:bg-border/40">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-text">{ev.name}</p><p className="mt-1 text-xs text-muted">{ev.domain || 'General'} · {ev.event_participants?.[0]?.count ?? 0} participants</p></div>
                    <StatusBadge status={ev.status} />
                  </Link>
                ))}
              </div>
            </section>
          )}
          {creating && user && <CreateEventForm userId={user.id} onCancel={() => setCreating(false)} />}
          {!canCreate && accountType === 'student' && (
            <div className="mb-5 rounded-xl border border-border bg-surface p-4 text-sm text-textSecondary">Students can discover events, register and participate. Event Organiser accounts create and conduct events.</div>
          )}

          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-bold text-text">Explore events</h2><p className="mt-1 text-xs text-muted">Search by event name, description or theme.</p></div>
            <span className="text-xs text-muted">Showing {visibleEvents.length} of {events.length}</span>
          </div>
          <div className="mb-5 grid gap-3 rounded-xl border border-border bg-surface p-3 md:grid-cols-[minmax(220px,1fr)_190px_190px]">
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Search events</span><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Try AI hackathon, design, robotics..." className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-primary" /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Theme</span><select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-primary"><option>All themes</option>{eventDomains.map((domain) => <option key={domain}>{domain}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Event status</span><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-primary"><option>All events</option><option>Registration open</option><option value="teams_formed">Teams formed</option><option value="pending_payment">Awaiting payment</option></select></label>
          </div>

          {error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2"><div className="skeleton h-48 w-full rounded-xl" /><div className="skeleton h-48 w-full rounded-xl" /></div>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center"><h3 className="font-semibold text-text">No events published yet</h3><p className="mt-1 text-sm text-muted">Check back soon for new hackathons, workshops and challenges.</p></div>
          ) : visibleEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center"><h3 className="font-semibold text-text">No matching events</h3><p className="mt-1 text-sm text-muted">Try another search term or clear your filters.</p><button onClick={() => { setSearchQuery(''); setDomainFilter('All themes'); setStatusFilter('All events') }} className="mt-3 text-sm font-semibold text-primary hover:underline">Clear filters</button></div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleEvents.map((ev) => (
                <Link key={ev.id} to={`/events/${ev.id}`} className="group flex min-h-[220px] flex-col rounded-xl border border-border bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{ev.domain || 'General'}</span><StatusBadge status={ev.status} /></div>
                  <h3 className="mt-4 text-base font-bold text-text group-hover:text-primary">{ev.name}</h3>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm text-textSecondary">{ev.description || 'Explore the event details, registration requirements and upcoming activities.'}</p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted">
                    <span>♧ Teams of {ev.team_size || '—'}</span><span>♙ {ev.event_participants?.[0]?.count ?? 0} joined</span>
                    {ev.registration_deadline_at && <span>Registration closes {new Date(ev.registration_deadline_at).toLocaleDateString()}</span>}
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-4"><span className="text-xs text-muted">{ev.organizer_id === user?.id ? 'Organised by you' : 'View event details'}</span><span className="text-sm font-semibold text-primary">View event →</span></div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
