// Plain-Node check of the team optimizer. Run: npm run test:optimizer
// Needs Node 22.18+ (runs the .ts file directly).
import assert from 'node:assert/strict'
import { formTeams, scoreTeam, generateAlternativeTeams, WEIGHTS } from '../supabase/functions/_shared/teamOptimizer.ts'

const BRANCHES = ['CSE', 'ECE', 'IT', 'Mechanical']
const SKILL_POOL = ['React', 'Node', 'Python', 'ML', 'UI/UX', 'Research', 'MongoDB', 'Figma']
const LEVELS = ['Beginner', 'Intermediate', 'Advanced']

function makeStudents(n) {
  return Array.from({ length: n }, (_, i) => {
    const skills = [SKILL_POOL[i % 8], SKILL_POOL[(i * 3 + 1) % 8]]
    return {
      id: `s${i}`,
      name: `Student ${i}`,
      skills,
      skills_detailed: skills.map((name, k) => ({ name, level: LEVELS[(i + k) % 3] })),
      experience: LEVELS[i % 3],
      project_interests: i % 2 ? ['AI/ML'] : ['Web Dev'],
      availability_hours: `${8 + (i % 5) * 2}-${12 + (i % 5) * 2} hrs/week`,
      branch: BRANCHES[i % 4],
    }
  })
}

const spec = { domain: 'AI/ML', skillsFocus: ['React', 'Python', 'ML', 'UI/UX'], teamSize: 4 }
const students = makeStudents(24)

// 1. Weights add up to 100
assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100)

// 2. Everyone placed exactly once, sizes balanced
const result = formTeams(students, spec)
const placed = result.teams.flatMap((t) => t.memberIds)
assert.equal(placed.length, students.length)
assert.equal(new Set(placed).size, students.length)
assert.equal(result.teams.length, 6)
for (const t of result.teams) assert.ok(t.memberIds.length >= 3 && t.memberIds.length <= 4)

// 3. Deterministic
const again = formTeams(students, spec)
assert.deepEqual(result, again)

// 4. Optimizer beats the plain snake-draft start (0 iterations)
const baseline = formTeams(students, spec, { iterations: 0 })
assert.ok(result.overallScore >= baseline.overallScore, 'optimizer should never be worse than the start')

// 5. Scores stay in range, every member has a role
for (const t of result.teams) {
  assert.ok(t.score >= 0 && t.score <= 100)
  for (const id of t.memberIds) assert.ok(t.roles[id])
}

// 6. Edge cases
assert.equal(formTeams(makeStudents(2), spec).teams.length, 1)
assert.equal(formTeams(makeStudents(5), { skillsFocus: [], teamSize: 3 }).teams.length, 2)

console.log(`ok - ${students.length} students -> ${result.teams.length} teams`)
console.log(`start ${baseline.overallScore} -> optimized ${result.overallScore}`)
console.log('best team:', result.teams[0].score, result.teams[0].breakdown, 'missing:', result.teams[0].missingSkills)
// 7. Alternative team generation for student projects
const candidatePool = makeStudents(10)
const alternatives = generateAlternativeTeams(candidatePool, spec)
assert.ok(alternatives.length >= 2 && alternatives.length <= 3, 'should generate 2-3 alternatives from 10 candidates')

// Uniqueness: no two alternatives should have identical members
const comboKeys = new Set(alternatives.map((t) => [...t.memberIds].sort().join('|')))
assert.equal(comboKeys.size, alternatives.length, 'all alternatives must have distinct member combinations')

// Valid real calculated scores, breakdown, roles and badges
for (const alt of alternatives) {
  assert.ok(alt.score >= 0 && alt.score <= 100, 'score must be between 0 and 100')
  assert.equal(alt.memberIds.length, spec.teamSize, 'team size must match spec')
  assert.ok(alt.badge && typeof alt.badge === 'string', 'must have dynamic badge')
  assert.ok(alt.reasoning.length > 20, 'must have explanation')
  assert.ok(alt.coachingNotes.length > 10, 'must have coaching notes')
  for (const mid of alt.memberIds) {
    assert.ok(alt.roles[mid], `member ${mid} must have assigned role`)
  }
}

// Regression: three eligible candidates with team size two must yield all three pairs.
const threeCandidates = [
  { id: 'sheetal', name: 'Sheetal', skills: ['Python'], skills_detailed: [], experience: 'intermediate', project_interests: ['AI/ML'], availability_hours: '4-5 hrs/week', branch: 'CSE' },
  { id: 'chenam', name: 'Chenam', skills: ['Python', 'ML'], skills_detailed: [], experience: 'advanced', project_interests: ['AI/ML'], availability_hours: '6-7 hrs/week', branch: 'IT' },
  { id: 'aarav', name: 'Aarav', skills: ['React', 'JavaScript'], skills_detailed: [], experience: 'intermediate', project_interests: ['Web Dev'], availability_hours: '7-8 hrs/week', branch: 'ECE' },
]
const threePairs = generateAlternativeTeams(threeCandidates, { domain: 'AI/ML', skillsFocus: ['Python', 'ML', 'React'], teamSize: 2 })
assert.equal(threePairs.length, 3, '3 eligible candidates and team size 2 must produce all 3 unique pairs')
assert.equal(new Set(threePairs.map((t) => [...t.memberIds].sort().join('|'))).size, 3)
assert.ok(threePairs.every((t) => t.memberIds.length === 2))

// A candidate with incomplete skill fields must not silently disappear from the pool.
const incompleteProfile = { id: 'incomplete', name: 'Incomplete profile', skills: [], skills_detailed: [], experience: 'beginner' }
const withIncomplete = generateAlternativeTeams([...threeCandidates.slice(0, 2), incompleteProfile], { domain: 'AI/ML', skillsFocus: ['Python'], teamSize: 2 })
assert.equal(withIncomplete.length, 3, 'missing skill evidence should affect scoring, not silently exclude an eligible candidate')

// Capped / insufficient candidates handling:
// When candidates < teamSize: returns 0 alternatives
assert.equal(generateAlternativeTeams(makeStudents(2), { ...spec, teamSize: 4 }).length, 0)
// When candidates == teamSize: returns exactly 1 alternative
const exactAlt = generateAlternativeTeams(makeStudents(4), { ...spec, teamSize: 4 })
assert.equal(exactAlt.length, 1)
assert.equal(exactAlt[0].memberIds.length, 4)

console.log(`ok - alternative teams: generated ${alternatives.length} unique combinations with real scores and badges`)
