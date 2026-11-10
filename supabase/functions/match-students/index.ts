import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { adminClient, corsHeaders, errorResponse, json, requireUser, requireUuid } from '../_shared/http.ts'
import { callGeminiJson } from '../_shared/gemini.ts'
import { assertProjectAccess, withAi } from '../_shared/entitlements.ts'
import { STUDENT_COLUMNS } from '../_shared/students.ts'
import { hashJson } from '../_shared/aiGate.ts'
import { getCached, putCached } from '../_shared/aiCache.ts'
import { IMPORTANCE_MULTIPLIER, buildSemanticPrompt, collectAmbiguity, sanitizeSemantics, uniqueRequired, type Semantics } from '../_shared/matchSemantics.ts'
import { MATCH_ALGORITHM_VERSION, WEIGHTS, rankEligible, type MatchStudent } from '../_shared/skillFirstMatching.ts'

export const NO_MATCH_NOTICE =
  "No students currently match this project's required skills. Try adjusting the project requirements or check again later."

// Skill-first matching. Gemini judges meaning (skill importance, wording it does not know,
// role and interest relevance); the backend validates that and computes every score itself.
// Pipeline: fetch real profiles -> ask Gemini (or reuse cached judgements) -> validate ->
// deterministic scoring -> skill-eligibility gate -> save.
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
      .select(`${STUDENT_COLUMNS}, open_to_collaborate, account_type`)
      .neq('id', project.creator_id)
      .neq('id', user.id)
      .limit(500)
    if (error) throw new Error(error.message)

    const list = ((students ?? []) as MatchStudent[]).filter((s) => s.account_type !== 'organiser')

    const { data: analysis, error: analysisError } = await admin
      .from('ai_analysis')
      .select('identified_roles, skill_gaps')
      .eq('project_id', projectId)
      .maybeSingle()
    if (analysisError) throw new Error(analysisError.message)
    const roles: string[] = (analysis?.identified_roles ?? []).filter((r: unknown) => typeof r === 'string' && r.trim())

    const required = uniqueRequired(project.skills_required)
    const exclude = [project.creator_id, user.id]
    let semantic: Semantics
    let final

    if (required.length === 0 || list.length === 0) {
      // Nothing to compare: do not spend an AI action, and do not invent matches.
      final = []
    } else {
      const ambiguity = collectAmbiguity(required, project.domain, list)

      // Everything that can change a match is part of the key, so stale answers are never reused.
      const hash = await hashJson({
        matching_algorithm_version: MATCH_ALGORITHM_VERSION,
        weights: WEIGHTS,
        importance_multipliers: IMPORTANCE_MULTIPLIER,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          domain: project.domain,
          skills_required: project.skills_required ?? [],
          experience_required: project.experience_required,
          team_size: project.team_size,
          deadline: project.deadline ?? null,
          identified_roles: roles,
        },
        candidates: list.map((s) => ({
          id: s.id,
          skills: s.skills ?? [],
          skills_detailed: s.skills_detailed ?? [],
          experience: s.experience ?? null,
          interests: s.project_interests ?? [],
          availability: s.availability_hours ?? null,
          collaboration: s.open_to_collaborate ?? null,
          branch: s.branch ?? null,
          department: s.department ?? null,
        })),
      })

      const cached = await getCached(admin, projectId, 'matching', hash)

      if (cached?.algorithm_version === MATCH_ALGORITHM_VERSION && cached?.semantic) {
        // Cached judgements are re-validated, and scores are always recomputed from the live profiles.
        semantic = sanitizeSemantics(cached.semantic, required, roles, ambiguity)
      } else {
        const outcome = await withAi<Semantics>(
          admin,
          user.id,
          'matching',
          async () => {
            const raw = await callGeminiJson<unknown>(buildSemanticPrompt(project, required, roles, ambiguity))
            return sanitizeSemantics(raw, required, roles, ambiguity)
          },
          // No fake recommendations when AI is unavailable or the quota is used up.
          () => {
            throw new Error('AI matching is unavailable or your AI quota has been reached. Please try again or check your plan.')
          },
        )
        if (outcome.source !== 'ai') throw new Error(outcome.notice ?? 'AI matching could not be completed.')
        semantic = outcome.value
        await putCached(admin, projectId, 'matching', hash, { algorithm_version: MATCH_ALGORITHM_VERSION, semantic })
      }

      final = rankEligible(list, project, roles, semantic, exclude)
    }

    // Replace previous results for this project.
    const { error: deleteError } = await admin.from('match_scores').delete().eq('project_id', projectId)
    if (deleteError) throw new Error(deleteError.message)

    if (final.length > 0) {
      const rows = final.map((m) => ({
        project_id: projectId,
        student_id: m.student_id,
        score_percent: m.score_percent,
        skill_overlap: m.skill_overlap,
        notes: m.notes,
        details: m.details,
      }))
      let { error: insertError } = await admin.from('match_scores').insert(rows)
      if (insertError && /details/i.test(insertError.message)) {
        // The optional `details` column has not been added yet: still save the core result.
        console.warn('match_scores.details is missing; apply the 20261121 migration to show full breakdowns.')
        ;({ error: insertError } = await admin.from('match_scores').insert(rows.map(({ details: _details, ...rest }) => rest)))
      }
      if (insertError) throw new Error(insertError.message)
    }

    return json({
      matches: final,
      source: 'ai',
      notice: final.length === 0 ? NO_MATCH_NOTICE : null,
      code: null,
    })
  } catch (err) {
    return errorResponse(err)
  }
})
