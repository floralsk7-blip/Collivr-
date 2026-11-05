import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireUser, requireUuid } from '../_shared/http.ts'
import { callGeminiJson } from '../_shared/gemini.ts'
import { assertProjectAccess, requireInsights, withAi } from '../_shared/entitlements.ts'
import { assessRisk, pickBestTeam, simulateTeam } from '../_shared/teamInsights.ts'
import { cleanIds, loadStudents } from '../_shared/students.ts'
import { hashJson } from '../_shared/aiGate.ts'
import { buildRiskPrompt, buildSimPrompt, buildTeamPrompt, parseExplanation, parseReasoning, parseSuggestion } from '../_shared/aiPrompts.ts'
import { getCached, putCached } from '../_shared/aiCache.ts'

const memberIds = (list: unknown, max: number) =>
  cleanIds((Array.isArray(list) ? list : []).map((m: { student_id?: string }) => m?.student_id), max)

// Team suggestions, risk analysis and what-if scoring.
//  - default: the optimizer picks the best team; Gemini explains it and writes coaching notes
//  - "risk":     rules find the weak spots; Gemini writes the advice (Premium)
//  - "simulate": rules score any group; Gemini explains how it would perform (Premium)
// Every AI step has a rules-based fallback and counts as one AI action on the user's plan.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const mode = typeof body.mode === 'string' ? body.mode : 'recommend'
    const admin = adminClient()

    if (mode === 'risk') {
      await requireInsights(admin, user.id)
      const projectId = requireUuid(body.projectId ?? body.project?.id, 'project')
      const project = await assertProjectAccess(admin, user.id, projectId)
      const members = await loadStudents(admin, memberIds(body.teamMembers, 20))
      if (members.length === 0) throw new HttpError(400, 'This team has no members to analyze.')

      const report = assessRisk(project, members)
      const hash = await hashJson({ p: [project.domain, project.skills_required], m: members.map((s) => [s.id, s.skills, s.experience, s.availability_hours]) })
      const cached = await getCached(admin, projectId, 'risk', hash)
      if (cached?.suggestion) return json({ ...report, ai_suggestion: cached.suggestion, source: 'ai' })

      const outcome = await withAi<string>(
        admin,
        user.id,
        'risk',
        async () => parseSuggestion(await callGeminiJson<unknown>(buildRiskPrompt(project, members, report))),
        () => report.ai_suggestion,
      )
      if (outcome.source === 'ai') await putCached(admin, projectId, 'risk', hash, { suggestion: outcome.value })
      return json({ ...report, ai_suggestion: outcome.value, source: outcome.source, notice: outcome.notice, code: outcome.code })
    }

    if (mode === 'simulate') {
      await requireInsights(admin, user.id)
      const projectId = requireUuid(body.projectId, 'project')
      const project = await assertProjectAccess(admin, user.id, projectId)
      const students = await loadStudents(admin, memberIds(body.matchedStudents, 20))
      if (students.length === 0) throw new HttpError(400, 'Pick at least one student to simulate.')

      const sim = simulateTeam(students, project)
      const outcome = await withAi<string>(
        admin,
        user.id,
        'simulate',
        async () => parseReasoning(await callGeminiJson<unknown>(buildSimPrompt(project, students, sim))),
        () => sim.reasoning,
      )
      return json({ team_score: sim.team_score, reasoning: outcome.value, source: outcome.source, notice: outcome.notice, code: outcome.code })
    }

    // Default: recommend the best team for the project (creator only).
    const projectId = requireUuid(body.projectId, 'project')
    const project = await assertProjectAccess(admin, user.id, projectId, true)
    const candidates = await loadStudents(admin, memberIds(body.matchedStudents, 200))
    if (candidates.length === 0) throw new HttpError(400, 'Run matching first so there are students to choose from.')

    const size = Math.floor(Number(body.teamSize) || project.team_size || 4)
    const pick = pickBestTeam(candidates, project, size)
    const byId = new Map(candidates.map((s) => [s.id, s]))
    const members = pick.memberIds.map((id) => byId.get(id)!).filter(Boolean)

    const hash = await hashJson({ p: [project.domain, project.skills_required], t: pick.memberIds, b: pick.breakdown })
    let text: { reasoning: string; coaching: string } = { reasoning: pick.reasoning, coaching: pick.coaching }
    let source: 'ai' | 'rules' = 'ai'
    let notice: string | undefined
    let code: string | undefined

    const cached = await getCached(admin, projectId, 'team', hash)
    if (cached?.reasoning) {
      text = cached
    } else {
      const outcome = await withAi(
        admin,
        user.id,
        'team',
        async () => parseExplanation(await callGeminiJson<unknown>(buildTeamPrompt(project, members, pick))),
        () => text,
      )
      text = outcome.value
      source = outcome.source
      notice = outcome.notice
      code = outcome.code
      if (source === 'ai') await putCached(admin, projectId, 'team', hash, text)
    }

    await admin.from('teams').update({ coaching_notes: text.coaching, overall_match_score: pick.score }).eq('project_id', projectId)

    return json({
      recommended_team: pick.memberIds,
      team_score: Math.round(pick.score),
      reasoning: text.reasoning,
      coaching_notes: text.coaching,
      breakdown: pick.breakdown,
      missing_skills: pick.missingSkills,
      roles: pick.roles,
      source,
      notice,
      code,
    })
  } catch (err) {
    return errorResponse(err)
  }
})
