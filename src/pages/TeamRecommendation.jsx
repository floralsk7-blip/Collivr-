import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { suggestTeam } from '../lib/gemini'
import AppShell from '../components/AppShell'
import ConnectButton from '../components/ConnectButton'

export default function TeamRecommendation() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [matches, setMatches] = useState([])
  const [suggestion, setSuggestion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [suggestError, setSuggestError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: proj } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle()
      setProject(proj)

      const { data: matchData } = await supabase
        .from('match_scores')
        .select('*, student_profiles(*)')
        .eq('project_id', projectId)
        .order('score_percent', { ascending: false })
      setMatches(matchData || [])

      if (proj && matchData?.length) {
        const result = await suggestTeam({
          projectId: proj.id,
          matchedStudents: matchData.map((m) => ({
            student_id: m.student_id,
            name: m.student_profiles?.name,
            score_percent: m.score_percent,
            skill_overlap: m.skill_overlap,
          })),
          teamSize: proj.team_size,
        }).catch((err) => {
          setSuggestError(err.message)
          return null
        })
        setSuggestion(result)
      }
      setLoading(false)
    }
    load()
  }, [projectId])

  async function createTeam() {
    if (!project || !suggestion) return
    setCreating(true)
    const recommendedIds = suggestion.recommended_team || []
    const { data: team } = await supabase.from('teams').insert({
      project_id: project.id,
      overall_match_score: suggestion.team_score,
      coaching_notes: suggestion.coaching_notes,
    }).select().single()

    if (team) {
      const members = matches.filter((m) => recommendedIds.includes(m.student_id))
      await supabase.from('team_members').insert(
        members.map((m) => ({ team_id: team.id, student_id: m.student_id, role: 'Member' }))
      )
      await supabase.from('projects').update({ status: 'active' }).eq('id', project.id)
      navigate(`/team/${team.id}`)
    }
    setCreating(false)
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

  const recommendedMembers = matches
    .filter((m) => suggestion?.recommended_team?.includes(m.student_id))
    .map((m) => ({
      ...m.student_profiles,
      role: 'Member',
      skillMatch: Math.round(m.score_percent || 0),
    }))

  return (
    <AppShell breadcrumb={<span>My Projects <span className="mx-1">›</span> {project?.name} <span className="mx-1">›</span> Recommendation</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text">Recommended Team</h1>
            <p className="mt-1 text-muted">{project?.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-[56px] w-[56px] flex-col items-center justify-center rounded-full border-[3px] border-accent bg-accent/10">
              <span className="text-base font-extrabold text-accent">{Math.round(suggestion?.team_score || 0)}%</span>
            </div>
            <span className="hidden rounded-md bg-surface2 px-3 py-1 text-xs font-medium text-primary sm:inline-block">Overall Match</span>
          </div>
        </div>

        {!suggestion ? (
          <p className="text-muted">{suggestError || 'No team suggestion yet. Find matches on the project page first.'}</p>
        ) : (
          <>
            {suggestion.notice && <p className="mb-4 rounded-lg bg-goldSoft px-3 py-2 text-xs text-textSecondary">{suggestion.notice}</p>}
            <p className="mb-6 text-sm leading-relaxed text-text">{suggestion.reasoning}</p>

            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-left">
                <tbody>
                  {recommendedMembers.map((member) => (
                    <tr key={member.id} className="border-b border-border last:border-0">
                      <td className="flex items-center gap-2.5 px-4 py-3.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 font-bold text-accent">
                          {member.name?.charAt(0)}
                        </div>
                        <div>
                          <p className="m-0 text-sm font-medium text-text">{member.name}</p>
                          <p className="m-0 text-[11px] text-muted">{member.college}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-accentLight">{member.role}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-bold text-accent">{member.skillMatch}%</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="w-[130px]">
                          <ConnectButton studentId={member.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="my-6 grid gap-3 sm:grid-cols-3">
              {['Complete skill coverage', 'Aligned project interests', 'Good experience match'].map((s) => (
                <div key={s} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface p-3.5">
                  <span className="text-accent">✓</span>
                  <p className="m-0 text-sm text-accentLight">{s}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => navigate(`/project/${projectId}`)} className="flex-1 rounded-lg border border-primary px-4 py-3 text-sm text-accent hover:bg-primary/10">
                View More Matches
              </button>
              <button onClick={createTeam} disabled={creating} className="flex-[2] rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-text hover:bg-primaryHover disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Team & Go to Project →'}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
