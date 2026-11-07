import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { analyzeProject, matchStudents } from '../lib/gemini'
import { discoverMentorsForProject } from '../lib/mentorMatchingService'
import AppShell from '../components/AppShell'
import AIInsightPanel from '../components/AIInsightPanel'
import StudentCard from '../components/StudentCard'
import UpgradeNotice from '../components/UpgradeNotice'
import MentorBookingModal from '../components/MentorBookingModal'
import {
  getWorkspaceNotes,
  addWorkspaceNote,
  getProjectMilestones,
  toggleMilestoneStatus,
} from '../lib/mentorWorkspaceService'

export default function ProjectDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [project, setProject] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [analysisError, setAnalysisError] = useState(null)
  const [matchNotice, setMatchNotice] = useState('')
  const [matchSource, setMatchSource] = useState('')
  const [analysisNotice, setAnalysisNotice] = useState('')

  const [matchedMentors, setMatchedMentors] = useState([])
  const [loadingMentors, setLoadingMentors] = useState(false)
  const [mentorFilter, setMentorFilter] = useState('all')
  const [bookingMentor, setBookingMentor] = useState(null)

  // Mentorship Workspace states
  const [workspaceNotes, setWorkspaceNotes] = useState([])
  const [projectMilestones, setProjectMilestones] = useState([])
  const [newNoteContent, setNewNoteContent] = useState('')
  const [newNoteCategory, setNewNoteCategory] = useState('general')
  const [submittingNote, setSubmittingNote] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      try {
        const { data: proj, error: projError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', id)
          .maybeSingle()

        if (projError) throw projError

        if (!proj) {
          if (!cancelled) setProject(null)
          return
        }

        if (cancelled) return

        let effectiveProj = proj
        if (proj && !proj.mentor_preference) {
          try {
            const rawDraft =
              sessionStorage.getItem('collivra_create_project_draft_v2') ||
              sessionStorage.getItem('collivra_create_project_draft')
            if (rawDraft) {
              const draft = JSON.parse(rawDraft)
              if (draft?.project?.id === id && draft?.form?.mentor_preference) {
                effectiveProj = { ...proj, mentor_preference: draft.form.mentor_preference }
              }
            }
          } catch {
            // ignore
          }
        }
        setProject(effectiveProj)

        const { data: existingAnalysis } = await supabase
          .from('ai_analysis')
          .select('*')
          .eq('project_id', id)
          .maybeSingle()

        const { data: existingMatches } = await supabase
          .from('match_scores')
          .select('*, student_profiles(*)')
          .eq('project_id', id)
          .order('score_percent', { ascending: false })

        if (cancelled) return

        setAnalysis(existingAnalysis || null)
        setMatches(
          (existingMatches || []).filter((match) => match.student_profiles)
        )

        setLoading(false)

        const creator = user && proj.creator_id === user.id

        if (creator && !existingAnalysis) {
          runAnalysis(proj)
        }

        if (creator && !(existingMatches || []).length) {
          runMatching(proj)
        }

        if (proj.mentor_preference && proj.mentor_preference !== 'none') {
          loadMatchedMentors(proj)
        }

        // Load Mentorship Workspace Notes and Milestones
        try {
          const [notes, milestones] = await Promise.all([
            getWorkspaceNotes(id),
            getProjectMilestones(id),
          ])
          if (!cancelled) {
            setWorkspaceNotes(notes || [])
            setProjectMilestones(milestones || [])
          }
        } catch (wErr) {
          console.warn('Could not load workspace notes/milestones:', wErr)
        }
      } catch (err) {
        console.error('Project load error:', err)

        if (!cancelled) {
          setMatchError(err?.message || 'Could not load project details.')
          setLoading(false)
        }
      }
    }

    async function loadMatchedMentors(proj) {
      setLoadingMentors(true)
      try {
        const results = await discoverMentorsForProject(proj, {
          currentUserId: user?.id,
        })
        if (!cancelled) {
          setMatchedMentors(results.all_matches || [])
        }
      } catch (err) {
        console.warn('Could not load matched mentors:', err)
      } finally {
        if (!cancelled) setLoadingMentors(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [id, user?.id])

  const isCreator = project && user && project.creator_id === user.id

  async function runAnalysis(proj) {
    setAnalyzing(true)
    setAnalysisError(null)
    setAnalysisNotice('')

    try {
      const result = await analyzeProject({
        projectId: proj.id,
      })

      setAnalysis(result)
      setAnalysisNotice(result?.notice || '')

      // refresh project skills in case analysis saved updated skills
      const { data: refreshedProject } = await supabase
        .from('projects')
        .select('*')
        .eq('id', proj.id)
        .maybeSingle()

      if (refreshedProject) setProject(refreshedProject)
    } catch (err) {
      setAnalysisError(err)
    } finally {
      setAnalyzing(false)
    }
  }

  async function runMatching(proj) {
    setMatching(true)
    setMatchError('')
    setMatchNotice('')
    setMatchSource('')

    try {
      const result = await matchStudents({
        projectId: proj.id,
      })

      setMatchNotice(result?.notice || '')
      setMatchSource(result?.source || '')

      const { data, error } = await supabase
        .from('match_scores')
        .select('*, student_profiles(*)')
        .eq('project_id', proj.id)
        .order('score_percent', { ascending: false })

      if (error) throw error

      setMatches(
        (data || []).filter((match) => match.student_profiles)
      )
    } catch (err) {
      setMatchError(
        err?.message
          ? `matching failed: ${err.message}`
          : 'matching failed. please try again.'
      )
    } finally {
      setMatching(false)
    }
  }

  async function handleAddNote(e) {
    e?.preventDefault()
    if (!newNoteContent.trim() || !user || !project) return
    setSubmittingNote(true)
    try {
      const activeMentorId = matchedMentors[0]?.mentor_id || 'dev-mentor-faculty-001'
      const note = await addWorkspaceNote({
        projectId: project.id,
        mentorId: activeMentorId,
        studentId: user.id,
        authorId: user.id,
        category: newNoteCategory,
        content: newNoteContent,
      })
      setWorkspaceNotes((prev) => [note, ...prev])
      setNewNoteContent('')
    } catch (err) {
      console.warn('Could not add note:', err)
    } finally {
      setSubmittingNote(false)
    }
  }

  async function handleToggleMilestone(milestoneId, currentStatus) {
    const nextStatus = currentStatus === 'completed' ? 'in_progress' : 'completed'
    try {
      await toggleMilestoneStatus(milestoneId, nextStatus)
      setProjectMilestones((prev) =>
        prev.map((m) => (m.id === milestoneId ? { ...m, status: nextStatus } : m))
      )
    } catch (err) {
      console.warn('Could not toggle milestone:', err)
    }
  }

  function handleFindMatches() {
    if (!project || matching) return
    runMatching(project)
  }

  function handleSuggestTeam() {
    if (!project) return

    if (!matches.length) {
      setMatchError('find student matches before generating a team.')
      return
    }

    if (!(project.skills_required || []).length) {
      setMatchError(
        'this project has no confirmed required skills. update its skills before generating a team.'
      )
      return
    }

    navigate(`/team/${project.id}/recommend`)
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-content px-6 py-7">
          <div className="skeleton h-8 w-1/2" />
          <div className="skeleton mt-4 h-24 w-full" />
          <div className="skeleton mt-4 h-40 w-full" />
        </div>
      </AppShell>
    )
  }

  if (!project) {
    return (
      <AppShell>
        <div className="mx-auto max-w-content px-6 py-7 text-muted">
          Project not found.
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      breadcrumb={
        <span>
          My Projects <span className="mx-1">›</span> {project.name}
        </span>
      }
    >
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        {/* project information */}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-text">
              {project.name}
            </h1>

            <p className="mt-1 text-sm leading-relaxed text-muted">
              {project.description}
            </p>
          </div>

          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-accent">
            {project.domain}
          </span>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-muted">
            REQUIRED SKILLS
          </p>

          <div className="flex flex-wrap gap-2">
            {(project.skills_required || []).length > 0 ? (
              project.skills_required.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text"
                >
                  {skill}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted">
                no required skills have been confirmed yet.
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-6 text-sm text-muted">
          <span>
            Deadline:{' '}
            {project.deadline
              ? new Date(project.deadline).toLocaleDateString()
              : 'None'}
          </span>

          <span>Team size: {project.team_size}</span>

          <span>
            Experience: {project.experience_required || 'Not specified'}
          </span>

          {project.mentor_preference && project.mentor_preference !== 'none' && (
            <span>
              Mentor:{' '}
              {project.mentor_preference === 'professor'
                ? 'College Professor'
                : project.mentor_preference === 'industry'
                  ? 'Industry Expert'
                  : 'AI Recommendation'}
            </span>
          )}
        </div>

        {/* ai project analysis */}

        <div className="mt-8">
          <AIInsightPanel
  analysis={analysis}
  requiredSkills={project.skills_required || analysis?.required_skills || []}
  loading={analyzing}
/>

          {analysisNotice && (
            <p className="mt-3 rounded-lg bg-goldSoft px-3 py-2 text-xs text-textSecondary">
              {analysisNotice}
            </p>
          )}

          {analysisError &&
            (analysisError.code === 'quota_reached' ||
            analysisError.code === 'upgrade_required' ? (
              <UpgradeNotice
                message={analysisError.message}
                className="mt-3"
              />
            ) : (
              <p className="mt-3 text-sm text-danger">
                Analysis failed: {analysisError.message}
              </p>
            ))}

          {isCreator && !analyzing && !analysis && (
            <button
              onClick={() => runAnalysis(project)}
              className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:border-primary"
            >
              Run AI Analysis
            </button>
          )}
        </div>

        {/* matching */}

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-text">
              Matched Students
            </h2>

            <p className="mt-1 text-xs text-muted">
              students ranked according to the project's required skills
              and their profiles.
            </p>
          </div>

          {isCreator && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleFindMatches}
                disabled={matching}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:border-primary disabled:opacity-50"
              >
                {matching ? 'Analyzing students...' : 'Find Matches'}
              </button>

              {matches.length > 0 && (
                <button
                  onClick={handleSuggestTeam}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/80"
                >
                  Generate AI Team
                </button>
              )}
            </div>
          )}
        </div>

        {matchError && (
          <p className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            {matchError}
          </p>
        )}

        {matchNotice && (
          <p className="mt-4 rounded-lg bg-goldSoft px-3 py-2 text-xs text-textSecondary">
            {matchNotice}
          </p>
        )}

        {matchSource === 'ai' && (
          <p className="mt-3 text-xs font-medium text-primary">
            ✨ students ranked using gemini ai analysis
          </p>
        )}

        {matches.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            {matching
              ? 'analyzing student profiles and finding matches...'
              : isCreator
                ? 'no matches yet. click "find matches" to analyze student profiles.'
                : 'check back soon for matched students.'}
          </p>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {matches.map((match) => (
              <StudentCard
                key={match.id}
                student={match.student_profiles}
                score={match.score_percent}
                notes={match.notes}
                skillOverlap={match.skill_overlap}
                projectId={project.id}
                showInvite={isCreator}
              />
            ))}
          </div>
        )}

        {isCreator && matches.length > 0 && (
          <div className="mt-8 rounded-xl border border-border bg-surface p-5">
            <h3 className="font-semibold text-text">
              Ready to build your team?
            </h3>

            <p className="mt-1 text-sm text-muted">
              gemini can evaluate the matched students together, select a
              balanced team, assign roles, and explain its decisions.
            </p>

            <button
              onClick={handleSuggestTeam}
              className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/80"
            >
              Generate AI Team Recommendation →
            </button>
          </div>
        )}

        {/* AI Matched Mentors Section */}
        {project.mentor_preference && project.mentor_preference !== 'none' && (
          <div className="mt-12 border-t border-border pt-8">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl">✨</span>
                  <h2 className="text-xl font-bold text-text">
                    AI-Matched Mentors
                  </h2>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {project.mentor_preference === 'both' || project.mentor_preference === 'ai'
                      ? 'Academic & Industry Fit'
                      : project.mentor_preference === 'college_professor' || project.mentor_preference === 'professor'
                        ? 'College Professors'
                        : 'Industry Experts'}
                  </span>
                </div>

                <p className="mt-1 text-xs text-muted">
                  Ranked College Professors and Industry Experts based on technical fit, project complexity, and domain relevance.
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMentorFilter('all')}
                  className={`rounded-[9px] px-3.5 py-1.5 text-xs font-semibold transition ${
                    mentorFilter === 'all'
                      ? 'bg-primary text-white shadow-sm'
                      : 'border border-border bg-surface text-textSecondary hover:bg-surface2'
                  }`}
                >
                  All ({matchedMentors.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMentorFilter('college_professor')}
                  className={`rounded-[9px] px-3.5 py-1.5 text-xs font-semibold transition ${
                    mentorFilter === 'college_professor'
                      ? 'bg-primary text-white shadow-sm'
                      : 'border border-border bg-surface text-textSecondary hover:bg-surface2'
                  }`}
                >
                  🎓 College Professors ({matchedMentors.filter((m) => m.categories?.includes('college_professor') || m.primary_category === 'college_professor').length})
                </button>
                <button
                  type="button"
                  onClick={() => setMentorFilter('industry_expert')}
                  className={`rounded-[9px] px-3.5 py-1.5 text-xs font-semibold transition ${
                    mentorFilter === 'industry_expert'
                      ? 'bg-primary text-white shadow-sm'
                      : 'border border-border bg-surface text-textSecondary hover:bg-surface2'
                  }`}
                >
                  💼 Industry Experts ({matchedMentors.filter((m) => m.categories?.includes('industry_expert') || m.primary_category === 'industry_expert').length})
                </button>
              </div>
            </div>

            {loadingMentors ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="skeleton h-44 rounded-2xl" />
                <div className="skeleton h-44 rounded-2xl" />
              </div>
            ) : matchedMentors.length === 0 ? (
              <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
                No matching mentors found yet. Mentors will appear as soon as verified professors or industry experts matching your requirements register on Collivra.
              </p>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {matchedMentors
                  .filter((m) => {
                    if (mentorFilter === 'all') return true
                    return m.categories?.includes(mentorFilter) || m.primary_category === mentorFilter
                  })
                  .map((mentor) => (
                    <div
                      key={mentor.mentor_id}
                      className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-card transition hover:border-borderStrong"
                    >
                      <div>
                        {/* Top: Name, Affiliation, Category, Score */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface2 text-base font-bold text-primary">
                              {mentor.full_name?.charAt(0)?.toUpperCase()}
                            </span>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h3 className="text-sm font-semibold text-text">
                                  {mentor.full_name}
                                </h3>
                                {mentor.verification_status === 'verified' && (
                                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent" title="Verified by institutional credentials">
                                    ✓ Verified
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-muted">
                                {mentor.primary_category === 'college_professor'
                                  ? `${mentor.academic_designation || 'Faculty'} · ${mentor.institution_name || 'Academic Institution'}`
                                  : `${mentor.company_role || 'Industry Specialist'} · ${mentor.company_name || 'Technology Enterprise'}`}
                              </p>
                            </div>
                          </div>

                          {/* Fit Score Badge */}
                          <div className="flex flex-col items-end">
                            <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent">
                              {mentor.final_score}% fit
                            </span>
                          </div>
                        </div>

                        {/* Professional Headline */}
                        <p className="mt-2 text-xs font-medium text-text">
                          {mentor.headline}
                        </p>

                        {/* Score Breakdown Pills */}
                        <div className="mt-3 flex flex-wrap gap-1.5 border-y border-border py-2 text-[11px] text-textSecondary">
                          <span className="rounded bg-surface2 px-2 py-0.5">
                            Expertise: <strong>{mentor.score_breakdown?.expertise}%</strong>
                          </span>
                          <span className="rounded bg-surface2 px-2 py-0.5">
                            Experience: <strong>{mentor.score_breakdown?.experience}%</strong>
                          </span>
                          <span className="rounded bg-surface2 px-2 py-0.5">
                            Background: <strong>{mentor.score_breakdown?.background}%</strong>
                          </span>
                          <span className="rounded bg-surface2 px-2 py-0.5">
                            Availability: <strong>{mentor.score_breakdown?.availability}%</strong>
                          </span>
                        </div>

                        {/* AI Match Explanation */}
                        {mentor.explanation && (
                          <div className="mt-3 rounded-[9px] bg-primary/5 p-3 text-xs leading-relaxed text-textSecondary">
                            <p className="font-semibold text-text">
                              {mentor.explanation.match_summary}
                            </p>
                            <p className="mt-1">
                              {mentor.explanation.why_matched}
                            </p>
                            <p className="mt-1 text-primary">
                              {mentor.explanation.how_mentor_helps}
                            </p>
                          </div>
                        )}

                        {/* Matched Skills */}
                        {mentor.matched_skills?.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {mentor.matched_skills.map((skill) => (
                              <span
                                key={skill}
                                className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] font-medium text-primary"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Available Mentorship Packages */}
                        {mentor.packages?.length > 0 && (
                          <div className="mt-3 rounded-lg border border-border bg-surface2/40 p-2.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-text">Packages & Mentorship:</span>
                              <span className="font-bold text-accent">
                                From ${Math.min(...mentor.packages.map((p) => p.price_usd))}/mo
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {mentor.packages.map((p) => (
                                <span
                                  key={p.id}
                                  className="rounded bg-surface px-2 py-0.5 text-[10px] font-medium text-textSecondary border border-border"
                                  title={p.description || p.name}
                                >
                                  {p.tier?.toUpperCase()}: ${p.price_usd}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action */}
                      <div className="mt-4 pt-2 border-t border-border flex items-center justify-between">
                        <span className="text-xs text-muted">
                          {mentor.years_of_experience} yrs exp · {mentor.availability_info?.weekly_hours || 5} hrs/wk
                        </span>

                        <button
                          type="button"
                          onClick={() => setBookingMentor(mentor)}
                          className="rounded-[8px] bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primaryHover shadow-sm"
                        >
                          Book Session →
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Project Mentorship Workspace (Sub-phase 8) */}
        {project.mentor_preference && project.mentor_preference !== 'none' && (
          <div className="mt-12 border-t border-border pt-8 space-y-6">
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎯</span>
                  <h2 className="text-xl font-bold text-text">
                    Mentorship Workspace
                  </h2>
                  <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    Active Collaboration
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Shared milestones, technical code review notes, and architectural guidance for this project.
                </p>
              </div>

              <Link
                to="/student/mentorships"
                className="text-xs font-semibold text-primary hover:underline"
              >
                View Full Mentorship Hub →
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Left Column: Milestones */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-card space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-sm font-bold text-text">Mentorship Milestones</h3>
                  <span className="text-xs text-muted">
                    {projectMilestones.filter((m) => m.status === 'completed').length}/{projectMilestones.length} Completed
                  </span>
                </div>

                {projectMilestones.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted">
                    No milestones recorded yet. Sessions with your mentor will establish project milestones.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {projectMilestones.map((milestone) => (
                      <div
                        key={milestone.id}
                        onClick={() => handleToggleMilestone(milestone.id, milestone.status)}
                        className={`cursor-pointer flex items-start gap-3 rounded-xl border p-3 transition ${
                          milestone.status === 'completed'
                            ? 'border-border/60 bg-surface2/30 opacity-75'
                            : 'border-border bg-surface hover:bg-surface2/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={milestone.status === 'completed'}
                          readOnly
                          className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                        />
                        <div className="flex-1">
                          <h4 className={`text-xs font-semibold ${milestone.status === 'completed' ? 'line-through text-muted' : 'text-text'}`}>
                            {milestone.title}
                          </h4>
                          {milestone.description && (
                            <p className="mt-0.5 text-[11px] text-textSecondary">
                              {milestone.description}
                            </p>
                          )}
                          {milestone.due_date && (
                            <span className="mt-1 inline-block text-[10px] text-muted">
                              Due: {milestone.due_date}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Shared Notes & Code Review Records */}
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-card space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-sm font-bold text-text">Workspace Notes & Code Reviews</h3>
                  <span className="text-xs text-muted">{workspaceNotes.length} Note(s)</span>
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={newNoteCategory}
                      onChange={(e) => setNewNoteCategory(e.target.value)}
                      className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-text focus:outline-none"
                    >
                      <option value="general">General</option>
                      <option value="code_review">Code Review</option>
                      <option value="architecture">Architecture</option>
                      <option value="action_item">Action Item</option>
                    </select>
                    <input
                      type="text"
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      placeholder="Add guidance note or code review observation..."
                      className="flex-1 rounded-[8px] border border-border bg-surface px-3 py-1 text-xs text-text placeholder:text-muted focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={submittingNote || !newNoteContent.trim()}
                      className="rounded-[8px] bg-primary px-3.5 py-1 text-xs font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                    >
                      Post
                    </button>
                  </div>
                </form>

                {/* Notes List */}
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {workspaceNotes.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted">
                      No workspace notes posted yet.
                    </p>
                  ) : (
                    workspaceNotes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-xl border border-border bg-surface2/30 p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="rounded bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary border border-border">
                            {note.category?.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-muted">
                            {new Date(note.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-textSecondary leading-relaxed pt-1">
                          {note.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mentor Booking & Checkout Modal */}
        {bookingMentor && (
          <MentorBookingModal
            mentor={bookingMentor}
            project={project}
            packages={bookingMentor.packages || []}
            isOpen={Boolean(bookingMentor)}
            onClose={() => setBookingMentor(null)}
            onBookingSuccess={(b) => {
              console.log('Session booked:', b)
            }}
          />
        )}
      </div>
    </AppShell>
  )
}