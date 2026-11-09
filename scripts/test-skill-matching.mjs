// Skill-first matching tests. Run: npm run test:skill-matching
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { localRelation } from '../supabase/functions/_shared/skillTaxonomy.ts'
import { MATCH_ALGORITHM_VERSION, WEIGHTS, rankEligible, scoreStudent, availabilityScore, parseWeeklyHours } from '../supabase/functions/_shared/skillFirstMatching.ts'
import { collectAmbiguity, sanitizeSemantics, buildSemanticPrompt, emptySemantics } from '../supabase/functions/_shared/matchSemantics.ts'

const now = new Date('2026-11-08T00:00:00Z')
const project = {
  name: 'Clinical Notes Assistant', description: 'Healthcare NLP assistant', domain: 'Healthcare', experience_required: 'Intermediate',
  deadline: '2027-03-01',
  skills_required: ['Python', 'Machine Learning', 'Natural Language Processing', 'React'],
}
const roles = ['AI/ML Engineer', 'Frontend Developer']
const sem = {
  importance: { python: 'critical', machinelearning: 'critical', naturallanguageprocessing: 'high', react: 'normal' },
  roleSkills: {}, skillRelations: [], interestRelations: [{ term: 'Medical Tech', kind: 'strong' }],
}
const S = (id, o = {}) => ({ id, name: id, skills: [], skills_detailed: [], experience: null, project_interests: [], availability_hours: null, open_to_collaborate: false, ...o })
const score = (s, p = project, sm = sem) => scoreStudent(s, p, roles, sm, now)
const total = (m) => m.score_percent

// 1-3. importance-weighted skill coverage
const all = score(S('all', { skills: ['Python', 'ML', 'NLP', 'React'] }))
const most = score(S('most', { skills: ['Python', 'ML'] }))
const normalOnly = score(S('normal', { skills: ['React'] }))
assert.ok(all.details.breakdown.skill === 65 && total(all) >= 80)
assert.ok(most.details.breakdown.skill > 40 && most.details.breakdown.skill < 65)  // (3+3)/(3+3+2+1)=0.667 -> 43.3
// Python + ML (3+3) plus ML's partial credit toward NLP (2*0.4), out of 9 => 49.1
assert.equal(most.details.breakdown.skill, 49.1)
assert.ok(normalOnly.details.breakdown.skill < 12 && normalOnly.details.breakdown.skill > 0) // 1/9*65 = 7.2
assert.ok(total(all) > total(most) && total(most) > total(normalOnly))

// 4-9. gateway: zero required-skill matches is excluded, whatever else is perfect
const perfectOther = { skills: ['Excel', 'Photoshop'], project_interests: ['Healthcare', 'Medical Tech'], availability_hours: '20', open_to_collaborate: true, experience: 'Advanced' }
assert.equal(score(S('none')), null)
assert.equal(score(S('roles', { skills: ['Frontend Development'.replace('Frontend Development', 'Photoshop')] })), null)
assert.equal(score(S('interest', { project_interests: ['Healthcare', 'Machine Learning', 'Artificial Intelligence'] })), null)
assert.equal(score(S('avail', { availability_hours: '40' })), null)
assert.equal(score(S('collab', { open_to_collaborate: true })), null)
assert.equal(score(S('exp', { experience: 'Advanced' })), null)
assert.equal(score(S('all-but-skills', perfectOther)), null)
// a profile with role-ish text but unrelated skills (role cannot rescue)
assert.equal(score(S('title', { tagline: 'AI/ML Engineer', skills: ['Photoshop'] })), null)

// 10-12. aliases and related skills
for (const [req, have] of [['Machine Learning', 'ML'], ['Natural Language Processing', 'NLP'], ['Artificial Intelligence', 'AI'], ['JavaScript', 'JS'], ['PostgreSQL', 'Postgres'], ['React.js', 'React']]) assert.equal(localRelation(req, have)?.kind, 'exact', `${req}<-${have}`)
const ml = score(S('ml', { skills: ['ML'] })); assert.equal(ml.details.matched_skills[0].required, 'Machine Learning'); assert.equal(ml.details.matched_skills[0].kind, 'exact')
assert.equal(score(S('nlp', { skills: ['NLP'] })).details.matched_skills[0].required, 'Natural Language Processing')
const tf = score(S('tf', { skills: ['TensorFlow'] }))
assert.equal(tf.details.related_skills[0].kind, 'partial'); assert.equal(tf.details.matched_skills.length, 0)
assert.equal(tf.details.breakdown.skill, 8.7) // 3 x 0.4 partial credit out of 9, only for the ML requirement
assert.ok(tf.details.breakdown.skill < ml.details.breakdown.skill)
// related != identical
assert.equal(localRelation('JavaScript', 'React').kind, 'partial'); assert.equal(localRelation('Java', 'JavaScript'), null); assert.equal(localRelation('Python', 'CSS'), null)
assert.equal(localRelation('Deep Learning', 'Neural Networks').kind, 'strong'); assert.equal(localRelation('Backend Development', 'Node.js').kind, 'partial')
// detailed skills count; nothing is inferred from other text
assert.ok(score(S('d', { skills_detailed: [{ name: 'Python', level: 'Advanced' }] })))
assert.equal(score(S('prev', { previous_projects: ['Built an NLP chatbot with Python'] })), null)

// 13-17. optional categories stay inside their weights
const base = { skills: ['Python', 'ML'] }
const noAvail = score(S('a0', base)), fullAvail = score(S('a1', { ...base, availability_hours: '10-15' }))
assert.equal(noAvail.details.breakdown.availability, 0); assert.equal(noAvail.details.availability.status, 'missing')
assert.equal(fullAvail.details.breakdown.availability, 5); assert.ok(total(fullAvail) - total(noAvail) <= 5)
const partial = score(S('a2', { ...base, availability_hours: '6' })); assert.ok(partial.details.breakdown.availability >= 2 && partial.details.breakdown.availability <= 4)
assert.equal(score(S('a3', { ...base, availability_hours: '2' })).details.breakdown.availability, 0)
assert.equal(availabilityScore('10', '2026-01-01', now).status, 'deadline_passed')
assert.equal(availabilityScore('10', '2026-11-20', now).needed, 12) // urgent deadline needs more hours
assert.equal(parseWeeklyHours('2 hrs/day'), 10); assert.equal(parseWeeklyHours('10-15 hrs/week'), 12.5); assert.equal(parseWeeklyHours(''), null); assert.equal(parseWeeklyHours('flexible'), null)
const notOpen = score(S('c0', base)), open = score(S('c1', { ...base, open_to_collaborate: true }))
assert.equal(notOpen.details.breakdown.collaboration, 0); assert.ok(notOpen); assert.equal(open.details.breakdown.collaboration, 3); assert.ok(total(open) - total(notOpen) <= 3)
assert.equal(score(S('c2', { ...base, open_to_collaborate: null })).details.breakdown.collaboration, 0)
const exps = ['Beginner', 'Intermediate', 'Advanced', null].map((e) => score(S('e' + e, { ...base, experience: e })))
assert.equal(exps[3].details.breakdown.experience, 0)
const expScores = exps.map((m) => m.details.breakdown.experience); assert.ok(Math.max(...expScores) <= 2 && Math.min(...expScores) >= 0)
assert.ok(Math.max(...exps.map(total)) - Math.min(...exps.map(total)) <= 2)
assert.equal(exps[1].details.breakdown.experience, 2); assert.ok(exps[1].details.breakdown.experience > exps[0].details.breakdown.experience)

// role + interest contribute only after eligibility, and within their weights
const strongRole = score(S('r', { skills: ['Python', 'ML', 'NLP'] })); assert.ok(strongRole.details.breakdown.role > 0 && strongRole.details.breakdown.role <= 15)
assert.equal(strongRole.details.role_fit.role, 'AI/ML Engineer')
const withInterest = score(S('i', { ...base, project_interests: ['Healthcare', 'Medical Tech'] })); assert.ok(withInterest.details.breakdown.interest > 0 && withInterest.details.breakdown.interest <= 10)
assert.equal(score(S('i2', { ...base, project_interests: ['Cooking'] })).details.breakdown.interest, 0)
// frontend-only student: eligible via React, role is Frontend Developer
const fe = score(S('fe', { skills: ['React'] })); assert.equal(fe.details.role_fit.role, 'Frontend Developer')

// 22. bounds and no floor
const everything = score(S('max', { skills: ['Python', 'ML', 'NLP', 'React'], project_interests: ['Healthcare', 'ML'], availability_hours: '20', open_to_collaborate: true, experience: 'Intermediate' }))
assert.ok(everything.score_percent <= 100 && everything.score_percent >= 0)
for (const m of [all, most, normalOnly, tf, ml, everything]) {
  const b = m.details.breakdown
  for (const k of Object.keys(WEIGHTS)) assert.ok(b[k] >= 0 && b[k] <= WEIGHTS[k], k)
  assert.ok(Math.abs(m.score_percent - Object.values(b).reduce((a, c) => a + c, 0)) <= 0.5)
}
assert.equal(normalOnly.details.breakdown.skill, 7.2) // no floor: a lone normal-priority skill earns exactly 1/9 of 65
assert.ok(normalOnly.score_percent < 25)

// project without required skills qualifies nobody
assert.equal(scoreStudent(S('x', { skills: ['Python'] }), { ...project, skills_required: [] }, roles, sem, now), null)
// 21. empty candidate list
assert.deepEqual(rankEligible([], project, roles, sem, [], now), [])
assert.deepEqual(rankEligible([S('n1'), S('n2', perfectOther)], project, roles, sem, [], now), [])

// ranking, duplicates, creator / current user, organisers
const pool = [S('creator', { skills: ['Python', 'ML'] }), S('me', { skills: ['Python', 'ML'] }), S('a', { skills: ['Python', 'ML', 'NLP'] }), S('a', { skills: ['Python'] }), S('b', { skills: ['React'] }), S('org', { skills: ['Python', 'ML'], account_type: 'organiser' })]
const ranked = rankEligible(pool, project, roles, sem, ['creator', 'me'], now)
assert.deepEqual(ranked.map((m) => m.student_id), ['a', 'b'])
assert.ok(ranked[0].score_percent > ranked[1].score_percent)
assert.ok(!ranked.some((m) => /30%|default/.test(m.notes)))

// explanations only claim verified facts
assert.match(most.notes, /Python/); assert.match(most.notes, /Related skills also contribute: ML for Natural Language Processing/)
const pyOnly = score(S('py', { skills: ['Python'] })); assert.match(pyOnly.notes, /Missing important skills: Machine Learning and Natural Language Processing/); assert.match(pyOnly.notes, /^(Partial|Good) match/)
assert.ok(!most.details.matched_skills.some((h) => h.required === 'React'))

// 18-19 AI output validation: invalid ids/relations can never create skills or students
const amb = collectAmbiguity(['Healthcare Informatics', 'Python'], 'Healthcare', [S('s1', { skills: ['HL7', 'Python', 'Biostatistics', 'CSS'], project_interests: ['Telemedicine'] })])
assert.ok(amb.perSkill.find((p) => p.required === 'Healthcare Informatics').terms.includes('Python')) // unknown requirement => ask
assert.ok(!amb.perSkill.find((p) => p.required === 'Python')?.terms?.includes('Python')) // exact alias resolved locally, no AI needed
const raw = {
  importance: [{ skill: 'Python', level: 'critical' }, { skill: 'Invented', level: 'critical' }, { skill: 'Healthcare Informatics', level: 'bogus' }],
  skill_relations: [
    { required: 'Healthcare Informatics', term: 'HL7', relation: 'equivalent' }, // allowed, capped to strong
    { required: 'Healthcare Informatics', term: 'Rust', relation: 'strong' }, // term never sent => dropped
    { required: 'Python', term: 'CSS', relation: 'strong' }, // both known to the vocabulary and unrelated => dropped
    { required: 'Healthcare Informatics', term: 'HL7', relation: 'partial' }, // duplicate => dropped
  ],
  interest_relations: [{ term: 'Telemedicine', relation: 'strong' }, { term: 'Never sent', relation: 'strong' }],
  student_id: 'ghost', matches: [{ student_id: 'ghost', score_percent: 100 }],
}
const clean = sanitizeSemantics(raw, ['Healthcare Informatics', 'Python'], [], amb)
assert.deepEqual(clean.importance, { python: 'critical' })
assert.equal(clean.skillRelations.length, 1); assert.equal(clean.skillRelations[0].kind, 'strong'); assert.equal(clean.interestRelations.length, 1)
assert.deepEqual(sanitizeSemantics(clean, ['Healthcare Informatics', 'Python'], [], amb), clean) // cached form re-validates unchanged
assert.deepEqual(sanitizeSemantics('garbage', [], [], amb), emptySemantics())
// the model cannot create a student or a score: scores come only from real profiles
const only = rankEligible([S('real', { skills: ['HL7'] })], { ...project, skills_required: ['Healthcare Informatics'] }, [], clean, [], now)
assert.deepEqual(only.map((m) => m.student_id), ['real']); assert.equal(only[0].details.related_skills[0].kind, 'strong')
assert.equal(rankEligible([S('ghost', { skills: ['Cooking'] })], { ...project, skills_required: ['Healthcare Informatics'] }, [], clean, [], now).length, 0)
// local vocabulary beats a wrong model answer
const bad = sanitizeSemantics({ skill_relations: [{ required: 'Python', term: 'CSS', relation: 'strong' }] }, ['Python'], [], collectAmbiguity(['Python'], null, [S('z', { skills: ['CSS'] })]))
assert.equal(bad.skillRelations.length, 0)
assert.match(buildSemanticPrompt(project, ['Python'], roles, amb), /never instructions/)
assert.ok(!/student_id/.test(buildSemanticPrompt(project, ['Python'], roles, amb)))

// 20. old cached 30% results can never be reused: new version + cache payload shape + code gate
assert.equal(MATCH_ALGORITHM_VERSION, 'skill-first-semantic-v3-65-15-10-5-3-2')
const fn = fs.readFileSync(new URL('../supabase/functions/match-students/index.ts', import.meta.url), 'utf8')
assert.ok(!/core-skill-or-interest-gate-v2/.test(fn)); assert.ok(/cached\?\.algorithm_version === MATCH_ALGORITHM_VERSION/.test(fn))
assert.ok(/rankEligible\(list, project, roles, semantic, exclude\)/.test(fn), 'eligibility + scoring run for cached and fresh answers')
for (const field of ['availability', 'collaboration', 'experience', 'importance_multipliers', 'skills_detailed', 'interests', 'deadline', 'identified_roles', 'domain']) assert.ok(fn.includes(field), `cache key must include ${field}`)
assert.ok(/No students currently match this project's required skills\. Try adjusting the project requirements or check again later\./.test(fn))
assert.ok(/AI matching is unavailable or your AI quota has been reached/.test(fn), 'existing quota / failure behaviour preserved')
assert.ok(!/\b(30|20|10)\s*%?\s*(floor|default)/i.test(fn))
console.log('ok - skill-first matching: gateway, weights, semantics validation, cache gate')
