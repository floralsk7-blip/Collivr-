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
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setSuggestError('')

      try {
        const { data: proj, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .maybeSingle()

        if (projectError) throw projectError
        if (!proj) throw new Error('Project not found.')

        if (cancelled) return
        setProject(proj)

        const { data: matchData, error: matchError } = await supabase
          .from('match_scores')
          .select('*, student_profiles(*)')
          .eq('project_id', projectId)
          .order('score_percent', { ascending: false })

        if (matchError) throw matchError

        const validMatches = (matchData || []).filter(
          (match) => match.student_profiles
        )

        if (cancelled) return
        setMatches(validMatches)

        if (!validMatches.length) {
          setSuggestError(
            'No matched students found. run student matching first.'
          )
          return
        }

        if (!(proj.skills_required || []).length) {
          setSuggestError(
            'This project has no confirmed required skills. update the project skills before generating a team.'
          )
          return
        }

        const result = await suggestTeam({
          projectId: proj.id,
          matchedStudents: validMatches.map((match) => ({
            student_id: match.student_id,
            name: match.student_profiles?.name,
            score_percent: match.score_percent,
            skill_overlap: match.skill_overlap,
          })),
          teamSize: proj.team_size,
        })

        if (cancelled) return

        if (!result?.recommended_team?.length) {
          throw new Error('AI did not return any recommended team members.')
        }

        setSuggestion(result)
      } catch (err) {
        if (!cancelled) {
          setSuggestError(
            err?.message || 'Could not generate the team recommendation.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [projectId])

  const recommendedMembers = matches
    .filter((match) =>
      suggestion?.recommended_team?.includes(match.student_id)
    )
    .map((match) => {
      const roles = suggestion?.roles || {}

      return {
        ...match.student_profiles,
        studentId: match.student_id,
        role: roles[match.student_id] || 'Team Member',
        skillMatch: Math.round(Number(match.score_percent) || 0),
        skillOverlap: match.skill_overlap || [],
      }
    })

  async function createTeam() {
    if (!project || !suggestion || !recommendedMembers.length) return

    setCreating(true)
    setCreateError('')

    try {
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
          project_id: project.id,
          overall_match_score: suggestion.team_score,
          coaching_notes: suggestion.coaching_notes || '',
        })
        .select()
        .single()

      if (teamError) throw teamError
      if (!team) throw new Error('Could not create the team.')

      const members = recommendedMembers.map((member) => ({
        team_id: team.id,
        student_id: member.studentId,
        role: member.role,
      }))

      const { error: membersError } = await supabase
        .from('team_members')
        .insert(members)

      if (membersError) {
        // avoid leaving an empty team if member insertion fails
        await supabase.from('teams').delete().eq('id', team.id)
        throw membersError
      }

      const { error: projectError } = await supabase
        .from('projects')
        .update({ status: 'active' })
        .eq('id', project.id)

      if (projectError) {
        throw projectError
      }

      navigate(`/team/${team.id}`)
    } catch (err) {
      setCreateError(
        err?.message || 'Could not create the recommended team.'
      )
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-content px-6 py-7">
          <div className="skeleton mb-4 h-8 w-1/3" />
          <div className="skeleton mb-3 h-20 w-full" />
          <div className="skeleton h-40 w-full" />
          <p className="mt-4 text-sm text-muted">
            analyzing matched students and selecting the best team...
          </p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      breadcrumb={
        <span>
          My Projects <span className="mx-1">›</span>
          {project?.name} <span className="mx-1">›</span>
          Recommendation
        </span>
      }
    >
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text">
              AI Team Recommendation
            </h1>

            <p className="mt-1 text-sm text-muted">
              {project?.name}
            </p>
          </div>

          {suggestion && (
            <div className="flex items-center gap-3">
              <div className="flex h-[58px] w-[58px] flex-col items-center justify-center rounded-full border-[3px] border-accent bg-accent/10">
                <span className="text-base font-extrabold text-accent">
                  {Math.round(suggestion.team_score || 0)}%
                </span>
              </div>

              <div>
                <p className="text-xs font-semibold text-text">
                  Overall Match
                </p>
                <p className="text-[11px] text-muted">
                  Team compatibility
                </p>
              </div>
            </div>
          )}
        </div>

        {!suggestion ? (
          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="text-sm text-text">
              {suggestError || 'No team recommendation is available.'}
            </p>

            <button
              onClick={() => navigate(`/project/${projectId}`)}
              className="mt-4 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            >
              Back to Project
            </button>
          </div>
        ) : (
          <>
            {suggestion.notice && (
              <div className="mb-4 rounded-lg border border-border bg-surface2 px-3 py-2 text-xs text-textSecondary">
                {suggestion.notice}
              </div>
            )}

            <div className="mb-6 rounded-xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-text">
                  Why this team?
                </h2>

                <span className="rounded-md bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent">
                  {suggestion.source === 'ai' ? 'gemini analysis' : 'rules analysis'}
                </span>
              </div>

              <p className="m-0 text-sm leading-relaxed text-textSecondary">
                {suggestion.reasoning ||
                  'The recommendation was generated using the available student profiles and project requirements.'}
              </p>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-text">
                Selected Team Members
              </h2>

              <span className="text-xs text-muted">
                {recommendedMembers.length} selected
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-surface2">
                    <th className="px-4 py-3 text-xs font-semibold text-muted">
                      Student
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted">
                      Assigned Role
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted">
                      Match
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted">
                      Connect
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {recommendedMembers.map((member) => (
                    <tr
                      key={member.studentId}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-accent">
                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>

                          <div>
                            <p className="m-0 text-sm font-medium text-text">
                              {member.name || 'Student'}
                            </p>

                            <p className="m-0 text-[11px] text-muted">
                              {member.college || 'College not provided'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-accent">
                          {member.role}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="text-sm font-bold text-accent">
                          {member.skillMatch}%
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="w-[130px]">
                          <ConnectButton studentId={member.studentId} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {suggestion.breakdown && (
              <div className="my-6 rounded-xl border border-border bg-surface p-4">
                <h2 className="mb-4 text-sm font-semibold text-text">
                  Team Analysis
                </h2>

                <div className="grid gap-4 sm:grid-cols-2">
                  {Object.entries(suggestion.breakdown).map(
                    ([key, value]) => (
                      <div key={key}>
                        <div className="mb-1 flex justify-between gap-3">
                          <span className="text-xs capitalize text-muted">
                            {key.replaceAll('_', ' ')}
                          </span>

                          <span className="text-xs font-semibold text-text">
                            {Math.round(Number(value) || 0)}%
                          </span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-surface2">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(100, Number(value) || 0)
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {suggestion.missing_skills?.length > 0 && (
              <div className="my-5 rounded-xl border border-border bg-surface p-4">
                <h2 className="mb-2 text-sm font-semibold text-text">
                  Skills not covered
                </h2>

                <p className="mb-3 text-xs text-muted">
                  these project requirements are not currently covered by
                  the selected team.
                </p>

                <div className="flex flex-wrap gap-2">
                  {suggestion.missing_skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md border border-border bg-surface2 px-3 py-1.5 text-xs text-text"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {suggestion.coaching_notes && (
              <div className="my-5 rounded-xl border border-border bg-surface p-4">
                <h2 className="mb-2 text-sm font-semibold text-text">
                  AI Team Guidance
                </h2>

                <p className="m-0 text-sm leading-relaxed text-textSecondary">
                  {suggestion.coaching_notes}
                </p>
              </div>
            )}

            {createError && (
              <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                {createError}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => navigate(`/project/${projectId}`)}
                className="flex-1 rounded-lg border border-primary px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10"
              >
                View More Matches
              </button>

              <button
                onClick={createTeam}
                disabled={creating || !recommendedMembers.length}
                className="flex-[2] rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
              >
                {creating
                  ? 'Creating Team...'
                  : 'Create Team & Go to Project →'}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}