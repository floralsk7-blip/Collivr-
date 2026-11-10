import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import AppShell from '../components/AppShell'

export default function MyTeams() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) load()
  }, [user])

  async function load() {
    setLoading(true)
    const { data: memberRows } = await supabase.from('team_members').select('team_id').eq('student_id', user.id)
    const teamIds = [...new Set((memberRows || []).map((m) => m.team_id))]

    if (teamIds.length === 0) {
      setTeams([])
      setLoading(false)
      return
    }

    const results = await Promise.all(
      teamIds.map(async (teamId) => {
        const { data: team } = await supabase.from('teams').select('*').eq('id', teamId).maybeSingle()
        const { data: project } = team ? await supabase.from('projects').select('*').eq('id', team.project_id).maybeSingle() : { data: null }
        const { data: members } = await supabase.from('team_members').select('*, student_profiles(*)').eq('team_id', teamId)
        const { data: tasks } = await supabase.from('tasks').select('status').eq('team_id', teamId)
        return { team, project, members: members || [], tasks: tasks || [] }
      })
    )
    setTeams(results.filter((r) => r.team))
    setLoading(false)
  }

  return (
    <AppShell breadcrumb={<span>My Teams</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <h1 className="mb-6 text-xl font-bold text-text">🤝 My Teams</h1>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-48 rounded-[14px]" />)}
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
            <p className="mb-3 text-muted">You're not on any teams yet. Join a project or create one to get started.</p>
            <button onClick={() => navigate('/discover')} className="rounded-[9px] bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover">
              Find Projects
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map(({ team, project, members, tasks }) => {
              const done = tasks.filter((t) => t.status === 'done').length
              const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0
              return (
                <div key={team.id} className="rounded-[14px] border border-border bg-surface p-4">
                  <h3 className="mb-1 text-sm font-semibold text-text">{project?.name}</h3>
                  <p className="mb-3 text-xs text-muted">{project?.domain}</p>

                  <div className="mb-3 flex -space-x-2">
                    {members.slice(0, 5).map((m) => (
                      <div key={m.id} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-surface2 text-xs font-bold text-primary">
                        {m.student_profiles?.name?.charAt(0)?.toUpperCase()}
                      </div>
                    ))}
                  </div>

                  <span className="mb-3 inline-block rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
                    ✓ {Math.round(team.overall_match_score || 0)}% Match
                  </span>

                  <div className="mb-4">
                    <div className="h-[7px] rounded-full bg-surface2">
                      <div className="h-[7px] rounded-full bg-accent" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted">{progress}% complete</p>
                  </div>

                  <button onClick={() => navigate(`/team/${team.id}`)} className="w-full rounded-[9px] bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primaryHover">
                    Open Workspace
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
