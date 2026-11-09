import { visibleMatches } from '../lib/matching'
import { useEffect, useState } from 'react'
import { suggestTeam } from '../lib/gemini'
import UpgradeNotice from '../components/UpgradeNotice'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import AppShell from '../components/AppShell'
import TeamChat from './TeamChat'

const TABS = ['Overview', 'Team', 'Tasks', 'Milestones', 'What-If', 'Risk', 'Chat']

const STATUS_CHIP = {
  open: { bg: 'bg-info/10', text: 'text-info', label: 'Planning' },
  active: { bg: 'bg-accent/10', text: 'text-accent', label: 'In Progress' },
  completed: { bg: 'bg-surface2', text: 'text-primary', label: 'Completed' },
}

function riskChipColor(status) {
  if (['Strong', 'Good', 'Low'].includes(status)) return 'bg-accent/10 text-accent'
  if (['Moderate', 'Fair', 'Medium'].includes(status)) return 'bg-warning/10 text-warning'
  return 'bg-danger/10 text-danger'
}

function Overview({ team, project, members, tasks, navigate }) {
  const doneCount = tasks.filter((t) => t.status === 'done').length
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0
  const daysLeft = project?.deadline
    ? Math.ceil((new Date(project.deadline) - new Date()) / (1000 * 60 * 60 * 24))
    : null

  const goals = (() => {
    const sentences = (project?.description || '').split(/(?<=[.!?])\s+/).filter(Boolean)
    return sentences.length ? sentences.slice(0, 4) : ['No project goals listed yet.']
  })()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col divide-y divide-border rounded-[14px] border border-border bg-surface sm:flex-row sm:divide-x sm:divide-y-0">
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-5 py-5">
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] border-accent bg-accent/10">
            <span className="text-sm font-bold text-accent">{Math.round(team?.overall_match_score || 0)}%</span>
          </div>
          <p className="m-0 text-xs text-muted">Team Score</p>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-1.5 px-5 py-5">
          <p className="m-0 text-xs text-muted">Progress</p>
          <div className="flex items-center gap-2">
            <div className="h-[7px] flex-1 rounded-full bg-surface2">
              <div className="h-[7px] rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-semibold text-text">{progress}%</span>
          </div>
        </div>
        <div className="flex flex-1 items-center gap-2 px-5 py-5">
          <span>📅</span>
          <div>
            <p className="m-0 text-xs text-muted">Deadline</p>
            <p className={`m-0 text-sm font-semibold ${daysLeft !== null && daysLeft < 7 ? 'text-danger' : 'text-text'}`}>
              {project?.deadline ? new Date(project.deadline).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </p>
          </div>
        </div>
        <div className="flex flex-1 items-center gap-2 px-5 py-5">
          <span>👥</span>
          <div>
            <p className="m-0 text-xs text-muted">Team Size</p>
            <p className="m-0 text-sm font-semibold text-text">{members.length} Members</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[14px] border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">Project Goals</h3>
          <div className="flex flex-col gap-2">
            {goals.map((g, i) => (
              <p key={i} className="m-0 flex gap-2 text-[13px] text-textSecondary"><span className="text-accent">✓</span>{g}</p>
            ))}
          </div>
        </div>
        <div className="rounded-[14px] border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">Quick Actions</h3>
          <div className="flex flex-col gap-2">
            <button onClick={() => navigate('Tasks')} className="rounded-[9px] border border-borderStrong bg-surface px-4 py-2.5 text-left text-sm text-primary hover:bg-surface2">➕ Add Task</button>
            <button onClick={() => navigate('What-If')} className="rounded-[9px] border border-borderStrong bg-surface px-4 py-2.5 text-left text-sm text-primary hover:bg-surface2">🔮 Run What-If Simulation</button>
            <button onClick={() => navigate('Risk')} className="rounded-[9px] border border-borderStrong bg-surface px-4 py-2.5 text-left text-sm text-primary hover:bg-surface2">⚠️ Check Team Risk</button>
          </div>
        </div>
      </div>

      {team?.coaching_notes && (
        <div className="rounded-[14px] border-l-[3px] border-l-accentLight border-y border-r border-border bg-surface p-5">
          <p className="mb-2 text-xs font-semibold text-primary">Your Team's Strengths & Focus Areas</p>
          <p className="m-0 text-[13px] italic leading-relaxed text-textSecondary">{team.coaching_notes}</p>
        </div>
      )}
    </div>
  )
}

function TeamTab({ members }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((m) => (
        <div key={m.id} className="rounded-[14px] border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-base font-bold text-primary">
              {m.student_profiles?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="m-0 text-sm font-semibold text-text">{m.student_profiles?.name}</p>
              <span className="rounded-md bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">{m.role || 'Member'}</span>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {m.student_profiles?.skills?.slice(0, 4).map((sk) => (
              <span key={sk} className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] font-medium text-primary">{sk}</span>
            ))}
          </div>
          {m.student_profiles?.cgpa && <p className="mb-3 text-xs text-muted">CGPA: {m.student_profiles.cgpa}</p>}
          <button className="w-full rounded-[9px] border border-borderStrong bg-surface px-3 py-2 text-sm text-primary hover:bg-surface2">Message</button>
        </div>
      ))}
      {members.length === 0 && <p className="text-sm text-muted">No team members yet.</p>}
    </div>
  )
}

const PRIORITY_STYLE = {
  High: 'bg-danger/10 text-danger',
  Medium: 'bg-warning/10 text-warning',
  Low: 'bg-surface2 text-primary',
}

function TasksTab({ teamId }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [deadline, setDeadline] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tasks').select('*').eq('team_id', teamId).order('created_at')
    setTasks(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [teamId])

  async function addTask(e) {
    e.preventDefault()
    if (!title.trim()) return
    await supabase.from('tasks').insert({ team_id: teamId, title: title.trim(), priority, deadline: deadline || null, status: 'todo' })
    setTitle(''); setDeadline(''); setPriority('Medium'); setShowForm(false)
    load()
  }

  async function toggleDone(task) {
    const nextStatus = task.status === 'done' ? 'todo' : 'done'
    await supabase.from('tasks').update({ status: nextStatus }).eq('id', task.id)
    load()
  }

  const filtered = tasks.filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="flex flex-col gap-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14 rounded-[14px]" />)}</div>

  return (
    <div>
      <div className="mb-4 flex gap-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..." className="w-full rounded-[9px] border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text focus:border-primary focus:outline-none" />
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover">+ Add Task</button>
      </div>

      {showForm && (
        <form onSubmit={addTask} className="mb-4 flex flex-wrap gap-2 rounded-[14px] border border-border bg-surface p-3">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" className="min-w-[180px] flex-1 rounded-[9px] border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-[9px] border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none">
            {['High', 'Medium', 'Low'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="rounded-[9px] border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
          <button type="submit" className="rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white">Add</button>
        </form>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No tasks yet. Add one above.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((task) => (
            <div key={task.id} className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3">
              <button
                onClick={() => toggleDone(task)}
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border text-[10px] font-bold ${
                  task.status === 'done' ? 'border-accent bg-accent text-white' : 'border-borderStrong bg-surface'
                }`}
              >
                {task.status === 'done' ? '✓' : ''}
              </button>
              <span className={`flex-1 text-sm ${task.status === 'done' ? 'text-muted line-through' : 'text-text'}`}>{task.title}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.Medium}`}>{task.priority || 'Medium'}</span>
              {task.deadline && <span className="text-xs text-muted">{new Date(task.deadline).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const MILESTONE_DOT = {
  done: 'border-accent bg-accent',
  current: 'border-primary bg-surface',
  upcoming: 'border-border bg-surface',
}

function MilestonesTab({ teamId }) {
  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('milestones').select('*').eq('team_id', teamId).order('due_date')
    setMilestones(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [teamId])

  async function addMilestone(e) {
    e.preventDefault()
    if (!title.trim()) return
    await supabase.from('milestones').insert({ team_id: teamId, title: title.trim(), due_date: dueDate || null, status: 'upcoming' })
    setTitle(''); setDueDate('')
    load()
  }

  async function cycleStatus(m) {
    const next = m.status === 'upcoming' ? 'current' : m.status === 'current' ? 'done' : 'upcoming'
    await supabase.from('milestones').update({ status: next }).eq('id', m.id)
    load()
  }

  if (loading) return <div className="skeleton h-40 rounded-[14px]" />

  return (
    <div>
      <form onSubmit={addMilestone} className="mb-6 flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted">Milestone title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Design review" className="w-full rounded-[9px] border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Due date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-[9px] border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
        </div>
        <button type="submit" className="rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover">Add Milestone</button>
      </form>

      {milestones.length === 0 ? (
        <p className="text-sm text-muted">No milestones yet. Add one above.</p>
      ) : (
        <div>
          {milestones.map((m, i) => (
            <div key={m.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <button onClick={() => cycleStatus(m)} className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${MILESTONE_DOT[m.status] || MILESTONE_DOT.upcoming}`} />
                {i < milestones.length - 1 && <div className="mt-1 min-h-[30px] w-px flex-1 bg-border" />}
              </div>
              <div className="flex-1 pb-5">
                <p className="m-0 text-sm font-medium text-text">{m.title}</p>
                <p className="m-0 text-xs text-muted">
                  {m.due_date ? new Date(m.due_date).toLocaleDateString() : 'No date'} · <span>{m.status}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WhatIfTab({ project, members, teamScore }) {
  const [candidates, setCandidates] = useState([])
  const [memberToReplace, setMemberToReplace] = useState('')
  const [replacementId, setReplacementId] = useState('')
  const [simulating, setSimulating] = useState(false)
  const [newScore, setNewScore] = useState(null)
  const [reasoning, setReasoning] = useState('')
  const [simError, setSimError] = useState(null)
  const [simNotice, setSimNotice] = useState('')

  useEffect(() => {
    async function loadCandidates() {
      if (!project) return
      const { data } = await supabase.from('match_scores').select('*, student_profiles(*)').eq('project_id', project.id).order('score_percent', { ascending: false })
      const memberIds = members.map((m) => m.student_id)
      setCandidates(visibleMatches(data).filter((c) => !memberIds.includes(c.student_id)))
    }
    loadCandidates()
  }, [project, members])

  const scoreDiff = newScore !== null ? Math.round(newScore - teamScore) : null

  async function runSimulation() {
    if (!memberToReplace || !replacementId) return
    setSimulating(true)
    setSimError(null)
    const replacement = candidates.find((c) => c.student_id === replacementId)
    const simulatedTeam = members.map((m) =>
      m.student_id === memberToReplace
        ? { student_id: replacement.student_id, name: replacement.student_profiles?.name, score_percent: replacement.score_percent }
        : { student_id: m.student_id, name: m.student_profiles?.name, score_percent: 100 }
    )
    try {
      const data = await suggestTeam({ projectId: project.id, matchedStudents: simulatedTeam, teamSize: simulatedTeam.length, mode: 'simulate' })
      setNewScore(data.team_score || 0)
      setReasoning(data.reasoning || '')
      setSimNotice(data.notice || '')
    } catch (err) {
      setSimError(err)
    }
    setSimulating(false)
  }

  return (
    <div>
      <h3 className="text-[17px] font-bold text-text">What-if simulator</h3>
      <p className="mb-5 text-[13px] text-muted">Swap a member and see how the team score changes.</p>
      {simNotice && <p className="mb-5 rounded-lg bg-goldSoft px-3 py-2 text-xs text-textSecondary">{simNotice}</p>}
      {simError && (simError.code === 'upgrade_required'
        ? <UpgradeNotice message={simError.message} className="mb-5" />
        : <p className="mb-5 text-sm text-danger">{simError.message}</p>)}

      <div className="grid gap-5 md:grid-cols-3">
        <div className="rounded-[14px] border border-border bg-surface p-4">
          <p className="mb-3 text-sm font-semibold text-text">Current Team (Score: {Math.round(teamScore)}%)</p>
          <div className="flex flex-col gap-2.5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface2 text-xs font-bold text-primary">{m.student_profiles?.name?.charAt(0)}</div>
                <div>
                  <p className="m-0 text-[13.5px] font-medium text-text">{m.student_profiles?.name}</p>
                  <p className="m-0 text-[11.5px] text-muted">{m.role || 'Member'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[14px] border border-border bg-surface p-4">
          <label className="mb-1 block text-xs text-muted">Replace Member</label>
          <select value={memberToReplace} onChange={(e) => setMemberToReplace(e.target.value)} className="mb-3 w-full rounded-[9px] border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none">
            <option value="">Select member...</option>
            {members.map((m) => <option key={m.student_id} value={m.student_id}>{m.student_profiles?.name}</option>)}
          </select>
          <label className="mb-1 block text-xs text-muted">With</label>
          <select value={replacementId} onChange={(e) => setReplacementId(e.target.value)} className="mb-4 w-full rounded-[9px] border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none">
            <option value="">Select candidate...</option>
            {candidates.map((c) => <option key={c.student_id} value={c.student_id}>{c.student_profiles?.name} ({Math.round(c.score_percent)}%)</option>)}
          </select>
          <button onClick={runSimulation} disabled={!memberToReplace || !replacementId || simulating} className="w-full rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50">
            {simulating ? 'Simulating...' : 'Run Simulation'}
          </button>
        </div>

        <div className="rounded-[14px] border border-border bg-surface p-4 text-center">
          <p className="mb-2 text-sm font-semibold text-text">New Team Score</p>
          {newScore === null ? (
            <p className="mt-8 text-xs text-muted">Run a simulation to see the result.</p>
          ) : (
            <>
              <div
                className="mx-auto my-3 flex h-24 w-24 flex-col items-center justify-center rounded-full border-4"
                style={{ borderColor: scoreDiff >= 0 ? '#2E9E63' : '#D94F4F' }}
              >
                <span className={`text-2xl font-extrabold ${scoreDiff >= 0 ? 'text-accent' : 'text-danger'}`}>{Math.round(newScore)}%</span>
                <span className={`text-xs ${scoreDiff >= 0 ? 'text-accent' : 'text-danger'}`}>{scoreDiff >= 0 ? '↑' : '↓'} {scoreDiff >= 0 ? '+' : ''}{scoreDiff}%</span>
              </div>
              {reasoning && <p className="text-[13px] leading-relaxed text-textSecondary">{reasoning}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const RISK_ROWS = [
  { key: 'skill_coverage', label: 'Skill Coverage', icon: '🧩' },
  { key: 'availability_risk', label: 'Availability', icon: '⏱️' },
  { key: 'role_dependency', label: 'Role Dependency', icon: '🔗' },
  { key: 'experience_balance', label: 'Experience Balance', icon: '⚖️' },
]

function RiskTab({ project, members }) {
  const [riskData, setRiskData] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')

  useEffect(() => {
    async function run() {
      if (!project || !members.length) return
      setAnalyzing(true)
      setError('')
      try {
        const data = await suggestTeam({ mode: 'risk', projectId: project.id, teamMembers: members.map((m) => ({ student_id: m.student_id })) })
        setRiskData(data)
      } catch (err) {
        setError(err.message)
        setErrorCode(err.code || '')
      } finally {
        setAnalyzing(false)
      }
    }
    run()
  }, [project, members])

  return (
    <div>
      <h3 className="text-[17px] font-bold text-text">Team risk analysis</h3>
      <p className="mb-5 text-[13px] text-muted">Where this team is exposed, and what to do about it.</p>

      {analyzing && <p className="text-sm text-muted">Assessing team risk...</p>}
      {error && (errorCode === 'upgrade_required'
        ? <UpgradeNotice message={error} />
        : <p className="text-sm text-danger">{error}</p>)}

      {riskData && (
        <div className="grid gap-5 md:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-3">
            {RISK_ROWS.map((risk) => {
              const item = riskData[risk.key] || {}
              return (
                <div key={risk.key} className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-[18px] py-3.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface2 text-sm">{risk.icon}</span>
                  <div className="flex-1">
                    <p className="m-0 text-sm font-semibold text-text">{risk.label}</p>
                    <p className="m-0 text-xs text-muted">{item.note}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${riskChipColor(item.status)}`}>{item.status || 'Unknown'}</span>
                </div>
              )
            })}
          </div>

          {riskData.notice && <p className="mb-3 rounded-lg bg-goldSoft px-3 py-2 text-xs text-textSecondary">{riskData.notice}</p>}
          {riskData.ai_suggestion && (
            <div className="h-fit rounded-[14px] border-l-[3px] border-l-accentLight border-y border-r border-border bg-surface p-5">
              <p className="mb-2 text-[13px] font-semibold text-primary">Suggestion</p>
              <p className="m-0 text-[13px] leading-relaxed text-textSecondary">{riskData.ai_suggestion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProjectWorkspace() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [team, setTeam] = useState(null)
  const [project, setProject] = useState(null)
  const [members, setMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Overview')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: teamData } = await supabase.from('teams').select('*').eq('id', teamId).maybeSingle()
      setTeam(teamData)

      if (teamData) {
        const { data: proj } = await supabase.from('projects').select('*').eq('id', teamData.project_id).maybeSingle()
        setProject(proj)
      }

      const { data: memberData } = await supabase.from('team_members').select('*, student_profiles(*)').eq('team_id', teamId)
      setMembers(memberData || [])

      const { data: taskData } = await supabase.from('tasks').select('*').eq('team_id', teamId)
      setTasks(taskData || [])

      if (user) {
        await supabase.from('message_reads').upsert({ user_id: user.id, team_id: teamId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,team_id' })
      }

      setLoading(false)
    }
    load()
  }, [teamId, user])

  const statusChip = STATUS_CHIP[project?.status] || STATUS_CHIP.open

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-content px-6 py-7"><div className="skeleton h-8 w-1/3" /></div>
      </AppShell>
    )
  }

  return (
    <AppShell breadcrumb={<span>My Projects <span className="mx-1">›</span> {project?.name}</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <div className="mb-5 rounded-[14px] border border-border bg-surface p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-surface2 text-xl">🌱</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 text-[19px] font-bold text-text">{project?.name}</h1>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusChip.bg} ${statusChip.text}`}>{statusChip.label}</span>
              </div>
              <p className="mt-1.5 text-[13px] text-textSecondary">{project?.description}</p>
            </div>
          </div>
        </div>

        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm transition-colors ${
                activeTab === tab ? 'border-primary font-semibold text-text' : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' && <Overview team={team} project={project} members={members} tasks={tasks} navigate={setActiveTab} />}
        {activeTab === 'Team' && <TeamTab members={members} />}
        {activeTab === 'Tasks' && <TasksTab teamId={teamId} />}
        {activeTab === 'Milestones' && <MilestonesTab teamId={teamId} />}
        {activeTab === 'What-If' && <WhatIfTab project={project} members={members} teamScore={team?.overall_match_score || 0} />}
        {activeTab === 'Risk' && <RiskTab project={project} members={members} />}
        {activeTab === 'Chat' && <TeamChat teamId={teamId} />}
      </div>
    </AppShell>
  )
}
