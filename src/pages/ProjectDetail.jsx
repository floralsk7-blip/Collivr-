import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { analyzeProject, matchStudents } from '../lib/gemini'
import AppShell from '../components/AppShell'
import AIInsightPanel from '../components/AIInsightPanel'
import StudentCard from '../components/StudentCard'
import UpgradeNotice from '../components/UpgradeNotice'

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
        setProject(proj)

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
      } catch (err) {
        console.error('Project load error:', err)

        if (!cancelled) {
          setMatchError(err?.message || 'Could not load project details.')
          setLoading(false)
        }
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
      </div>
    </AppShell>
  )
}