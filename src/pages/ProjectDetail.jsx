import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { analyzeProject, matchStudents, suggestTeam } from '../lib/gemini'
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
  const [suggestion, setSuggestion] = useState(null)
  const [suggesting, setSuggesting] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [analysisError, setAnalysisError] = useState(null)
  const [matchNotice, setMatchNotice] = useState('')
  const [matchSource, setMatchSource] = useState('')
  const [analysisNotice, setAnalysisNotice] = useState('')
  const [suggestError, setSuggestError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: proj, error: projError } = await supabase.from('projects').select('*').eq('id', id).maybeSingle()
      if (projError) console.error('Project load error:', projError)
      setProject(proj)

      const { data: existingAnalysis } = await supabase.from('ai_analysis').select('*').eq('project_id', id).maybeSingle()
      setAnalysis(existingAnalysis)

      const { data: existingMatches } = await supabase
        .from('match_scores')
        .select('*, student_profiles(*)')
        .eq('project_id', id)
        .order('score_percent', { ascending: false })
      setMatches(existingMatches || [])

      setLoading(false)

      // Auto-run the analysis for the creator if this project has none yet.
      if (proj && user && proj.creator_id === user.id && !existingAnalysis) {
        runAnalysis(proj)
      }

      // Auto-run AI matching on first load if the creator has no matches yet.
      if (proj && user && proj.creator_id === user.id && (existingMatches || []).length === 0) {
        runMatching(proj)
      }
    }
    load()
  }, [id])

  const isCreator = project && user && project.creator_id === user.id

  async function runAnalysis(proj) {
    setAnalyzing(true)
    setAnalysisError(null)
    try {
      const result = await analyzeProject({ projectId: proj.id })
      setAnalysis(result)
      setAnalysisNotice(result?.notice || '')
    } catch (err) {
      setAnalysisError(err)
    } finally {
      setAnalyzing(false)
    }
  }

  async function runMatching(proj) {
    setMatching(true)
    setMatchError('')
    try {
      const res = await matchStudents({ projectId: proj.id })
      setMatchNotice(res?.notice || '')
      setMatchSource(res?.source || '')
      const { data } = await supabase
        .from('match_scores')
        .select('*, student_profiles(*)')
        .eq('project_id', proj.id)
        .order('score_percent', { ascending: false })
      setMatches(data || [])
    } catch (err) {
      setMatchError('Matching failed: ' + err.message)
    } finally {
      setMatching(false)
    }
  }

  function handleFindMatches() {
    if (!project) return
    runMatching(project)
  }

  async function handleSuggestTeam() {
    if (!project) return
    setSuggesting(true)
    setSuggestError('')
    try {
      const result = await suggestTeam({
        projectId: project.id,
        matchedStudents: matches.map((m) => ({
          student_id: m.student_id,
          name: m.student_profiles?.name,
          score_percent: m.score_percent,
          skill_overlap: m.skill_overlap,
        })),
        teamSize: project.team_size,
      })
      setSuggestion(result)
    } catch (err) {
      setSuggestError(err.message)
    } finally {
      setSuggesting(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-content px-6 py-7">
          <div className="skeleton h-8 w-1/2" />
          <div className="skeleton mt-4 h-24 w-full" />
        </div>
      </AppShell>
    )
  }

  if (!project) {
    return (
      <AppShell>
        <div className="mx-auto max-w-content px-6 py-7 text-muted">Project not found.</div>
      </AppShell>
    )
  }

  return (
    <AppShell breadcrumb={<span>My Projects <span className="mx-1">›</span> {project.name}</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text">{project.name}</h1>
            <p className="mt-1 text-muted">{project.description}</p>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-accent">{project.domain}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(project.skills_required || []).map((s) => (
            <span key={s} className="rounded-full border border-border px-3 py-1 text-xs text-text">{s}</span>
          ))}
        </div>

        <div className="mt-4 flex gap-6 text-sm text-muted">
          <span>Deadline: {project.deadline ? new Date(project.deadline).toLocaleDateString() : 'None'}</span>
          <span>Team size: {project.team_size}</span>
          <span>Experience: {project.experience_required}</span>
        </div>

        <div className="mt-8">
          <AIInsightPanel analysis={analysis} loading={analyzing} />
          {analysisNotice && <p className="mt-3 rounded-lg bg-goldSoft px-3 py-2 text-xs text-textSecondary">{analysisNotice}</p>}
          {analysisError && (
            analysisError.code === 'quota_reached' || analysisError.code === 'upgrade_required'
              ? <UpgradeNotice message={analysisError.message} className="mt-3" />
              : <p className="mt-3 text-sm text-danger">Analysis failed: {analysisError.message}</p>
          )}
          {isCreator && !analyzing && !analysis && (
            <button onClick={() => runAnalysis(project)} className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:border-primary">
              Run AI Analysis
            </button>
          )}
        </div>

        <div className="mt-12 flex items-center justify-between">
          <h2 className="text-xl font-bold text-text">Matched Students</h2>
          <div className="flex gap-3">
            {isCreator && (
              <button onClick={handleFindMatches} disabled={matching} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:border-primary disabled:opacity-50">
                {matching ? 'Finding...' : 'Find matches'}
              </button>
            )}
            {isCreator && matches.length > 0 && (
              <button onClick={handleSuggestTeam} disabled={suggesting} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/80 disabled:opacity-50">
                {suggesting ? 'Choosing...' : 'Suggest a team'}
              </button>
            )}
          </div>
        </div>

        {suggestion && (
          <div className="mt-4 rounded-xl border-l-4 border-l-accent border-y border-r border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text">Recommended Team</h3>
              <span className="text-lg font-bold text-accent">{suggestion.team_score}%</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-text">{suggestion.reasoning}</p>
            {suggestion.coaching_notes && (
              <p className="mt-2 text-sm italic leading-relaxed text-muted">{suggestion.coaching_notes}</p>
            )}
            <button onClick={() => navigate(`/team/${project.id}/form`)} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/80">
              Go to Team Formation
            </button>
          </div>
        )}

        {matchError && <p className="mt-4 text-sm text-danger">{matchError}</p>}
        {matchNotice && <p className="mt-4 rounded-lg bg-goldSoft px-3 py-2 text-xs text-textSecondary">{matchNotice}</p>}
        {matchSource === 'ai' && <p className="mt-3 text-xs font-medium text-primary">Ranked with AI</p>}
        {suggestError && <p className="mt-4 text-sm text-danger">{suggestError}</p>}

        {matches.length === 0 ? (
          <p className="mt-6 text-muted">
            {matching ? 'Finding matches...' : isCreator ? 'No matches yet. Click "Find Matches" to rank students for this project.' : 'Check back soon.'}
          </p>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {matches.map((m) => (
              <StudentCard key={m.id} student={m.student_profiles} score={m.score_percent} notes={m.notes} projectId={project.id} showInvite={isCreator} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
