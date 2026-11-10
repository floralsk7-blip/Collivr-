import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  calculateMentorScore,
  filterEligibleMentors,
  rankMentorsForProject,
  generateDeterministicExplanation,
} from '../src/lib/mentorMatchingEngine.js'
import { discoverMentorsForProject } from '../src/lib/mentorMatchingService.js'

console.log('Testing Collivra Smart Mentor Matching: Sub-phase 5 (AI Mentor Matching & Ranking)...')

// 1. Migration & Schema Check
const migrationPath = new URL('../supabase/migrations/20261115000000_mentor_ratings_and_discovery.sql', import.meta.url)
assert.ok(existsSync(migrationPath), 'Migration 20261115000000 must exist')
const migrationSql = readFileSync(migrationPath, 'utf8')
assert.ok(migrationSql.includes('average_rating numeric(3,2)'), 'Migration must include average_rating column')
assert.ok(migrationSql.includes('review_count int'), 'Migration must include review_count column')
assert.ok(migrationSql.includes('hourly_rate_usd numeric(8,2)'), 'Migration must include hourly_rate_usd column')
assert.ok(migrationSql.includes('idx_mentor_profiles_discovery'), 'Migration must create discovery index')
console.log('  ok - 1. Migration and schema synchronized for ratings, discovery and pricing')

// 2. Eligibility Filtering Tests
const mockMentors = [
  {
    id: 'm1',
    user_id: 'user-1',
    full_name: 'Dr. Academic',
    primary_category: 'college_professor',
    categories: ['college_professor'],
    is_active: true,
    verification_status: 'verified',
  },
  {
    id: 'm2',
    user_id: 'user-2',
    full_name: 'Alex Industry',
    primary_category: 'industry_expert',
    categories: ['industry_expert'],
    is_active: true,
    verification_status: 'verified',
  },
  {
    id: 'm3',
    user_id: 'user-creator',
    full_name: 'Self Mentor',
    primary_category: 'industry_expert',
    categories: ['industry_expert'],
    is_active: true,
    verification_status: 'verified',
  },
  {
    id: 'm4',
    user_id: 'user-4',
    full_name: 'Inactive Mentor',
    primary_category: 'college_professor',
    categories: ['college_professor'],
    is_active: false,
    verification_status: 'verified',
  },
  {
    id: 'm5',
    user_id: 'user-5',
    full_name: 'Suspended Mentor',
    primary_category: 'industry_expert',
    categories: ['industry_expert'],
    is_active: true,
    verification_status: 'suspended',
  },
]

// 2a. Prevents mentoring yourself
const filteredNoSelf = filterEligibleMentors(mockMentors, { currentUserId: 'user-creator' })
assert.equal(filteredNoSelf.some((m) => m.id === 'm3'), false, 'Cannot mentor your own project')

// 2b. Excludes inactive and suspended mentors
assert.equal(filteredNoSelf.some((m) => m.id === 'm4'), false, 'Inactive mentors must be excluded')
assert.equal(filteredNoSelf.some((m) => m.id === 'm5'), false, 'Suspended mentors must be excluded')

// 2c. Category filter
const profOnly = filterEligibleMentors(mockMentors, { requestedCategory: 'college_professor' })
assert.equal(profOnly.every((m) => m.categories.includes('college_professor')), true, 'Category filter must strictly isolate professors')
console.log('  ok - 2. Eligibility filtering enforces self-mentoring prevention, active status, and category constraints')

// 3. Exact Mathematical Formula & Weight Breakdown Test
const sampleProject = {
  name: 'Autonomous Drone Vision',
  domain: 'AI/ML',
  skills_required: ['Python', 'PyTorch', 'Computer Vision'],
  experience_required: 'Advanced',
  project_complexity: 'Advanced',
}

const sampleMentor = {
  id: 'mentor-test',
  full_name: 'Dr. Test Faculty',
  years_of_experience: 10,
  primary_category: 'college_professor',
  categories: ['college_professor'],
  verification_status: 'verified',
  expertise: {
    technical_skills: ['Python', 'PyTorch', 'Computer Vision', 'C++'],
    domain_expertise: ['AI/ML', 'Robotics'],
    mentorship_topics: ['Algorithm Design'],
  },
  portfolio: [
    { title: 'DroneCV', technologies: ['PyTorch', 'Python', 'CUDA'] },
    { title: 'ObjectDetector', technologies: ['Computer Vision', 'PyTorch'] },
  ],
  availability: {
    is_available: true,
    max_active_mentees: 4,
    current_active_mentees: 1,
    weekly_hours: 10,
  },
  average_rating: 4.8,
  review_count: 5,
  hourly_rate_usd: 50,
}

const scoreResult = calculateMentorScore(sampleProject, sampleMentor, { student_budget: 60 })
const b = scoreResult.score_breakdown

// Verify 6 individual factors exist
assert.ok(b.expertise >= 0 && b.expertise <= 100, 'Expertise score must be between 0 and 100')
assert.ok(b.experience >= 0 && b.experience <= 100, 'Experience score must be between 0 and 100')
assert.ok(b.background >= 0 && b.background <= 100, 'Background score must be between 0 and 100')
assert.ok(b.availability >= 0 && b.availability <= 100, 'Availability score must be between 0 and 100')
assert.ok(b.rating >= 0 && b.rating <= 100, 'Rating score must be between 0 and 100')
assert.ok(b.budget >= 0 && b.budget <= 100, 'Budget score must be between 0 and 100')

// Verify exact formula: (Expertise * 0.35) + (Experience * 0.25) + (Background * 0.15) + (Availability * 0.10) + (Rating * 0.10) + (Budget * 0.05)
const expectedCalculated = Math.round(
  b.expertise * 0.35 +
  b.experience * 0.25 +
  b.background * 0.15 +
  b.availability * 0.10 +
  b.rating * 0.10 +
  b.budget * 0.05
)
assert.equal(scoreResult.final_score, expectedCalculated, 'Final score must strictly equal weighted formula')
console.log('  ok - 3. Multi-factor scoring strictly adheres to the 35/25/15/10/10/5 weighting formula')

// 4. Missing Information & Neutral Baseline Handling Test
const sparseMentor = {
  id: 'mentor-sparse',
  full_name: 'New Mentor Without Reviews',
  years_of_experience: 2,
  primary_category: 'industry_expert',
  categories: ['industry_expert'],
  verification_status: 'unverified',
  expertise: { technical_skills: [] },
  portfolio: [], // missing portfolio
  availability: null, // missing availability
  average_rating: null, // missing rating
  review_count: 0,
  hourly_rate_usd: null,
}

const sparseScore = calculateMentorScore(sampleProject, sparseMentor, {})
assert.equal(sparseScore.score_breakdown.experience, 50, 'Missing portfolio must yield neutral 50 score')
assert.equal(sparseScore.score_breakdown.availability, 50, 'Missing availability must yield neutral 50 score')
assert.equal(sparseScore.availability_info.is_known, false, 'Availability is_known must be false')
assert.equal(sparseScore.score_breakdown.rating, 60, 'Missing reviews must yield fair neutral baseline 60 (not penalized to zero)')
assert.equal(sparseScore.score_breakdown.budget, 70, 'Unspecified budget must yield neutral 70 score')
console.log('  ok - 4. Missing optional information handled with fair, neutral confidence baselines without crashing')

// 5. College Professor Prioritization for Academic Projects
const academicProject = {
  name: 'Quantum Convergence Proofs & Research',
  domain: 'AI/ML',
  skills_required: ['Python', 'Machine Learning', 'Data Structures', 'Algorithms'],
  experience_required: 'Advanced',
  project_complexity: 'Advanced',
  mentor_preference: 'college_professor',
}

const facultyCandidate = {
  id: 'faculty-1',
  full_name: 'Dr. Marcus Vance',
  primary_category: 'college_professor',
  categories: ['college_professor'],
  years_of_experience: 14,
  verification_status: 'verified',
  institution_name: 'MIT',
  academic_designation: 'Department Chair',
  expertise: {
    technical_skills: ['Python', 'Machine Learning', 'Algorithms'],
    domain_expertise: ['AI/ML', 'Theoretical Computer Science'],
  },
  portfolio: [{ title: 'GraphConv Research' }],
  availability: { is_available: true, max_active_mentees: 4, current_active_mentees: 1 },
}

const industryCandidate = {
  id: 'industry-1',
  full_name: 'Elena Rostova',
  primary_category: 'industry_expert',
  categories: ['industry_expert'],
  years_of_experience: 11,
  verification_status: 'verified',
  company_name: 'CloudScale',
  company_role: 'Staff Architect',
  expertise: {
    technical_skills: ['Node.js', 'React', 'Docker', 'AWS'],
    domain_expertise: ['FinTech', 'Cloud Infrastructure'],
  },
  portfolio: [{ title: 'Payment Engine' }],
  availability: { is_available: true, max_active_mentees: 3, current_active_mentees: 1 },
}

const rankingForAcademic = rankMentorsForProject(academicProject, [facultyCandidate, industryCandidate], {
  categoryFilter: 'college_professor',
})
assert.equal(rankingForAcademic.all_matches.length, 1, 'Only professor matches when professor category requested')
assert.equal(rankingForAcademic.all_matches[0].mentor_id, 'faculty-1', 'Dr. Marcus Vance must be ranked top')
console.log('  ok - 5. Academic project prioritization isolates and ranks College Professor top')

// 6. Industry Expert Prioritization for Production Projects
const productionProject = {
  name: 'High-Concurrency Cloud Microservices',
  domain: 'FinTech',
  skills_required: ['Node.js', 'React', 'Docker', 'AWS'],
  experience_required: 'Advanced',
  project_complexity: 'Advanced',
  mentor_preference: 'industry_expert',
}

const rankingForProduction = rankMentorsForProject(productionProject, [facultyCandidate, industryCandidate], {
  categoryFilter: 'industry_expert',
})
assert.equal(rankingForProduction.all_matches.length, 1, 'Only industry expert matches when industry requested')
assert.equal(rankingForProduction.all_matches[0].mentor_id, 'industry-1', 'Elena Rostova must be ranked top')
console.log('  ok - 6. Production project prioritization isolates and ranks Industry Expert top')

// 7. Dual Category Separation for Projects Needing Both
const hybridProject = {
  name: 'Clinical AI Platform with Cloud Microservices',
  domain: 'HealthTech',
  skills_required: ['Python', 'Machine Learning', 'Docker', 'AWS'],
  mentor_preference: 'both',
}

const rankingForBoth = rankMentorsForProject(hybridProject, [facultyCandidate, industryCandidate], {})
assert.equal(rankingForBoth.college_professors.length, 1, 'Separates 1 College Professor')
assert.equal(rankingForBoth.industry_experts.length, 1, 'Separates 1 Industry Expert')
assert.equal(rankingForBoth.all_matches.length, 2, 'Consolidates 2 unique matches')
// Verify no duplicates
const uniqueIds = new Set(rankingForBoth.all_matches.map((m) => m.mentor_id))
assert.equal(uniqueIds.size, 2, 'Never returns duplicate mentors')
console.log('  ok - 7. Dual recommendations separate College Professors and Industry Experts without duplication')

// 8. Explainable Natural Language Match Explanations Test
const explanation = generateDeterministicExplanation(sampleProject, sampleMentor, scoreResult)
assert.ok(explanation.match_summary.includes('%'), 'Explanation must include match percentage')
assert.ok(explanation.why_matched.length > 20, 'Explanation must include detailed why_matched')
assert.ok(explanation.how_mentor_helps.length > 20, 'Explanation must include tangible how_mentor_helps')
assert.ok(Array.isArray(explanation.supported_requirements), 'Must list supported requirements')
console.log('  ok - 8. Explainable natural language match explanations generated with clear rationale')

// 9. Verified Mentors Receive Trust Priority
const unverifiedCandidate = {
  ...facultyCandidate,
  id: 'faculty-unverified',
  verification_status: 'unverified',
}
const verifiedScore = calculateMentorScore(sampleProject, facultyCandidate, {})
const unverifiedScore = calculateMentorScore(sampleProject, unverifiedCandidate, {})
assert.ok(verifiedScore.score_breakdown.background > unverifiedScore.score_breakdown.background, 'Verified mentor must score higher in background trust than unverified')
console.log('  ok - 9. Verification status correctly reflected in trust score without fabricating credentials')

// 10. End-to-End Discovery Integration with Mock Database
const discovery = await discoverMentorsForProject('dev-project-001')
assert.ok(discovery.all_matches.length > 0, 'Must discover mentors from mock database')
assert.ok(discovery.all_matches[0].final_score > 0, 'Top mentor must have calculated score')
assert.ok(discovery.all_matches[0].explanation, 'Top mentor must include explanation')
console.log('  ok - 10. End-to-end discoverMentorsForProject successfully loads and ranks mentors from database')

// 11. ProjectDetail.jsx Integration Check
const projectDetailPath = new URL('../src/pages/ProjectDetail.jsx', import.meta.url)
const projectDetailCode = readFileSync(projectDetailPath, 'utf8')
assert.ok(projectDetailCode.includes('discoverMentorsForProject'), 'ProjectDetail.jsx must import discoverMentorsForProject')
assert.ok(projectDetailCode.includes('AI-Matched Mentors'), 'ProjectDetail.jsx must render AI-Matched Mentors section')
assert.ok(projectDetailCode.includes('College Professors'), 'ProjectDetail.jsx must support category filtering')
console.log('  ok - 11. ProjectDetail.jsx integrates AI-matched mentors display and category filtering')

console.log('\nAll 11 Sub-phase 5 tests passed successfully!')

