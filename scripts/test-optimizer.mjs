// Plain-Node check of the team optimizer. Run: npm run test:optimizer
// Needs Node 22.18+ (runs the .ts file directly).
import assert from 'node:assert/strict'
import { formTeams, scoreTeam, WEIGHTS } from '../supabase/functions/_shared/teamOptimizer.ts'

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
console.log('worst team:', result.teams.at(-1).score, 'missing:', result.teams.at(-1).missingSkills)
