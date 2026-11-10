// Plain-Node checks for matching, team picking, risk and fallback analysis. Run: npm run test:insights
import assert from 'node:assert/strict'
import { rankStudents, scoreStudentForProject, pickBestTeam, simulateTeam, assessRisk, fallbackAnalysis } from '../supabase/functions/_shared/teamInsights.ts'

const s = (id, name, skills, experience = 'Intermediate', extra = {}) => ({
  id, name, skills,
  skills_detailed: skills.map((n) => ({ name: n, level: experience })),
  experience, project_interests: ['AI/ML'], availability_hours: '10', branch: 'CSE', ...extra,
})
const project = { name: 'Smart Waste', domain: 'AI/ML', skills_required: ['Python', 'React', 'UI/UX', 'Node'], experience_required: 'Intermediate', team_size: 3 }
const pool = [
  s('a', 'Asha', ['Python', 'ML'], 'Advanced'),
  s('b', 'Bala', ['React', 'Node'], 'Intermediate', { branch: 'IT' }),
  s('c', 'Chitra', ['UI/UX', 'Figma'], 'Beginner', { branch: 'Design' }),
  s('d', 'Dev', ['Python'], 'Beginner'),
  s('e', 'Esha', ['Excel'], 'Beginner', { project_interests: ['Finance'], availability_hours: '2' }),
]

// 1. Matching is deterministic, explained, and ranks the best fit first
const r1 = rankStudents(pool, project)
assert.deepEqual(r1, rankStudents(pool, project))
assert.equal(r1.at(-1).student_id, 'e')
assert.ok(r1[0].score_percent > r1.at(-1).score_percent)
for (const m of r1) {
  assert.ok(m.score_percent >= 0 && m.score_percent <= 100)
  assert.ok(m.notes.length > 10)
}
const a = scoreStudentForProject(pool[0], project)
assert.deepEqual(a.skill_overlap, ['Python'])
assert.match(a.notes, /Covers 1 of 4/)
assert.match(a.notes, /Missing: React, UI\/UX, Node/)

// 2. A student with no skills still scores without crashing
assert.equal(scoreStudentForProject({ id: 'z', name: 'Zed' }, project).skill_overlap.length, 0)
assert.equal(scoreStudentForProject(pool[0], {}).score_percent >= 0, true)

// 3. Best team covers all required skills when the pool allows it
const pick = pickBestTeam(pool, project, 3)
assert.equal(pick.memberIds.length, 3)
assert.deepEqual(pick.missingSkills, [])
assert.ok(pick.score > 60)
assert.match(pick.reasoning, /Covers 4 of 4/)
assert.ok(pick.coaching.length > 20)
assert.deepEqual(pick, pickBestTeam(pool, project, 3)) // deterministic
assert.equal(pickBestTeam(pool, project, 99).memberIds.length, pool.length) // size capped to pool

// 4. What-if: a weaker team scores lower than the best team
const weak = simulateTeam([pool[3], pool[4]], project)
const strong = simulateTeam([pool[0], pool[1], pool[2]], project)
assert.ok(strong.team_score > weak.team_score)

// 5. Risk report has the shape the UI reads, and reacts to real gaps
const risk = assessRisk(project, [pool[3], pool[4]])
for (const k of ['skill_coverage', 'availability_risk', 'role_dependency', 'experience_balance']) {
  assert.ok(risk[k].status && risk[k].note, k)
}
assert.equal(risk.skill_coverage.status, 'Weak')
assert.equal(risk.experience_balance.status, 'Poor')
assert.equal(risk.availability_risk.status, 'High')
const good = assessRisk(project, [pool[0], pool[1], pool[2]])
assert.equal(good.skill_coverage.status, 'Strong')
assert.ok(good.ai_suggestion.length > 10)

// 6. Fallback analysis works without any AI
const fb = fallbackAnalysis(project, [['python'], ['react', 'node'], []])
assert.ok(fb.identified_roles.includes('Project Lead'))
assert.ok(fb.identified_roles.includes('Frontend Developer'))
assert.ok(fb.skill_gaps.includes('UI/UX'))
assert.ok(fb.sustainability_notes.length > 20)

console.log('ok - matching, team picking, risk and fallback analysis')
