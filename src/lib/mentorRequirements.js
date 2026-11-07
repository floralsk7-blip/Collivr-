/**
 * Collivra AI Mentor Requirement Analysis Engine
 * Pure ES module for frontend and Node.js testing.
 */

const ACADEMIC_KEYWORDS = [
  'research',
  'academic',
  'thesis',
  'theory',
  'theoretical',
  'scientific',
  'algorithm',
  'computational',
  'novel',
  'dataset',
  'paper',
  'mathematical',
  'proof',
  'experiment',
  'experimentation',
  'deep learning',
  'machine learning',
  'nlp',
  'computer vision',
  'quantum',
  'biology',
  'bioinformatics',
  'genomics',
  'physics',
  'climate',
  'simulation',
  'neural network',
  'patent',
  'formal verification',
  'signal processing',
]

const INDUSTRY_KEYWORDS = [
  'production',
  'deployment',
  'deploy',
  'cloud',
  'aws',
  'azure',
  'gcp',
  'docker',
  'kubernetes',
  'ci/cd',
  'microservices',
  'devops',
  'payment',
  'stripe',
  'paypal',
  'saas',
  'scale',
  'scalability',
  'commercial',
  'startup',
  'mvp',
  'client',
  'user authentication',
  'database indexing',
  'full-stack',
  'mobile app',
  'app store',
  'concurrency',
  'system architecture',
  'monitoring',
  'api gateway',
  'e-commerce',
  'fintech',
  'compliance',
  'pci-dss',
  'hipaa',
]

/**
 * Deterministic rule-based analysis used as standalone engine and AI fallback.
 * @param {Object} input - Project information
 * @returns {Object} Complete structured mentor requirement analysis
 */
export function analyzeMentorRequirementsRuleBased(input = {}) {
  const name = String(input.name || '').trim()
  const description = String(input.description || '').trim()
  const domain = String(input.domain || 'Other').trim()
  const complexity = String(input.project_complexity || input.experience_required || 'Intermediate').trim()
  const skills = Array.isArray(input.skills_required) ? input.skills_required.map(String) : []
  const roles = Array.isArray(input.identified_roles) ? input.identified_roles.map(String) : []
  const gaps = Array.isArray(input.skill_gaps) ? input.skill_gaps.map(String) : []

  const corpus = `${name} ${description} ${domain} ${skills.join(' ')} ${roles.join(' ')} ${gaps.join(' ')}`.toLowerCase()

  // Match keyword signals
  const academicMatches = ACADEMIC_KEYWORDS.filter((kw) => corpus.includes(kw))
  const industryMatches = INDUSTRY_KEYWORDS.filter((kw) => corpus.includes(kw))

  let academicScore = academicMatches.length
  let industryScore = industryMatches.length

  // Domain weighting
  if (['AI/ML', 'Data Science', 'Sustainability', 'HealthTech'].includes(domain)) {
    academicScore += 2
  }
  if (['Web Development', 'Mobile', 'FinTech', 'Cybersecurity', 'IoT'].includes(domain)) {
    industryScore += 2
  }

  // Complexity & research signals
  if (complexity.toLowerCase() === 'advanced') {
    academicScore += 1
    industryScore += 1
  }

  // Evaluate recommendation outcome
  const isBoth = (academicScore >= 3 && industryScore >= 3) || (academicScore >= 2 && industryScore >= 2 && (academicMatches.length > 0 && industryMatches.length > 0))
  const isProfessor = !isBoth && (academicScore > industryScore)
  const isIndustry = !isBoth && !isProfessor

  const academicNeeded = isBoth || isProfessor
  const industryNeeded = isBoth || isIndustry

  /** @type {string[]} */
  const recommendedTypes = []
  if (academicNeeded) recommendedTypes.push('College Professor')
  if (industryNeeded) recommendedTypes.push('Industry Expert')

  // Derive mentorship objectives
  const objectives = []
  const reasons = []

  if (academicNeeded) {
    objectives.push('Rigorous research methodology formulation & literature benchmarks')
    objectives.push('Algorithm design validation and scientific correctness')
    reasons.push(
      academicMatches.length > 0
        ? `Project involves scientific or theoretical depth in ${academicMatches.slice(0, 3).join(', ')}.`
        : `Academic mentorship will ensure research rigor and sound theoretical modeling in ${domain}.`
    )
  }

  if (industryNeeded) {
    objectives.push('Production architecture design, deployment pipelines, and scalability')
    objectives.push('Industry standards for code quality, security posture, and maintainability')
    reasons.push(
      industryMatches.length > 0
        ? `Practical engineering considerations identified around ${industryMatches.slice(0, 3).join(', ')}.`
        : `Industry mentorship will accelerate robust software delivery and deployment best practices.`
    )
  }

  if (isBoth) {
    reasons.unshift('The project spans innovative research exploration alongside practical real-world engineering deployment.')
    objectives.push('Bridging theoretical experimentation with scalable, commercial-grade implementation')
  }

  // Derive expertise
  const expertise = [
    domain,
    ...skills.slice(0, 4),
    ...roles.slice(0, 2),
  ].filter((item, idx, arr) => item && arr.indexOf(item) === idx).slice(0, 6)

  // Calculate confidence score
  const signalCount = academicMatches.length + industryMatches.length
  const confidenceScore = Math.min(0.96, Math.max(0.78, 0.8 + signalCount * 0.03))

  const summary = isBoth
    ? `This project will benefit from both College Professor and Industry Expert guidance to bridge academic research rigor with production deployment standards.`
    : isProfessor
      ? `A College Professor is recommended to provide academic guidance, theoretical modeling, and research verification for ${name || 'this project'}.`
      : `An Industry Expert is recommended to guide production architecture, real-world deployment, and engineering best practices for ${name || 'this project'}.`

  return {
    analysis_summary: summary,
    project_category: domain,
    project_complexity: complexity,
    academic_guidance_needed: academicNeeded,
    industry_guidance_needed: industryNeeded,
    recommended_mentor_types: recommendedTypes,
    student_selectable_mentor_types: ['professor', 'industry', 'both'],
    required_expertise: expertise,
    required_skills: skills.length > 0 ? skills.slice(0, 8) : [domain, 'System Design'],
    preferred_experience_level: complexity,
    mentorship_objectives: objectives,
    recommendation_reasons: reasons,
    confidence_score: Number(confidenceScore.toFixed(2)),
    analysis_source: 'RULE_BASED_FALLBACK',
  }
}

/**
 * Validates and sanitizes AI or API mentor requirement analysis result.
 * @param {any} raw - Parsed JSON object from Gemini or API
 * @param {Object} fallbackInput - Original project info for fallback values
 * @returns {Object} Strictly validated and normalized analysis object
 */
export function validateMentorRequirementAnalysis(raw, fallbackInput = {}) {
  if (!raw || typeof raw !== 'object') {
    return analyzeMentorRequirementsRuleBased(fallbackInput)
  }

  const fallback = analyzeMentorRequirementsRuleBased(fallbackInput)

  const academicNeeded = typeof raw.academic_guidance_needed === 'boolean'
    ? raw.academic_guidance_needed
    : fallback.academic_guidance_needed

  const industryNeeded = typeof raw.industry_guidance_needed === 'boolean'
    ? raw.industry_guidance_needed
    : fallback.industry_guidance_needed

  let recommendedTypes = Array.isArray(raw.recommended_mentor_types)
    ? raw.recommended_mentor_types.filter((t) => typeof t === 'string' && (t.includes('Professor') || t.includes('Industry')))
    : []

  if (recommendedTypes.length === 0) {
    if (academicNeeded) recommendedTypes.push('College Professor')
    if (industryNeeded) recommendedTypes.push('Industry Expert')
  }
  if (recommendedTypes.length === 0) {
    recommendedTypes = fallback.recommended_mentor_types
  }

  const cleanList = (val, max = 8) => {
    if (!Array.isArray(val)) return []
    return val
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, max)
  }

  const summary = typeof raw.analysis_summary === 'string' && raw.analysis_summary.trim().length > 10
    ? raw.analysis_summary.trim()
    : fallback.analysis_summary

  const objectives = cleanList(raw.mentorship_objectives, 6)
  const reasons = cleanList(raw.recommendation_reasons, 6)
  const expertise = cleanList(raw.required_expertise, 6)
  const skills = cleanList(raw.required_skills, 8)

  let confidence = Number(raw.confidence_score)
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    confidence = fallback.confidence_score
  }

  return {
    analysis_summary: summary,
    project_category: String(raw.project_category || fallback.project_category).trim(),
    project_complexity: String(raw.project_complexity || fallback.project_complexity).trim(),
    academic_guidance_needed: academicNeeded,
    industry_guidance_needed: industryNeeded,
    recommended_mentor_types: recommendedTypes,
    student_selectable_mentor_types: ['professor', 'industry', 'both'],
    required_expertise: expertise.length > 0 ? expertise : fallback.required_expertise,
    required_skills: skills.length > 0 ? skills : fallback.required_skills,
    preferred_experience_level: String(raw.preferred_experience_level || fallback.preferred_experience_level).trim(),
    mentorship_objectives: objectives.length > 0 ? objectives : fallback.mentorship_objectives,
    recommendation_reasons: reasons.length > 0 ? reasons : fallback.recommendation_reasons,
    confidence_score: Number(confidence.toFixed(2)),
    analysis_source: raw.analysis_source === 'AI' ? 'AI' : 'RULE_BASED_FALLBACK',
  }
}

