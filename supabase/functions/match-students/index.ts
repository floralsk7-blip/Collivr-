import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, json, requireUser, requireUuid } from '../_shared/http.ts'
import { callGeminiJson } from '../_shared/gemini.ts'
import { assertProjectAccess, withAi } from '../_shared/entitlements.ts'
import { rankStudents, type StudentMatch } from '../_shared/teamInsights.ts'
import { STUDENT_COLUMNS } from '../_shared/students.ts'
import { hashJson } from '../_shared/aiGate.ts'
import { buildMatchPrompt, mergeMatchResults } from '../_shared/aiPrompts.ts'
import { getCached, putCached } from '../_shared/aiCache.ts'
import type { Student } from '../_shared/teamOptimizer.ts'

const AI_CANDIDATES = 20

// AI-assisted matching. A rules engine scores every student (skills 55, experience fit 20,
// interest 15, availability 10). Gemini then reviews the best candidates, adjusts their scores
// and explains each one. Results are cached, so unchanged inputs never cost another AI action.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const projectId = requireUuid(body.projectId, 'project')

    const admin = adminClient()
    const project = await assertProjectAccess(admin, user.id, projectId, true)

    const { data: students, error } = await admin
  .from('student_profiles')
  .select(STUDENT_COLUMNS)
  .neq('id', project.creator_id)
  .neq('id', user.id)
  .limit(500)
    if (error) throw new Error(error.message)
    if (!students || students.length === 0) return json({ matches: [], source: 'rules' })

    const list = students as Student[]
    const ranked = rankStudents(list, project)
    const byId = new Map(list.map((s) => [s.id, s]))
    const top = ranked.slice(0, AI_CANDIDATES)

    const hash = await hashJson({
      p: [project.domain, project.skills_required, project.experience_required],
      c: top.map((m) => {
        const s = byId.get(m.student_id)!
        return [s.id, s.skills, s.skills_detailed, s.experience, s.project_interests, s.availability_hours, s.branch, m.score_percent]
      }),
    })

    let final: StudentMatch[]
    let source: 'ai' | 'rules' = 'ai'
    let notice: string | undefined
    let code: string | undefined

    const cached = await getCached(admin, projectId, 'matching', hash)
    if (cached?.matches) {
      final = (cached.matches as StudentMatch[]).filter(
  (match) =>
    match.student_id !== user.id &&
    match.student_id !== project.creator_id
)
    } else {
      const outcome = await withAi<StudentMatch[]>(
        admin,
        user.id,
        'matching',
        async () => {
          const raw = await callGeminiJson<unknown>(
            buildMatchPrompt(project, top.map((baseline) => ({ student: byId.get(baseline.student_id)!, baseline }))),
          )
          return mergeMatchResults(ranked, raw, AI_CANDIDATES)
        },
        () => ranked,
      )
      final = outcome.value.filter(
  (match) =>
    match.student_id !== user.id &&
    match.student_id !== project.creator_id
)
      source = outcome.source
      notice = outcome.notice
      code = outcome.code
      if (source === 'ai') await putCached(admin, projectId, 'matching', hash, { matches: final })
    }

    // Replace the previous results for this project (works with or without a unique index).
    await admin.from('match_scores').delete().eq('project_id', projectId)
    const { error: insertError } = await admin.from('match_scores').insert(
      final.map((m) => ({
        project_id: projectId,
        student_id: m.student_id,
        score_percent: m.score_percent,
        skill_overlap: m.skill_overlap,
        notes: m.notes,
      })),
    )
    if (insertError) throw new Error(insertError.message)

    return json({ matches: final, source, notice, code })
  } catch (err) {
    return errorResponse(err)
  }
})
