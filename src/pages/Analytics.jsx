import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/AppShell'
import UpgradeNotice from '../components/UpgradeNotice'
import Icon from '../components/Icon'
import { getAnalytics } from '../lib/analytics'
import { useSubscription } from '../hooks/useSubscription'

const KIND_LABEL = {
  analysis: 'Project analysis',
  matching: 'Matching',
  team: 'Team suggestions',
  risk: 'Risk analysis',
  simulate: 'What-if simulator',
  mentor: 'Mentor matching',
}

function Stat({ label, value, suffix = '' }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-card">
      <p className="font-display text-3xl font-bold text-text">{value ?? 'n/a'}{value != null && suffix}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  )
}

function Bar({ value, tone = 'bg-primary' }) {
  return (
    <div className="h-2 w-full rounded-full bg-surface2">
      <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

function Section({ title, hint, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-text">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function Analytics() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const sub = useSubscription()

  // Wait until the plan is known, then ask the server. The server (analytics-summary) is the
  // gate: Free users get 'upgrade_required', Premium/organiser users get data. Re-runs if the
  // plan changes (for example right after activation or sign-in).
  useEffect(() => {
    if (sub.loading) return undefined
    let active = true
    setError(null)
    getAnalytics()
      .then((result) => { if (active) { setData(result); setError(null) } })
      .catch((err) => { if (active) { setData(null); setError(err) } })
    return () => { active = false }
  }, [sub.loading, sub.tier])

  const maxWeek = Math.max(1, ...(data?.weekly || []).map((w) => w.added))

  return (
    <AppShell breadcrumb={<span>Analytics</span>}>
      <div className="mx-auto max-w-content px-6 py-8 md:px-9">
        <h1 className="text-3xl font-bold text-text">Analytics</h1>
        <p className="mt-1 text-textSecondary">How your projects and teams are progressing.</p>

        {error && error.code === 'upgrade_required' && (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-goldSoft text-sidebarBg"><Icon name="chart" className="h-6 w-6" /></span>
            <h2 className="mt-4 text-xl font-bold text-text">Analytics is part of Premium</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-textSecondary">
              See task and milestone progress, team scores, weekly activity and your AI usage. College plans also get skill-gap analytics for every event.
            </p>
            <UpgradeNotice message="Upgrade to unlock analytics, mentorship and advanced AI." className="mx-auto mt-5 max-w-lg text-left" />
          </div>
        )}
        {error && error.code !== 'upgrade_required' && <p role="alert" className="mt-6 rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger">{error.message}</p>}
        {!data && !error && <div className="skeleton mt-6 h-40 w-full" />}

        {data && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
              <Stat label="Projects" value={data.overview.projects} />
              <Stat label="Teams" value={data.overview.teams} />
              <Stat label="Average team score" value={data.overview.avgTeamScore} suffix="%" />
              <Stat label="Tasks done" value={data.overview.tasks.completionRate} suffix="%" />
              <Stat label="Milestones done" value={data.overview.milestones.completionRate} suffix="%" />
              <Stat label="Overdue tasks" value={data.overview.tasks.overdue} />
            </div>

            <Section title="Tasks added per week" hint="A quick view of how active your teams are.">
              <div className="flex items-end gap-3 rounded-2xl border border-border bg-surface p-5 shadow-card">
                {data.weekly.map((w) => (
                  <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-xs font-semibold text-text">{w.added}</span>
                    <div className="flex h-28 w-full items-end">
                      <div className="w-full rounded-t-md bg-primary" style={{ height: `${(w.added / maxWeek) * 100}%`, minHeight: w.added ? 6 : 2, opacity: w.added ? 1 : 0.25 }} />
                    </div>
                    <span className="text-[10px] text-muted">{w.weekStart.slice(5)}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Your projects">
              {data.projects.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-borderStrong px-6 py-8 text-center text-sm text-muted">
                  No projects yet. <Link to="/create-project" className="font-medium text-primary">Start one</Link> and its progress will show up here.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {data.projects.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
                      <div className="flex items-start justify-between gap-2">
                        <Link to={`/project/${p.id}`} className="text-[15px] font-semibold text-text hover:text-primary">{p.name}</Link>
                        {p.domain && <span className="shrink-0 rounded-md bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">{p.domain}</span>}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {p.teams} team{p.teams === 1 ? '' : 's'}{p.avgTeamScore != null ? ` · average score ${p.avgTeamScore}%` : ''}
                      </p>
                      <div className="mt-4 space-y-3 text-xs">
                        <div>
                          <div className="mb-1 flex justify-between text-textSecondary"><span>Tasks ({p.tasks.done} of {p.tasks.total})</span><span>{p.tasks.completionRate}%</span></div>
                          <Bar value={p.tasks.completionRate} />
                        </div>
                        <div>
                          <div className="mb-1 flex justify-between text-textSecondary"><span>Milestones ({p.milestones.done} of {p.milestones.total})</span><span>{p.milestones.completionRate}%</span></div>
                          <Bar value={p.milestones.completionRate} tone="bg-gold" />
                        </div>
                      </div>
                      {(p.tasks.overdue > 0 || p.milestones.overdue > 0) && (
                        <p className="mt-3 rounded-lg bg-warning/10 px-3 py-1.5 text-xs text-warning">
                          Overdue: {p.tasks.overdue} task{p.tasks.overdue === 1 ? '' : 's'}, {p.milestones.overdue} milestone{p.milestones.overdue === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="AI usage this month" hint={`${data.ai.used} of ${data.ai.limit} AI actions used.`}>
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
                <Bar value={(data.ai.used / Math.max(1, data.ai.limit)) * 100} tone="bg-accent" />
                {data.ai.byKind.length > 0 && (
                  <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    {data.ai.byKind.map((k) => (
                      <li key={k.kind} className="flex justify-between rounded-lg bg-surface2 px-3 py-2">
                        <span className="text-textSecondary">{KIND_LABEL[k.kind] || 'Other'}</span>
                        <span className="font-semibold text-text">{k.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>

            {data.events && (
              <Section title="Your events" hint="College plan: skill gaps and branch mix across each batch.">
                {data.events.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-borderStrong px-6 py-8 text-center text-sm text-muted">
                    You have not organized an event yet. <Link to="/events" className="font-medium text-primary">Create one</Link>.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {data.events.map((ev) => (
                      <div key={ev.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
                        <Link to={`/events/${ev.id}`} className="text-[15px] font-semibold text-text hover:text-primary">{ev.name}</Link>
                        <p className="mt-1 text-xs text-muted">
                          {ev.participants} participant{ev.participants === 1 ? '' : 's'} · {ev.teamsFormed} teams{ev.avgTeamScore != null ? ` · average score ${ev.avgTeamScore}%` : ''}
                        </p>
                        {ev.skillDemand.length > 0 && (
                          <div className="mt-4 space-y-2.5 text-xs">
                            <p className="font-semibold text-text">Participants with each required skill</p>
                            {ev.skillDemand.map((s) => (
                              <div key={s.skill}>
                                <div className="mb-1 flex justify-between text-textSecondary"><span>{s.skill}</span><span>{s.have} ({s.share}%)</span></div>
                                <Bar value={s.share} tone={s.share < 25 ? 'bg-danger' : 'bg-primary'} />
                              </div>
                            ))}
                          </div>
                        )}
                        {ev.branches.length > 0 && (
                          <p className="mt-4 text-xs text-textSecondary">
                            Branches: {ev.branches.map((b) => `${b.branch} (${b.count})`).join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
