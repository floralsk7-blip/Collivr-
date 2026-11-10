// Verification suite for COLLIVRA enhancements:
// - Alternative Team Comparison (Phase 2)
// - Mentor Recommendations Alongside Team Comparison (Phase 3)
// - Organiser Analytics Access without Student Premium (Phase 4)
// - Preservation of Student Premium monthly/yearly & Event Passes (Phases 5 & 6)
// - Student and Organiser Profile Separation (Phase 7)
// Run with: node --experimental-strip-types scripts/test-enhancements.mjs

import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { generateAlternativeTeams, scoreTeam, WEIGHTS } from '../supabase/functions/_shared/teamOptimizer.ts'
import { PLAN_DEFS, LIMITS } from '../supabase/functions/_shared/plans.ts'
import { TIERS as EVENT_PASS_TIERS, quotePrice } from '../supabase/functions/_shared/pricing.ts'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

console.log('Testing COLLIVRA enhancements...')

// ---------------------------------------------------------------------------
// 1. Alternative Team Comparison & Diversity (Phase 2)
// ---------------------------------------------------------------------------
const SKILLS = ['React', 'Python', 'Node', 'UI/UX', 'Machine Learning', 'SQL']
function generateMockCandidates(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `student_${i + 1}`,
    name: `Candidate ${i + 1}`,
    skills: [SKILLS[i % SKILLS.length], SKILLS[(i + 2) % SKILLS.length]],
    skills_detailed: [
      { name: SKILLS[i % SKILLS.length], level: i % 2 === 0 ? 'advanced' : 'intermediate' },
      { name: SKILLS[(i + 2) % SKILLS.length], level: 'intermediate' },
    ],
    experience: i % 3 === 0 ? 'Advanced' : i % 3 === 1 ? 'Intermediate' : 'Beginner',
    project_interests: [i % 2 === 0 ? 'AI/ML' : 'Web Dev'],
    availability_hours: `${8 + (i % 4) * 2} hrs/week`,
    branch: i % 2 === 0 ? 'Computer Science' : 'Information Technology',
  }))
}

const projectSpec = {
  domain: 'AI/ML',
  skillsFocus: ['React', 'Python', 'Machine Learning'],
  teamSize: 3,
}

// Test with 8 candidates -> should yield 3 diverse teams
const candidates8 = generateMockCandidates(8)
const alts3 = generateAlternativeTeams(candidates8, projectSpec, { maxAlternatives: 3 })
assert.equal(alts3.length, 3, 'Must generate exactly 3 alternative teams when candidate pool permits')

// Uniqueness: every alternative must have a distinct set of member IDs
const comboSets = alts3.map((alt) => [...alt.memberIds].sort().join(','))
assert.equal(new Set(comboSets).size, 3, 'Each alternative must have a unique combination of students')

// Real scoring: scores must be numbers between 0 and 100, not hardcoded strings
for (const alt of alts3) {
  assert.ok(typeof alt.score === 'number' && alt.score >= 0 && alt.score <= 100, 'Score must be a real calculated number 0-100')
  assert.equal(alt.memberIds.length, 3, 'Each alternative must have exactly target team size')
  assert.ok(alt.badge && typeof alt.badge === 'string', 'Each alternative must have a dynamically assigned badge')
  assert.ok(alt.reasoning.length > 20, 'Reasoning must provide actionable explanation')
  assert.ok(alt.coachingNotes.length > 10, 'Must include practical coaching notes')
  assert.ok(Array.isArray(alt.missingSkills), 'Must report missing skills array')
  assert.ok(Array.isArray(alt.redundantSkills), 'Must report redundant skills array')
  for (const mid of alt.memberIds) {
    assert.ok(alt.roles[mid], `Every member ${mid} must have an assigned role`)
  }
}

// Edge case: candidates < teamSize -> return empty (no fake candidates)
const candidatesUnder = generateMockCandidates(2)
const altsUnder = generateAlternativeTeams(candidatesUnder, projectSpec)
assert.equal(altsUnder.length, 0, 'Cannot generate teams when candidate pool is smaller than team size')

// Edge case: candidates == teamSize -> return exactly 1 alternative
const candidatesExact = generateMockCandidates(3)
const altsExact = generateAlternativeTeams(candidatesExact, projectSpec)
assert.equal(altsExact.length, 1, 'When candidate count equals team size, exactly 1 alternative is generated')
assert.equal(altsExact[0].memberIds.length, 3)

console.log('✓ Alternative team comparison & diversity verified')

// ---------------------------------------------------------------------------
// 2. Organiser Analytics & Entitlements (Phase 4)
// ---------------------------------------------------------------------------
const analyticsFn = read('../supabase/functions/analytics-summary/index.ts')
assert.ok(analyticsFn.includes("profile?.account_type === 'organiser'"), 'Analytics function must check for organiser account type')
assert.ok(analyticsFn.includes("accountType: 'organiser'"), 'Organiser response must identify accountType as organiser')
assert.ok(analyticsFn.includes(".eq('organizer_id', user.id)"), 'Organiser event analytics must be strictly scoped to own events')
assert.ok(analyticsFn.includes("totalRegistrations"), 'Must compute real registration totals')

const analyticsPage = read('../src/pages/Analytics.jsx')
assert.ok(analyticsPage.includes("data?.accountType === 'organiser' || isOrganiser"), 'Analytics page must support Event Organiser view')
assert.ok(analyticsPage.includes("Total Registrations"), 'Analytics UI must display total registrations')

const appRoutes = read('../src/App.jsx')
assert.ok(appRoutes.includes('path="/analytics" element={<Protected><Analytics />'), 'Analytics route must be accessible without StudentOnly restriction')

const sidebar = read('../src/components/Sidebar.jsx')
assert.ok(sidebar.includes("path: '/analytics', label: 'Analytics'"), 'Sidebar must include Analytics link in organiser navigation')

console.log('✓ Organiser analytics access & role-aware entitlement verified')

// ---------------------------------------------------------------------------
// 3. Preservation of Student Premium Subscriptions (Phase 5)
// ---------------------------------------------------------------------------
assert.ok(PLAN_DEFS.premium_monthly, 'premium_monthly plan must exist')
assert.equal(PLAN_DEFS.premium_monthly.price, '2.99', 'Student Premium monthly price must remain 2.99')
assert.equal(PLAN_DEFS.premium_monthly.tier, 'premium', 'Monthly plan tier must be premium')

assert.ok(PLAN_DEFS.premium_yearly, 'premium_yearly plan must exist')
assert.equal(PLAN_DEFS.premium_yearly.price, '24.99', 'Student Premium yearly price must remain 24.99')
assert.equal(PLAN_DEFS.premium_yearly.tier, 'premium', 'Yearly plan tier must be premium')

assert.equal(LIMITS.free.aiActionsPerMonth, 15, 'Free student limit must be 15')
assert.equal(LIMITS.premium.aiActionsPerMonth, 150, 'Student Premium limit must be 150')
assert.equal(LIMITS.free.teamInsights, false, 'Free student must not have team insights')
assert.equal(LIMITS.premium.teamInsights, true, 'Student Premium must have team insights')

console.log('✓ Student Premium monthly/yearly plans and entitlements strictly preserved')

// ---------------------------------------------------------------------------
// 4. Preservation of Event Passes (Phase 6)
// ---------------------------------------------------------------------------
assert.equal(quotePrice('standard').price, '9.00', 'Standard Event Pass must be $9.00')
assert.equal(quotePrice('advanced').price, '19.00', 'Advanced Event Pass must be $19.00')
assert.equal(quotePrice('complex').price, '39.00', 'Complex Event Pass must be $39.00')

console.log('✓ Event Pass system strictly preserved')

// ---------------------------------------------------------------------------
// 5. Student and Organiser Profile Separation (Phase 7)
// ---------------------------------------------------------------------------
const profilePage = read('../src/pages/Profile.jsx')
assert.ok(profilePage.includes("data.account_type && data.account_type !== 'student'"), 'Profile page must check if requested profile is an organiser')
assert.ok(profilePage.includes('Profile Unavailable'), 'Profile page must deny student access to organiser profiles')

const findPeoplePage = read('../src/pages/FindPeople.jsx')
assert.ok(findPeoplePage.includes(".neq('account_type', 'organiser')"), 'FindPeople must exclude organisers from student search')

const dashboardPage = read('../src/pages/Dashboard.jsx')
assert.ok(dashboardPage.includes(".neq('account_type', 'organiser')"), 'Dashboard must exclude organisers from student recommendations')

assert.ok(existsSync(new URL('../supabase/migrations/20261124000000_separate_student_organiser_profiles.sql', import.meta.url)), 'Separation migration must exist')
const sepMigration = read('../supabase/migrations/20261124000000_separate_student_organiser_profiles.sql')
assert.ok(sepMigration.includes("COALESCE(account_type, 'student') = 'student'"), 'Migration must enforce profile separation via RLS')

console.log('✓ Student and Event Organiser profile separation verified')

// ---------------------------------------------------------------------------
// 6. Mentor Recommendations Alongside Team Comparison (Phase 3)
// ---------------------------------------------------------------------------
const teamRecPage = read('../src/pages/TeamRecommendation.jsx')
assert.ok(teamRecPage.includes('discoverMentorsForProject'), 'TeamRecommendation must discover real project mentors')
assert.ok(teamRecPage.includes('MentorBookingModal'), 'TeamRecommendation must include MentorBookingModal')
assert.ok(teamRecPage.includes('college_professor') && teamRecPage.includes('industry_expert'), 'Must support professor and industry expert mentor categories')

console.log('✓ Mentor recommendations alongside team comparison verified')

console.log('\nAll COLLIVRA enhancement tests passed successfully!')
