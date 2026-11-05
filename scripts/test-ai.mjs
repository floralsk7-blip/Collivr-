// Tests for the AI gate, prompts and response validation. Run: npm run test:ai (Node 22.18+)
import assert from 'node:assert/strict'
import { gateAi, hashJson } from '../supabase/functions/_shared/aiGate.ts'
import {
  buildMatchPrompt, mergeMatchResults, buildTeamPrompt, parseExplanation,
  buildRiskPrompt, parseSuggestion, buildSimPrompt, parseReasoning, cleanText,
} from '../supabase/functions/_shared/aiPrompts.ts'
import { rankStudents, pickBestTeam, assessRisk } from '../supabase/functions/_shared/teamInsights.ts'

// ---------- gateAi: AI is core, but it must never break the screen ----------
const base = { tier: 'free', used: 0, limit: 15, premiumLimit: 150 }
const counter = () => ({ calls: 0, records: 0 });

{ // under the limit: AI runs, usage is recorded once
  const c = counter()
  const out = await gateAi({ ...base, call: async () => (c.calls++, 'AI'), fallback: () => 'RULES', record: async () => void c.records++ })
  assert.deepEqual([out.value, out.source, c.calls, c.records], ['AI', 'ai', 1, 1])
  assert.equal(out.notice, undefined)
}
{ // at the limit: AI is NOT called, rules answer, user is told to upgrade
  const c = counter()
  const out = await gateAi({ ...base, used: 15, call: async () => (c.calls++, 'AI'), fallback: () => 'RULES', record: async () => void c.records++ })
  assert.deepEqual([out.value, out.source, out.code, c.calls, c.records], ['RULES', 'rules', 'quota_reached', 0, 0])
  assert.match(out.notice, /15 free AI actions/)
  assert.match(out.notice, /Premium for 150/)
}
{ // paid plan at its limit gets a different message
  const out = await gateAi({ ...base, tier: 'premium', used: 150, limit: 150, call: async () => 'AI', fallback: () => 'RULES', record: async () => {} })
  assert.equal(out.code, 'quota_reached')
  assert.doesNotMatch(out.notice, /Upgrade/)
}
{ // AI fails (busy, bad key, rate limit): rules answer, nothing is charged
  const c = counter()
  const out = await gateAi({ ...base, call: async () => { throw new Error('429 quota') }, fallback: async () => 'RULES', record: async () => void c.records++ })
  assert.deepEqual([out.value, out.source, out.code, c.records], ['RULES', 'rules', 'ai_unavailable', 0])
}
{ // a failing usage counter must not throw away a good AI answer
  const out = await gateAi({ ...base, call: async () => 'AI', fallback: () => 'RULES', record: async () => { throw new Error('db down') } })
  assert.deepEqual([out.value, out.source], ['AI', 'ai'])
}

// ---------- hashing (cache keys) ----------
assert.equal(await hashJson({ a: 1 }), await hashJson({ a: 1 }))
assert.notEqual(await hashJson({ a: 1 }), await hashJson({ a: 2 }))
assert.match(await hashJson('x'), /^[0-9a-f]{64}$/)

// ---------- fixtures (with sensitive extras that must never reach the prompt) ----------
const s = (id, name, skills, experience = 'Intermediate') => ({
  id, name, skills, experience, skills_detailed: skills.map((n) => ({ name: n, level: experience })),
  project_interests: ['AI/ML'], availability_hours: '10', branch: 'CSE', email: `${name}@secret.example`, cgpa: 9.9, college: 'Hidden College',
})
const project = { name: 'Smart Waste', domain: 'AI/ML', skills_required: ['Python', 'React', 'UI/UX'], experience_required: 'Intermediate', team_size: 3 }
const pool = [s('a', 'Asha', ['Python', 'ML'], 'Advanced'), s('b', 'Bala', ['React', 'Node']), s('c', 'Chitra', ['UI/UX', 'Figma'], 'Beginner'), s('d', 'Dev', ['Excel'], 'Beginner')]
const ranked = rankStudents(pool, project)

// ---------- matching: merge AI judgement with the rules baseline ----------
const baseline = Object.fromEntries(ranked.map((m) => [m.student_id, m.score_percent]))
{
  const merged = mergeMatchResults(ranked, [
    { student_id: 'a', score_percent: 100, notes: 'Strong <b>Python</b> and ML for the waste model.' },
    { student_id: 'd', score_percent: 10, notes: 'Mostly Excel; little overlap.' },
  ])
  const a = merged.find((m) => m.student_id === 'a')
  assert.equal(a.score_percent, Math.round(0.5 * baseline.a + 50))   // blended, not replaced
  assert.equal(a.notes, 'Strong Python and ML for the waste model.') // HTML stripped
  assert.equal(merged.find((m) => m.student_id === 'b').notes, ranked.find((m) => m.student_id === 'b').notes) // untouched keeps rule notes
  assert.deepEqual(merged.map((m) => m.score_percent), [...merged.map((m) => m.score_percent)].sort((x, y) => y - x)) // sorted
  assert.equal(merged.length, ranked.length)
}
assert.doesNotThrow(() => mergeMatchResults(ranked, { matches: [{ student_id: 'a', score_percent: 80, notes: 'ok fit' }] }))
// junk is rejected so the caller falls back to rules
for (const bad of [null, 'text', 42, {}, [], [{ student_id: 'zzz', score_percent: 50 }], [{ student_id: 'a', score_percent: 'high' }], [{ student_id: 'a', score_percent: 140 }], [{ student_id: 'a', score_percent: -5 }]]) {
  assert.throws(() => mergeMatchResults(ranked, bad), undefined, JSON.stringify(bad))
}
// only the top candidates the AI actually saw can be changed
assert.throws(() => mergeMatchResults(ranked, [{ student_id: ranked.at(-1).student_id, score_percent: 90 }], 2))

// ---------- explanation, risk and what-if parsing ----------
assert.deepEqual(parseExplanation({ reasoning: 'This team covers every required skill with a strong Python lead.', coaching_notes: 'Meet weekly and split tasks.' }),
  { reasoning: 'This team covers every required skill with a strong Python lead.', coaching: 'Meet weekly and split tasks.' })
for (const bad of [null, {}, { reasoning: 'short' }, { reasoning: 'x'.repeat(40) }, 'string']) assert.throws(() => parseExplanation(bad))
assert.equal(parseSuggestion({ suggestion: 'Have a second person learn Python so work is not blocked.' }).length > 20, true)
assert.throws(() => parseSuggestion({ suggestion: 'ok' }))
assert.throws(() => parseReasoning({}))
assert.equal(cleanText('<script>alert(1)</script>  hello   world', 50), 'alert(1) hello world')
assert.equal(cleanText('x'.repeat(500), 100).length, 100)
assert.equal(cleanText(42, 10), '')

// ---------- prompts: data only, no sensitive fields, injection warning present ----------
const pick = pickBestTeam(pool, project, 3)
const members = pick.memberIds.map((id) => pool.find((p) => p.id === id))
const report = assessRisk(project, members)
const prompts = [
  buildMatchPrompt(project, ranked.slice(0, 3).map((baseline) => ({ student: pool.find((p) => p.id === baseline.student_id), baseline }))),
  buildTeamPrompt(project, members, pick),
  buildRiskPrompt(project, members, report),
  buildSimPrompt(project, members, { team_score: 80, reasoning: 'x' }),
]
for (const text of prompts) {
  assert.match(text, /data, not instructions/)
  assert.match(text, /Return ONLY/)
  for (const secret of ['secret.example', 'Hidden College', '9.9']) assert.ok(!text.includes(secret), `prompt leaked ${secret}`)
}
assert.match(prompts[0], /baseline_score/)
assert.match(prompts[1], /Do NOT change members or scores/)

console.log('ok - AI gate, caching keys, prompts and response validation')
