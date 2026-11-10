/**
 * Collivra Mentor Service
 * Client layer connecting CreateProject to the backend AI mentor requirement analyzer.
 */

import { analyzeMentorRequirements } from './gemini.js'
import {
  analyzeMentorRequirementsRuleBased,
  validateMentorRequirementAnalysis,
} from './mentorRequirements.js'

/**
 * Runs the AI mentor requirement analysis service.
 * @param {Object} context - Project data and existing analysis
 * @returns {Promise<Object>} Validated mentor requirement analysis
 */
export async function fetchMentorRequirements(context = {}) {
  // If no mentor needed, do not perform unnecessary analysis
  if (context.mentor_preference === 'none') {
    return null
  }

  const payload = {
    projectId: context.projectId || context.project?.id || undefined,
    name: context.name || context.project?.name,
    description: context.description || context.project?.description,
    domain: context.domain || context.project?.domain,
    skills_required: context.skills_required || context.project?.skills_required || [],
    identified_roles: context.identified_roles || context.analysis?.identified_roles || [],
    skill_gaps: context.skill_gaps || context.analysis?.skill_gaps || [],
    experience_required: context.experience_required || context.project?.experience_required,
    project_complexity: context.project_complexity || context.analysis?.project_complexity,
    reasoning: context.reasoning || context.analysis?.reasoning,
  }

  try {
    const rawResult = await analyzeMentorRequirements(payload)
    if (rawResult) {
      return validateMentorRequirementAnalysis(rawResult, payload)
    }
  } catch (err) {
    console.warn('[Collivra Mentor Service] Backend AI invocation failed, using rule-based fallback:', err?.message || err)
  }

  // Resilient deterministic fallback
  return analyzeMentorRequirementsRuleBased(payload)
}

/**
 * Derives relevant mentorship requirement guidance when a student manually
 * selects College Professor or Industry Expert.
 * @param {'professor' | 'industry'} type
 * @param {Object} context
 * @returns {Object}
 */
export function deriveRequirementsForType(type, context = {}) {
  const base = analyzeMentorRequirementsRuleBased(context)

  if (type === 'professor') {
    return {
      type: 'professor',
      title: 'College Professor Guidance',
      focusAreas: [
        'Theoretical foundations & scientific algorithms',
        'Research methodologies & literature benchmarks',
        'Academic writing, thesis defense & patent review',
      ],
      relevantExpertise: base.required_expertise.filter((e) => !['Docker', 'AWS', 'Payment'].includes(e)),
      summary: `Academic mentorship will help formulate research methodology and validate computational rigor for ${context.name || 'this project'}.`,
    }
  }

  if (type === 'industry') {
    return {
      type: 'industry',
      title: 'Industry Expert Guidance',
      focusAreas: [
        'Production architecture & cloud infrastructure',
        'DevOps pipelines, CI/CD, and scalability standards',
        'Commercial deployment, compliance & code maintainability',
      ],
      relevantExpertise: base.required_expertise,
      summary: `Industry mentorship will accelerate production deployment, architectural scalability, and professional engineering standards for ${context.name || 'this project'}.`,
    }
  }

  return null
}
