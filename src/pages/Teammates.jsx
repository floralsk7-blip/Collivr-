import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import AppShell from '../components/AppShell'
import StudentCard from '../components/StudentCard'

export default function Teammates() {
  const { projectId } = useParams()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [skillFilter, setSkillFilter] = useState('')
  const [minScore, setMinScore] = useState(0)

  useEffect(() => {
    supabase
      .from('match_scores')
      .select('*, student_profiles(*)')
      .eq('project_id', projectId)
      .order('score_percent', { ascending: false })
      .then(({ data }) => {
        setMatches(data || [])
        setLoading(false)
      })
  }, [projectId])

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      const passesScore = (m.score_percent ?? 0) >= minScore
      const passesSkill = !skillFilter || m.student_profiles?.skills?.some((s) => s.toLowerCase().includes(skillFilter.toLowerCase()))
      return passesScore && passesSkill
    })
  }, [matches, skillFilter, minScore])

  return (
    <AppShell breadcrumb={<span>Matched Teammates</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <h1 className="text-2xl font-bold text-text">Matched Teammates</h1>
        <p className="mt-1 text-muted">Students ranked by how well their skills, experience and availability fit this project.</p>

        <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center">
          <input
            value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}
            placeholder="Filter by skill..."
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
          />
          <div className="flex flex-1 items-center gap-3">
            <span className="text-sm text-muted">Min score: {minScore}%</span>
            <input
              type="range" min="0" max="100" value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
          </div>
        </div>

        {loading ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-56 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-16 text-center text-muted">No teammates match these filters.</p>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((m) => (
              <StudentCard key={m.id} student={m.student_profiles} score={m.score_percent} notes={m.notes} projectId={projectId} showInvite />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
