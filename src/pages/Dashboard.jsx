import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useConnections } from '../hooks/useConnections'
import { useSubscription } from '../hooks/useSubscription'
import { LIMITS, TIER_LABEL } from '../lib/plans'
import AppShell from '../components/AppShell'
import ConnectButton from '../components/ConnectButton'
import Icon from '../components/Icon'

const QUICK_ACTIONS = [
  { icon: 'plus', title: 'New project', sub: 'Describe it and get the roles you need', to: '/create-project' },
  { icon: 'users', title: 'Find people', sub: 'Search by skill, college or name', to: '/find-people' },
  { icon: 'ticket', title: 'Run an event', sub: 'Form balanced teams for a whole batch', to: '/events' },
]

const sharedSkills = (mine, theirs) =>
  (theirs || []).filter((skill) => (mine || []).some((m) => m.toLowerCase() === skill.toLowerCase()))

export default function Dashboard() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { connectedIds } = useConnections()
  const sub = useSubscription()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('people')
  const [stats, setStats] = useState({ projects: 0, teamRequests: 0, pendingInvites: 0 })
  const [people, setPeople] = useState([])
  const [projects, setProjects] = useState([])

  useEffect(() => {
    if (!user) return
    loadStats()
    loadRecommendations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile])

  async function loadStats() {
    const [{ count: created }, { count: requests }, { count: pending }] = await Promise.all([
      supabase.from('projects').select('*', { count: 'exact', head: true }).eq('creator_id', user.id),
      supabase.from('team_invites').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('status', 'pending'),
      supabase.from('team_invites').select('*', { count: 'exact', head: true }).eq('sender_id', user.id).eq('status', 'pending'),
    ])
    setStats({ projects: created || 0, teamRequests: requests || 0, pendingInvites: pending || 0 })
  }

  async function loadRecommendations() {
    const mySkills = profile?.skills || []

    const { data: students } = await supabase.from('student_profiles').select('*').neq('id', user.id).limit(30)
    const ranked = (students || [])
      .map((s) => ({ ...s, shared: sharedSkills(mySkills, s.skills) }))
      .sort((a, b) => b.shared.length - a.shared.length)
      .slice(0, 6)
    setPeople(ranked)

    const { data: open } = await supabase.from('projects').select('*').eq('status', 'open').neq('creator_id', user.id).limit(6)
    setProjects(open || [])
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.name?.split(' ')[0]

  const stat = [
    { label: 'Projects created', value: stats.projects, to: '/discover' },
    { label: 'Invites to you', value: stats.teamRequests, to: '/notifications' },
    { label: 'Invites you sent', value: stats.pendingInvites, to: '/my-teams' },
    { label: 'Connections', value: connectedIds.length, to: '/network' },
  ]

  return (
    <AppShell>
      <div className="mx-auto max-w-content px-6 py-8 md:px-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-text">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
            <p className="mt-1 text-textSecondary">Here is what is happening with your projects.</p>
          </div>
          <Link to="/pricing" className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-medium text-textSecondary hover:border-borderStrong">
            {sub.tier !== 'free' && <Icon name="crown" className="h-3.5 w-3.5 text-gold" />}
            {TIER_LABEL[sub.tier]} plan · {sub.aiUsed}/{sub.aiLimit} AI actions used
          </Link>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.to}
              onClick={() => navigate(a.to)}
              className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-lift"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-goldSoft text-sidebarBg"><Icon name={a.icon} className="h-5 w-5" /></span>
              <span>
                <span className="block text-[15px] font-semibold text-text">{a.title}</span>
                <span className="block text-xs text-muted">{a.sub}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
          {stat.map((s) => (
            <Link key={s.label} to={s.to} className="bg-surface px-6 py-5 hover:bg-surface2">
              <p className="font-display text-3xl font-bold text-text">{s.value}</p>
              <p className="text-xs text-muted">{s.label}</p>
            </Link>
          ))}
        </div>

        {sub.tier === 'free' && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sidebarBg px-6 py-5">
            <div>
              <p className="font-display text-lg font-bold text-white">Run your project like a pro</p>
              <p className="text-sm text-sidebarText">Premium adds AI team risk analysis, the what-if simulator and {LIMITS.premium.aiActionsPerMonth} AI actions a month.</p>
            </div>
            <Link to="/pricing" className="rounded-lg bg-gold px-5 py-2.5 text-sm font-semibold text-sidebarBg hover:brightness-95">See plans</Link>
          </div>
        )}

        <div className="mb-4 mt-9 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-text">Suggested for you</h2>
          <div className="flex gap-1 rounded-lg bg-surface2 p-1">
            {['people', 'projects'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-md px-5 py-1.5 text-xs font-medium capitalize transition-colors ${activeTab === tab ? 'bg-surface text-text shadow-sm' : 'text-muted'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'people' && (
          people.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-borderStrong px-6 py-10 text-center text-sm text-muted">
              No one to suggest yet. <Link to="/profile" className="font-medium text-primary">Add your skills</Link> to see people with overlapping interests.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((s) => (
                <div key={s.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/profile/${s.id}`} className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface2 text-base font-bold text-primary">{s.name?.charAt(0)?.toUpperCase()}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text">{s.name}</span>
                        <span className="block truncate text-xs text-muted">{s.college}{s.year ? ` · Year ${s.year}` : ''}</span>
                      </span>
                    </Link>
                    {s.shared.length > 0 && (
                      <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">{s.shared.length} shared</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(s.skills || []).slice(0, 3).map((sk) => (
                      <span key={sk} className="rounded-md bg-surface2 px-2.5 py-1 text-[11.5px] font-medium text-primary">{sk}</span>
                    ))}
                  </div>
                  <div className="mt-4"><ConnectButton studentId={s.id} /></div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'projects' && (
          projects.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-borderStrong px-6 py-10 text-center text-sm text-muted">
              No open projects right now. <Link to="/create-project" className="font-medium text-primary">Start one</Link>.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <div key={p.id} className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-semibold text-text">{p.name}</h3>
                    {p.domain && <span className="shrink-0 rounded-md bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">{p.domain}</span>}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-textSecondary">{p.description}</p>
                  <p className="mt-2 text-[11.5px] text-muted">
                    Team of {p.team_size}{p.deadline ? ` · Due ${new Date(p.deadline).toLocaleDateString()}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(p.skills_required || []).slice(0, 3).map((sk) => (
                      <span key={sk} className="rounded-md bg-surface2 px-2.5 py-1 text-[11.5px] font-medium text-primary">{sk}</span>
                    ))}
                  </div>
                  <button onClick={() => navigate(`/project/${p.id}`)} className="mt-auto w-full rounded-lg border border-borderStrong px-3 py-2 text-sm font-medium text-primary hover:bg-surface2">
                    View project
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </AppShell>
  )
}
