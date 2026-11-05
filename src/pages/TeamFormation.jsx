import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import AppShell from '../components/AppShell'

const STATUS_STYLES = {
  pending: 'text-warning bg-warning/10 border-warning/40',
  accepted: 'text-accent bg-accent/10 border-accent/40',
  declined: 'text-danger bg-danger/10 border-danger/40',
}

export default function TeamFormation() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [finalizing, setFinalizing] = useState(false)

  async function load() {
    setLoading(true)
    const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle()
    setProject(proj)
    const { data: inv } = await supabase
      .from('team_invites')
      .select('*, student_profiles!team_invites_receiver_id_fkey(*)')
      .eq('project_id', projectId)
    setInvites(inv || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [projectId])

  const acceptedCount = invites.filter((i) => i.status === 'accepted').length
  const canFinalize = project && acceptedCount >= project.team_size

  async function handleFinalize() {
    if (!project) return
    setFinalizing(true)

    const accepted = invites.filter((i) => i.status === 'accepted')
    const { data: team } = await supabase
      .from('teams')
      .insert({ project_id: project.id })
      .select()
      .single()

    if (team) {
      await supabase.from('team_members').insert(
        accepted.map((i) => ({ team_id: team.id, student_id: i.receiver_id, role: 'Member' }))
      )
      await supabase.from('projects').update({ status: 'active' }).eq('id', project.id)
      navigate(`/team/${team.id}`)
    }
    setFinalizing(false)
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-content px-6 py-7">
          <div className="skeleton h-8 w-1/3" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell breadcrumb={<span>My Projects <span className="mx-1">›</span> Team Formation</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <h1 className="text-2xl font-bold text-text">Team Formation</h1>
        <p className="mt-1 text-muted">{project?.name} — waiting on invited students to respond.</p>

        {invites.length === 0 ? (
          <p className="mt-8 text-muted">No invites sent yet. Head to the project page to invite matched students.</p>
        ) : (
          <div className="mt-8 flex flex-col gap-3">
            {invites.map((invite) => {
              const student = invite.student_profiles
              const initial = student?.name?.charAt(0)?.toUpperCase() || '?'
              return (
                <div key={invite.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
                  {student?.photo_url ? (
                    <img src={student.photo_url} alt={student.name} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-accent">{initial}</div>
                  )}
                  <span className="flex-1 font-medium text-text">{student?.name}</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${STATUS_STYLES[invite.status] || ''}`}>
                    {invite.status}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">{acceptedCount} of {project?.team_size} needed accepted</p>
          {canFinalize && (
            <button onClick={handleFinalize} disabled={finalizing} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/80 disabled:opacity-50">
              {finalizing ? 'Finalizing...' : 'Finalize Team'}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  )
}
