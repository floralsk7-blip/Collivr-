/**
 * Collivra AI Mentor Matching & Ranking Engine
 * Pure ES module implementing deterministic multi-factor scoring,
 * eligibility filtering, and explainable match generation.
 */

/**
 * Normalizes text for robust keyword and skill comparison.
 * @param {string} str
 * @returns {string}
 */
export function normalizeToken(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9+#]/g, '')
}

/**
 * Calculates overlap between two string arrays based on normalized tokens.
 * @param {string[]} targetList
 * @param {string[]} candidateList
 * @returns {string[]} matched items from targetList
 */
export function findMatchingTokens(targetList = [], candidateList = []) {
  if (!Array.isArray(targetList) || !Array.isArray(candidateList)) return []
  const candidateSet = new Set(candidateList.map(normalizeToken).filter(Boolean))
  return targetList.filter((item) => candidateSet.has(normalizeToken(item)))
}

/**
 * Calculates deterministic individual factor scores (0-100) and weighted final score.
 * Weights:
 * 1. Expertise and Skill Match — 35%
 * 2. Relevant Project Experience — 25%
 * 3. Background Suitability — 15%
 * 4. Availability — 10%
 * 5. Verified Ratings and Reviews — 10%
 * 6. Budget Compatibility — 5%
 *
 * @param {Object} project - Project context and requirements
 * @param {Object} mentor - Mentor profile with expertise, portfolio, availability, qualifications
 * @param {Object} options - Optional parameters (e.g. student budget)
 * @returns {Object} Score breakdown and final score
 */
export function calculateMentorScore(project = {}, mentor = {}, options = {}) {
  // Extract project requirements
  const projectSkills = [
    ...(project.skills_required || []),
    ...(project.required_skills || []),
    ...(project.required_expertise || []),
  ].filter(Boolean)

  const projectDomain = String(project.domain || project.project_category || '').trim()
  const projectComplexity = String(project.project_complexity || project.experience_required || 'Intermediate').toLowerCase()
  const requestedCategory = project.mentor_preference || project.primary_category || 'both'

  // Extract mentor data
  const expertise = mentor.expertise || {}
  const portfolio = mentor.portfolio || []
  const qualifications = mentor.qualifications || []
  const availability = mentor.availability || null

  const mentorSkills = [
    ...(expertise.technical_skills || mentor.skills || []),
    ...(expertise.tech_stack || []),
    ...(expertise.mentorship_topics || mentor.mentor_topics || []),
  ].filter(Boolean)

  const mentorDomains = [
    ...(expertise.domain_expertise || []),
    ...(expertise.industry_specializations || []),
    ...(expertise.research_interests || []),
  ].filter(Boolean)

  // --------------------------------------------------------------------------
  // Factor 1: Expertise & Skill Match (35%)
  // --------------------------------------------------------------------------
  const matchedSkills = findMatchingTokens(projectSkills, mentorSkills)
  const matchedDomains = findMatchingTokens([projectDomain, ...(project.skill_gaps || [])], mentorDomains)

  let skillRatio = 0.5 // neutral baseline if project specifies no skills
  if (projectSkills.length > 0) {
    skillRatio = Math.min(1.0, matchedSkills.length / Math.max(1, Math.min(6, projectSkills.length)))
  }

  const domainFit = matchedDomains.length > 0 ? 1.0 : (projectDomain && mentorDomains.some((d) => normalizeToken(d).includes(normalizeToken(projectDomain)))) ? 0.75 : 0.4
  const expertiseScore = Math.round(Math.min(100, (skillRatio * 0.7 + domainFit * 0.3) * 100))

  // --------------------------------------------------------------------------
  // Factor 2: Relevant Project Experience (25%)
  // --------------------------------------------------------------------------
  let experienceScore = 50 // neutral baseline for new mentors without uploaded portfolio
  if (portfolio.length > 0) {
    const portfolioSkills = portfolio.flatMap((p) => p.technologies || [])
    const portfolioOverlap = findMatchingTokens(projectSkills, portfolioSkills)

    if (portfolioOverlap.length >= 2 || portfolio.length >= 3) {
      experienceScore = 95
    } else if (portfolioOverlap.length === 1 || portfolio.length >= 1) {
      experienceScore = 80
    } else {
      experienceScore = 65
    }
  } else if (mentor.achievements?.length > 0) {
    experienceScore = 65
  }

  // --------------------------------------------------------------------------
  // Factor 3: Background Suitability (15%)
  // --------------------------------------------------------------------------
  const yearsExp = Number(mentor.years_of_experience) || 0
  let expLevelScore = 70
  if (projectComplexity === 'advanced') {
    expLevelScore = yearsExp >= 8 ? 100 : yearsExp >= 4 ? 85 : 60
  } else if (projectComplexity === 'intermediate') {
    expLevelScore = yearsExp >= 4 ? 100 : yearsExp >= 2 ? 85 : 70
  } else {
    expLevelScore = yearsExp >= 1 ? 100 : 80
  }

  // Category fit
  const mentorCats = mentor.categories || [mentor.primary_category].filter(Boolean)
  let categoryFit = 0.7
  if (requestedCategory === 'college_professor') {
    categoryFit = mentorCats.includes('college_professor') || mentor.primary_category === 'college_professor' ? 1.0 : 0.3
  } else if (requestedCategory === 'industry_expert') {
    categoryFit = mentorCats.includes('industry_expert') || mentor.primary_category === 'industry_expert' ? 1.0 : 0.3
  } else {
    // Both or AI
    categoryFit = 1.0
  }

  // Verification trust factor
  const isVerified = mentor.verification_status === 'verified'
  const isPending = mentor.verification_status === 'pending'
  const verificationFactor = isVerified ? 1.0 : isPending ? 0.8 : 0.6

  const backgroundScore = Math.round(
    Math.min(100, (expLevelScore * 0.4 + categoryFit * 100 * 0.4 + verificationFactor * 100 * 0.2))
  )

  // --------------------------------------------------------------------------
  // Factor 4: Availability (10%)
  // --------------------------------------------------------------------------
  let availabilityScore = 50 // neutral baseline if availability unknown
  let isKnown = false
  let remainingCapacity = 0

  if (availability && typeof availability === 'object') {
    isKnown = true
    if (availability.is_available === false) {
      availabilityScore = 20 // explicit unavailable
    } else {
      const maxMentees = Number(availability.max_active_mentees) || 3
      const currentMentees = Number(availability.current_active_mentees) || 0
      remainingCapacity = Math.max(0, maxMentees - currentMentees)

      if (remainingCapacity >= 2) {
        availabilityScore = 100
      } else if (remainingCapacity === 1) {
        availabilityScore = 80
      } else {
        availabilityScore = 35 // capacity reached
      }
    }
  }

  // --------------------------------------------------------------------------
  // Factor 5: Verified Ratings and Reviews (10%)
  // --------------------------------------------------------------------------
  let ratingScore = 60 // neutral fair baseline for new mentors
  const avgRating = mentor.average_rating != null ? Number(mentor.average_rating) : null
  const reviewCount = Number(mentor.review_count) || 0

  if (avgRating !== null && reviewCount > 0) {
    // Bayesian dampening to prevent 1 single 5-star review from skewing artificially
    const priorRating = 3.8
    const priorWeight = 2
    const dampened = (avgRating * reviewCount + priorRating * priorWeight) / (reviewCount + priorWeight)
    ratingScore = Math.round(Math.min(100, Math.max(20, (dampened / 5.0) * 100)))
  }

  // --------------------------------------------------------------------------
  // Factor 6: Budget Compatibility (5%)
  // --------------------------------------------------------------------------
  let budgetScore = 70 // neutral baseline when unconstrained
  const studentBudget = options.student_budget != null ? Number(options.student_budget) : null
  const hourlyRate = mentor.hourly_rate_usd != null ? Number(mentor.hourly_rate_usd) : null

  if (studentBudget !== null && hourlyRate !== null) {
    if (hourlyRate <= studentBudget) {
      budgetScore = 100
    } else if (hourlyRate <= studentBudget * 1.25) {
      budgetScore = 65
    } else {
      budgetScore = 30
    }
  }

  // --------------------------------------------------------------------------
  // Final Weighted Match Score (Formula per specification)
  // --------------------------------------------------------------------------
  const finalScore = Math.round(
    expertiseScore * 0.35 +
    experienceScore * 0.25 +
    backgroundScore * 0.15 +
    availabilityScore * 0.10 +
    ratingScore * 0.10 +
    budgetScore * 0.05
  )

  return {
    final_score: Math.min(99, Math.max(30, finalScore)),
    score_breakdown: {
      expertise: expertiseScore,
      experience: experienceScore,
      background: backgroundScore,
      availability: availabilityScore,
      rating: ratingScore,
      budget: budgetScore,
    },
    matched_skills: matchedSkills,
    matched_domains: matchedDomains,
    availability_info: {
      is_known: isKnown,
      is_available: availability?.is_available !== false,
      weekly_hours: availability?.weekly_hours || 5,
      timezone: availability?.timezone || 'UTC',
      remaining_capacity: remainingCapacity,
    },
    rating_info: {
      has_reviews: reviewCount > 0,
      average_rating: avgRating,
      review_count: reviewCount,
    },
    pricing_info: {
      is_set: hourlyRate !== null,
      hourly_rate_usd: hourlyRate,
    },
  }
}

/**
 * Generates natural language match explanation from deterministic score breakdown.
 * @param {Object} project
 * @param {Object} mentor
 * @param {Object} scoreData
 * @returns {Object} Structured explanation fields
 */
export function generateDeterministicExplanation(project = {}, mentor = {}, scoreData = {}) {
  const mentorName = mentor.full_name || mentor.name || 'This mentor'
  const isProfessor = (mentor.categories || []).includes('college_professor') || mentor.primary_category === 'college_professor'
  const roleTitle = isProfessor
    ? `${mentor.academic_designation || 'Faculty Member'} at ${mentor.institution_name || 'their academic institution'}`
    : `${mentor.company_role || 'Industry Specialist'} at ${mentor.company_name || 'their engineering organization'}`

  const matchedSkills = scoreData.matched_skills || []
  const skillsText = matchedSkills.length > 0 ? matchedSkills.slice(0, 4).join(', ') : 'core system fundamentals'

  let whyMatched = ''
  let howHelps = ''

  if (isProfessor) {
    whyMatched = `${mentorName} brings deep academic rigor as a ${roleTitle}, with proven research expertise aligned to ${project.domain || 'this project'}.`
    howHelps = `Can guide theoretical algorithm design, literature benchmarks, research methodology, and academic publication standards for ${project.name || 'your project'}.`
  } else {
    whyMatched = `${mentorName} is an experienced industry practitioner (${roleTitle}) with direct experience in ${skillsText}.`
    howHelps = `Can provide real-world architectural reviews, CI/CD pipeline guidance, production scalability practices, and industry engineering standards.`
  }

  const supportedRequirements = []
  if (matchedSkills.length > 0) {
    supportedRequirements.push(`Direct technical coverage for ${matchedSkills.slice(0, 3).join(', ')}`)
  }
  if (scoreData.score_breakdown?.experience >= 75) {
    supportedRequirements.push('Demonstrated portfolio project experience in relevant software architectures')
  }
  if (mentor.verification_status === 'verified') {
    supportedRequirements.push('Officially authenticated credentials and institutional background')
  }

  const limitations = []
  if (!scoreData.availability_info?.is_known) {
    limitations.push('Specific weekly time slot availability has not yet been configured by mentor.')
  } else if (scoreData.availability_info?.remaining_capacity <= 1) {
    limitations.push('Mentor has limited active mentee capacity remaining this month.')
  }
  if (scoreData.score_breakdown?.rating === 60 && !scoreData.rating_info?.has_reviews) {
    limitations.push('New mentor on Collivra — ratings will appear after initial completed mentorship cycles.')
  }

  return {
    match_summary: `${scoreData.final_score}% match — ${isProfessor ? 'Academic Research & Theory' : 'Production & Cloud Architecture'} fit.`,
    why_matched: whyMatched,
    relevant_skills: matchedSkills,
    relevant_experience: `${mentor.years_of_experience || 'Multiple'} years of experience in ${roleTitle}.`,
    how_mentor_helps: howHelps,
    supported_requirements: supportedRequirements,
    potential_limitations: limitations.length > 0 ? limitations.join(' ') : null,
  }
}

/**
 * Filter mentors according to eligibility rules.
 * @param {Array} mentors
 * @param {Object} criteria
 * @returns {Array} Eligible mentors
 */
export function filterEligibleMentors(mentors = [], criteria = {}) {
  const currentUserId = criteria.currentUserId || null
  const requestedCategory = criteria.requestedCategory || criteria.mentor_preference || 'both'

  return mentors.filter((m) => {
    // 1. Prevent mentoring yourself
    if (currentUserId && (m.user_id === currentUserId || m.id === currentUserId)) {
      return false
    }

    // 2. Active status check
    if (m.is_active === false) {
      return false
    }

    // 3. Exclude suspended mentors
    if (m.verification_status === 'suspended') {
      return false
    }

    // 4. Category filter
    const categories = m.categories || [m.primary_category].filter(Boolean)
    if (requestedCategory === 'college_professor') {
      if (!categories.includes('college_professor') && m.primary_category !== 'college_professor') {
        return false
      }
    } else if (requestedCategory === 'industry_expert') {
      if (!categories.includes('industry_expert') && m.primary_category !== 'industry_expert') {
        return false
      }
    }

    return true
  })
}

/**
 * Main matching function: Scores, ranks, and structures mentor recommendations for a project.
 * Supports splitting into College Professors and Industry Experts when both are needed.
 * @param {Object} project
 * @param {Array} mentors
 * @param {Object} options
 * @returns {Object} Structured match results with separate categories and combined ranking
 */
export function rankMentorsForProject(project = {}, mentors = [], options = {}) {
  // 1. Filter eligible candidates
  const eligible = filterEligibleMentors(mentors, {
    currentUserId: options.currentUserId || project.creator_id,
    requestedCategory: options.categoryFilter || project.mentor_preference || 'both',
  })

  // 2. Compute deterministic scores
  const scored = eligible.map((m) => {
    const scoreData = calculateMentorScore(project, m, options)
    const explanation = generateDeterministicExplanation(project, m, scoreData)

    return {
      mentor_id: m.id,
      user_id: m.user_id,
      full_name: m.full_name || m.name || 'Mentor',
      photo_url: m.photo_url || null,
      headline: m.headline || (m.primary_category === 'college_professor' ? 'Professor & Academic Advisor' : 'Industry Specialist'),
      primary_category: m.primary_category || 'industry_expert',
      categories: m.categories || [m.primary_category || 'industry_expert'],
      institution_name: m.institution_name || m.college || null,
      academic_designation: m.academic_designation || null,
      company_name: m.company_name || null,
      company_role: m.company_role || null,
      years_of_experience: Number(m.years_of_experience) || 0,
      verification_status: m.verification_status || 'unverified',
      final_score: scoreData.final_score,
      score_breakdown: scoreData.score_breakdown,
      matched_skills: scoreData.matched_skills,
      matched_domains: scoreData.matched_domains,
      availability_info: scoreData.availability_info,
      rating_info: scoreData.rating_info,
      pricing_info: scoreData.pricing_info,
      packages: m.packages || [],
      explanation,
      explanation_source: 'DETERMINISTIC_TEMPLATE',
    }
  })

  // 3. Sort by final score descending, breaking ties by verified status then years of experience
  scored.sort((a, b) => {
    if (b.final_score !== a.final_score) {
      return b.final_score - a.final_score
    }
    const aVer = a.verification_status === 'verified' ? 1 : 0
    const bVer = b.verification_status === 'verified' ? 1 : 0
    if (bVer !== aVer) return bVer - aVer
    return b.years_of_experience - a.years_of_experience
  })

  // 4. Split into distinct categories
  const professors = scored.filter((m) => m.categories.includes('college_professor') || m.primary_category === 'college_professor')
  const industryExperts = scored.filter((m) => m.categories.includes('industry_expert') || m.primary_category === 'industry_expert')

  return {
    all_matches: scored,
    college_professors: professors,
    industry_experts: industryExperts,
    total_eligible: eligible.length,
    project_domain: project.domain || project.project_category,
    requested_preference: project.mentor_preference || 'both',
  }
}

