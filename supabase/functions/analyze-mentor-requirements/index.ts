import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  adminClient,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireUser,
  requireUuid,
} from '../_shared/http.ts'
import { assertProjectAccess, withAi } from '../_shared/entitlements.ts'
import { callGeminiJson } from '../_shared/gemini.ts'
import {
  analyzeMentorRequirementsRuleBased,
  buildMentorRequirementPrompt,
  MentorRequirementAnalysis,
  MentorRequirementInput,
  validateMentorRequirementAnalysis,
} from '../_shared/mentorRequirements.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))

    const admin = adminClient()

    let projectInput: MentorRequirementInput = {}
    let projectId: string | null = null

    if (body.projectId) {
      projectId = requireUuid(body.projectId, 'project')
      const project = await assertProjectAccess(admin, user.id, projectId, true)

      // Fetch existing AI analysis if available
      const { data: existingAnalysis } = await admin
        .from('ai_analysis')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle()

      projectInput = {
        name: project.name,
        description: project.description,
        domain: project.domain,
        skills_required: project.skills_required ?? [],
        experience_required: project.experience_required,
        project_complexity: project.experience_required,
        identified_roles: existingAnalysis?.identified_roles ?? [],
        skill_gaps: existingAnalysis?.skill_gaps ?? [],
        sustainability_notes: existingAnalysis?.sustainability_notes ?? '',
      }
    } else {
      // Direct context passed from in-flight project creation
      projectInput = {
        name: body.name ? String(body.name).slice(0, 200) : '',
        description: body.description ? String(body.description).slice(0, 5000) : '',
        domain: body.domain ? String(body.domain).slice(0, 100) : '',
        skills_required: Array.isArray(body.skills_required) ? body.skills_required.slice(0, 20) : [],
        identified_roles: Array.isArray(body.identified_roles) ? body.identified_roles.slice(0, 10) : [],
        skill_gaps: Array.isArray(body.skill_gaps) ? body.skill_gaps.slice(0, 10) : [],
        experience_required: body.experience_required ? String(body.experience_required).slice(0, 50) : '',
        project_complexity: body.project_complexity ? String(body.project_complexity).slice(0, 50) : '',
        reasoning: body.reasoning ? String(body.reasoning).slice(0, 1000) : '',
      }
    }

    if ((projectInput.description || '').trim().length < 20) {
      throw new HttpError(
        400,
        'Please provide a project description with at least 20 characters before analyzing mentorship requirements.',
        'insufficient_project_description'
      )
    }

    // Run AI call with quota tracking and fallback
    const outcome = await withAi<MentorRequirementAnalysis>(
      admin,
      user.id,
      'mentor_requirement_analysis',
      async () => {
        const prompt = buildMentorRequirementPrompt(projectInput)
        const raw = await callGeminiJson<unknown>(prompt)
        const validated = validateMentorRequirementAnalysis(raw, projectInput)
        validated.analysis_source = 'AI'
        return validated
      },
      () => {
        return analyzeMentorRequirementsRuleBased(projectInput)
      }
    )

    const finalAnalysis = outcome.value
    if (outcome.source === 'rules') {
      finalAnalysis.analysis_source = 'RULE_BASED_FALLBACK'
    }

    // Persist to ai_analysis if projectId was provided
    if (projectId) {
      try {
        await admin
          .from('ai_analysis')
          .update({
            recommended_mentor_type: finalAnalysis.recommended_mentor_types.join(' & '),
            mentor_focus_areas: finalAnalysis.required_expertise,
            mentor_guidance_notes: finalAnalysis.analysis_summary,
          })
          .eq('project_id', projectId)
      } catch (err) {
        console.warn('Could not persist mentor analysis to ai_analysis table:', err)
      }
    }

    return json({
      ...finalAnalysis,
      notice: outcome.notice ?? null,
      code: outcome.code ?? null,
    })
  } catch (err) {
    return errorResponse(err)
  }
})

