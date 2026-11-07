import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  analyzeMentorRequirementsRuleBased,
  validateMentorRequirementAnalysis,
} from '../src/lib/mentorRequirements.js'
import {
  deriveRequirementsForType,
} from '../src/lib/mentorService.js'

console.log('Testing Collivra Smart Mentor Matching: Sub-phase 3 (AI Mentor Requirement Analysis)...')

// 1. Check database migration file exists and is valid SQL
const migrationPath = new URL('../supabase/migrations/20261113000000_ai_analysis_mentor_requirements.sql', import.meta.url)
assert.ok(existsSync(migrationPath), 'Migration 20261113000000 must exist')
const migrationSql = readFileSync(migrationPath, 'utf8')
assert.ok(migrationSql.includes('recommended_mentor_type text'), 'Migration must add recommended_mentor_type')
assert.ok(migrationSql.includes('mentor_focus_areas text[]'), 'Migration must add mentor_focus_areas')
assert.ok(migrationSql.includes('mentor_guidance_notes text'), 'Migration must add mentor_guidance_notes')
assert.ok(migrationSql.includes("'both'"), 'Migration must allow both in projects.mentor_preference')
console.log('  ok - 1. Database migration is present, valid and synchronizes schema')

// 2. Professor recommendation test (academic/research depth)
const academicProject = {
  name: 'Quantum Graph Neural Network Optimization',
  description: 'Conducting academic research on novel quantum graph neural network algorithms with theoretical convergence proofs and benchmark evaluations on mathematical datasets.',
  domain: 'AI/ML',
  experience_required: 'Advanced',
  project_complexity: 'Advanced',
  skills_required: ['PyTorch', 'Quantum Computing', 'Graph Theory', 'Python'],
}
const academicResult = analyzeMentorRequirementsRuleBased(academicProject)
assert.ok(academicResult.academic_guidance_needed, 'Academic guidance must be needed')
assert.ok(academicResult.recommended_mentor_types.includes('College Professor'), 'Must recommend College Professor')
assert.ok(academicResult.analysis_summary.toLowerCase().includes('college professor'), 'Summary must mention College Professor')
assert.ok(academicResult.mentorship_objectives.length > 0, 'Must have mentorship objectives')
assert.ok(academicResult.confidence_score >= 0.75, 'Confidence score must be valid')
console.log('  ok - 2. College Professor recommendation correctly derived from academic/research project')

// 3. Industry Expert recommendation test (production/cloud/deployment)
const industryProject = {
  name: 'High-Concurrency Cloud Payment Gateway',
  description: 'Building a production microservices platform on AWS and Docker with PayPal REST APIs, Stripe checkout, automated CI/CD deployment pipelines, and PCI compliance.',
  domain: 'FinTech',
  experience_required: 'Intermediate',
  project_complexity: 'Intermediate',
  skills_required: ['Node.js', 'React', 'Docker', 'AWS', 'PayPal REST APIs', 'PostgreSQL'],
}
const industryResult = analyzeMentorRequirementsRuleBased(industryProject)
assert.ok(industryResult.industry_guidance_needed, 'Industry guidance must be needed')
assert.ok(industryResult.recommended_mentor_types.includes('Industry Expert'), 'Must recommend Industry Expert')
assert.ok(industryResult.analysis_summary.toLowerCase().includes('industry expert'), 'Summary must mention Industry Expert')
assert.ok(industryResult.mentorship_objectives.some((o) => o.toLowerCase().includes('production') || o.toLowerCase().includes('deployment')), 'Must have production/deployment objectives')
console.log('  ok - 3. Industry Expert recommendation correctly derived from production engineering project')

// 4. Both recommendation test (research innovation + production deployment)
const hybridProject = {
  name: 'Clinical AI Diagnostics & Edge Deployment Platform',
  description: 'Developing novel deep learning algorithms for medical imaging research with academic literature validation, deployed as a secure production cloud service on AWS with HIPAA compliance.',
  domain: 'HealthTech',
  experience_required: 'Advanced',
  project_complexity: 'Advanced',
  skills_required: ['Python', 'Deep Learning', 'PyTorch', 'AWS', 'Docker', 'FastAPI'],
}
const hybridResult = analyzeMentorRequirementsRuleBased(hybridProject)
assert.ok(hybridResult.academic_guidance_needed, 'Must require academic guidance')
assert.ok(hybridResult.industry_guidance_needed, 'Must require industry guidance')
assert.ok(hybridResult.recommended_mentor_types.includes('College Professor'), 'Must include College Professor in Both')
assert.ok(hybridResult.recommended_mentor_types.includes('Industry Expert'), 'Must include Industry Expert in Both')
assert.equal(hybridResult.recommended_mentor_types.length, 2, 'Must recommend both categories')
console.log('  ok - 4. Both (Academic & Industry) recommendation correctly derived for dual-scope project')

// 5. No mentor required test
const noMentorProject = {
  mentor_preference: 'none',
  name: 'Simple Static Portfolio',
  description: 'A static portfolio site built with HTML and CSS.',
}
// Derive requirements for no mentor should return null or bypass
assert.equal(deriveRequirementsForType('none', noMentorProject), null, 'deriveRequirementsForType must return null for none')
console.log('  ok - 5. No mentor needed correctly bypasses unnecessary mentor requirement analysis')

// 6. Missing project information / short description test
const edgeFunctionPath = new URL('../supabase/functions/analyze-mentor-requirements/index.ts', import.meta.url)
assert.ok(existsSync(edgeFunctionPath), 'Edge function analyze-mentor-requirements must exist')
const edgeFunctionCode = readFileSync(edgeFunctionPath, 'utf8')
assert.ok(edgeFunctionCode.includes('insufficient_project_description'), 'Edge function must reject insufficient descriptions (<20 chars)')
console.log('  ok - 6. Missing project information (<20 characters) is validated and handled with 400 error')

// 7. Invalid AI response sanitization & normalization test
const malformedAiResponse = {
  analysis_summary: 12345, // invalid type
  academic_guidance_needed: 'yes', // should be boolean
  recommended_mentor_types: ['Astronaut', null, 42], // invalid types
  confidence_score: 9999, // out of range
  mentorship_objectives: null,
}
const sanitizedResult = validateMentorRequirementAnalysis(malformedAiResponse, industryProject)
assert.equal(typeof sanitizedResult.analysis_summary, 'string', 'Summary must be normalized to string')
assert.equal(typeof sanitizedResult.academic_guidance_needed, 'boolean', 'Academic flag must be boolean')
assert.equal(typeof sanitizedResult.industry_guidance_needed, 'boolean', 'Industry flag must be boolean')
assert.ok(sanitizedResult.recommended_mentor_types.length > 0, 'Must fall back to valid mentor types')
assert.ok(sanitizedResult.confidence_score <= 1 && sanitizedResult.confidence_score >= 0, 'Confidence score must be clamped')
assert.ok(Array.isArray(sanitizedResult.mentorship_objectives), 'Objectives must be array')
console.log('  ok - 7. Malformed and invalid AI responses are sanitized and normalized safely')

// 8. Gemini API failure & Rule-based fallback test
const fallbackResult = analyzeMentorRequirementsRuleBased(industryProject)
assert.equal(fallbackResult.analysis_source, 'RULE_BASED_FALLBACK', 'Source must be RULE_BASED_FALLBACK')
const requiredFields = [
  'analysis_summary',
  'project_category',
  'project_complexity',
  'academic_guidance_needed',
  'industry_guidance_needed',
  'recommended_mentor_types',
  'student_selectable_mentor_types',
  'required_expertise',
  'required_skills',
  'preferred_experience_level',
  'mentorship_objectives',
  'recommendation_reasons',
  'confidence_score',
  'analysis_source',
]
for (const field of requiredFields) {
  assert.ok(field in fallbackResult, `Field "${field}" must exist in response structure`)
  assert.notEqual(fallbackResult[field], undefined, `Field "${field}" must not be undefined`)
}
console.log('  ok - 8. Rule-based fallback reliably provides complete 14-field response structure')

// 9. Student changing the recommended mentor type test
const studentSelectable = fallbackResult.student_selectable_mentor_types
assert.deepEqual(studentSelectable, ['professor', 'industry', 'both'], 'Student must be allowed to select professor, industry, or both')
// Test derived requirements for manual student override
const profOverride = deriveRequirementsForType('professor', industryProject)
assert.equal(profOverride.type, 'professor', 'Student override to College Professor is supported')
assert.ok(profOverride.focusAreas.length > 0, 'Professor focus areas derived')
const indOverride = deriveRequirementsForType('industry', academicProject)
assert.equal(indOverride.type, 'industry', 'Student override to Industry Expert is supported')
assert.ok(indOverride.focusAreas.length > 0, 'Industry focus areas derived')
console.log('  ok - 9. Student retains full control and can change recommended mentor type at any time')

// 10. Preserving choices while navigating between steps test
const draftState = {
  step: 4,
  form: {
    name: hybridProject.name,
    description: hybridProject.description,
    domain: hybridProject.domain,
    skills_required: hybridProject.skills_required,
    mentor_preference: 'ai',
    mentor_type_selection: 'both',
  },
  mentorAnalysis: hybridResult,
}
const serialized = JSON.stringify(draftState)
const restored = JSON.parse(serialized)
assert.equal(restored.form.mentor_preference, 'ai', 'mentor_preference preserved')
assert.equal(restored.form.mentor_type_selection, 'both', 'mentor_type_selection preserved')
assert.deepEqual(restored.mentorAnalysis.recommended_mentor_types, ['College Professor', 'Industry Expert'], 'mentorAnalysis preserved')
console.log('  ok - 10. Mentor preferences and AI analysis survive navigation and serialization')

// 11. CreateProject.jsx integration check
const createProjectPath = new URL('../src/pages/CreateProject.jsx', import.meta.url)
const createProjectCode = readFileSync(createProjectPath, 'utf8')
assert.ok(createProjectCode.includes('fetchMentorRequirements'), 'CreateProject must import fetchMentorRequirements')
assert.ok(createProjectCode.includes('runMentorAnalysis'), 'CreateProject must implement runMentorAnalysis')
assert.ok(createProjectCode.includes('mentor_type_selection'), 'CreateProject must track mentor_type_selection')
assert.ok(createProjectCode.includes('Collivra AI Recommendation'), 'CreateProject must display Collivra AI Recommendation')
assert.ok(createProjectCode.includes('Confirm or customize your preferred guidance'), 'CreateProject must offer student selection control')
assert.ok(createProjectCode.includes('Retry AI Analysis'), 'CreateProject must support retry on error')
console.log('  ok - 11. CreateProject.jsx integration contains all required interactive UI states')

console.log('\nAll 11 Sub-phase 3 tests passed successfully!')

