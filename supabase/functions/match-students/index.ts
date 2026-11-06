
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  adminClient,
  corsHeaders,
  errorResponse,
  json,
  requireUser,
  requireUuid,
} from '../_shared/http.ts'

import { callGeminiJson } from '../_shared/gemini.ts'
import { assertProjectAccess, withAi } from '../_shared/entitlements.ts'
import type { StudentMatch } from '../_shared/teamInsights.ts'
import { STUDENT_COLUMNS } from '../_shared/students.ts'
import { hashJson } from '../_shared/aiGate.ts'
import { buildMatchPrompt, parseAiMatchResults } from '../_shared/aiPrompts.ts'
import { getCached, putCached } from '../_shared/aiCache.ts'
import type { Student } from '../_shared/teamOptimizer.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const projectId = requireUuid(body.projectId, 'project')

    const admin = adminClient()

    const project = await assertProjectAccess(
      admin,
      user.id,
      projectId,
      true,
    )

    // Fetch eligible student profiles.
    const { data: students, error } = await admin
      .from('student_profiles')
      .select(STUDENT_COLUMNS)
      .neq('id', project.creator_id)
      .neq('id', user.id)
      .limit(500)

    if (error) throw new Error(error.message)

    const list = (students ?? []) as Student[]

    if (list.length === 0) {
      return json({
        matches: [],
        source: 'ai',
        notice: 'No eligible student profiles were found.',
      })
    }

    const { data: projectAnalysis, error: analysisError } = await admin
      .from('ai_analysis')
      .select('identified_roles, skill_gaps')
      .eq('project_id', projectId)
      .maybeSingle()

    if (analysisError) throw new Error(analysisError.message)
    const identifiedRoles = projectAnalysis?.identified_roles ?? []

    // Include all candidate profile information in the cache key.
    // This prevents stale results when student profiles change.
    const hash = await hashJson({
      // Bump whenever scoring/eligibility rules change so old AI scores
      // cannot survive a prompt or policy update for otherwise unchanged data.
      matching_algorithm_version: 'core-skill-or-interest-gate-v2-60-15-10-5-5-5',
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        domain: project.domain,
        skills_required: project.skills_required ?? [],
        experience_required: project.experience_required,
        team_size: project.team_size,
        deadline: project.deadline ?? null,
        identified_roles: identifiedRoles,
      },
      candidates: list.map((student) => ({
        id: student.id,
        skills: student.skills ?? [],
        skills_detailed: student.skills_detailed ?? [],
        experience: student.experience,
        interests: student.project_interests ?? [],
        availability: student.availability_hours,
        branch: student.branch,
        department: student.department,
        previous_projects: student.previous_projects ?? [],
      })),
    })

    // Reuse successful AI results for unchanged inputs.
    const cached = await getCached(
      admin,
      projectId,
      'matching',
      hash,
    )

    let final: StudentMatch[]

    if (cached?.matches) {
      final = (cached.matches as StudentMatch[]).filter(
        (match) =>
          list.some((student) => student.id === match.student_id) &&
          match.student_id !== user.id &&
          match.student_id !== project.creator_id,
      )
    } else {
      const outcome = await withAi<StudentMatch[]>(
        admin,
        user.id,
        'matching',

        async () => {
          // Gemini evaluates the complete candidate list.
          const raw = await callGeminiJson<unknown>(
            buildMatchPrompt(
              { ...project, identified_roles: identifiedRoles },
              list.map((student) => ({ student })),
            ),
          )

          // Validate AI decisions against actual student profiles.
          return parseAiMatchResults(
  raw,
  list,
  project.skills_required ?? [],
)
        },

        // Do not return rule-based recommendations if AI fails
        // or the user's AI quota is exhausted.
        () => {
          throw new Error(
            'AI matching is unavailable or your AI quota has been reached. Please try again or check your plan.',
          )
        },
      )

      final = outcome.value.filter(
        (match) =>
          list.some((student) => student.id === match.student_id) &&
          match.student_id !== user.id &&
          match.student_id !== project.creator_id,
      )

      if (outcome.source !== 'ai') {
        throw new Error(
          outcome.notice ?? 'AI matching could not be completed.',
        )
      }

      await putCached(
        admin,
        projectId,
        'matching',
        hash,
        { matches: final },
      )
    }

    // Replace previous results for this project.
    const { error: deleteError } = await admin
      .from('match_scores')
      .delete()
      .eq('project_id', projectId)

    if (deleteError) throw new Error(deleteError.message)

    const { error: insertError } = await admin
      .from('match_scores')
      .insert(
        final.map((match) => ({
          project_id: projectId,
          student_id: match.student_id,
          score_percent: match.score_percent,
          skill_overlap: match.skill_overlap,
          notes: match.notes,
        })),
      )

    if (insertError) throw new Error(insertError.message)

    return json({
      matches: final,
      source: 'ai',
      notice: null,
      code: null,
    })
  } catch (err) {
    return errorResponse(err)
  }
})
