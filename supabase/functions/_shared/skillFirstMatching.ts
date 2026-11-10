// Deterministic, skill-first student <-> project scoring. Pure TypeScript, no network.
//
// Final score (0-100) = Skill 65 + Role 15 + Interest 10 + Availability 5 + Collaboration 3 + Experience 2
//
// GATEWAY: a student with no genuine required-skill match is excluded outright. Role, interest,
// availability, collaboration and experience can only rank students who already passed the gateway.
// Gemini only supplies *semantic judgements* (see matchSemantics.ts); every number is computed here.

import { canon, localRelation, ROLE_FAMILIES, skillId, STRENGTH, type MatchKind } from './skillTaxonomy.ts'
import {
  IMPORTANCE_MULTIPLIER,
  studentInterestNames,
  studentSkillNames,
  uniqueRequired,
  type Importance,
  type Semantics,
} from './matchSemantics.ts'
import type { Student } from './teamOptimizer.ts'

export const MATCH_ALGORITHM_VERSION = 'skill-first-semantic-v3-65-15-10-5-3-2'

export const WEIGHTS = { skill: 65, role: 15, interest: 10, availability: 5, collaboration: 3, experience: 2 } as const

export type MatchStudent = Student & { open_to_collaborate?: boolean | null; account_type?: string | null }

export type MatchProject = {
  name?: string | null
  description?: string | null
  domain?: string | null
  skills_required?: string[] | null
  experience_required?: string | null
  deadline?: string | null
}

export type SkillHit = { required: string; via: string; kind: MatchKind; importance: Importance }

export type MatchDetails = {
  algorithm_version: string
  breakdown: { skill: number; role: number; interest: number; availability: number; collaboration: number; experience: number }
  matched_skills: SkillHit[] // exact / equivalent
  related_skills: SkillHit[] // strong or partial
  missing_skills: { skill: string; importance: Importance }[]
  role_fit: { role: string | null; coverage: number }
  interest_matches: { interest: string; strength: number }[]
  availability: { hours: number | null; needed_hours: number; status: 'full' | 'partial' | 'insufficient' | 'missing' | 'deadline_passed' }
  collaboration: { open: boolean | null }
  experience: { student: string | null; required: string | null; status: 'match' | 'above' | 'below' | 'missing' }
}

export type ScoredMatch = {
  student_id: string
  score_percent: number
  skill_overlap: string[]
  notes: string
  details: MatchDetails
}

const r1 = (n: number) => Math.round(n * 10) / 10
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// ---------------------------------------------------------------- availability
export function parseWeeklyHours(text: unknown): number | null {
  if (text === null || text === undefined) return null
  const s = String(text).toLowerCase()
  const nums = (s.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 2).map(Number)
  if (nums.length === 0) return null
  let hours = nums.reduce((a, b) => a + b, 0) / nums.length
  if (/\b(day|daily)\b|per day|\/\s*day/.test(s)) hours *= 5
  else if (/month/.test(s)) hours /= 4.3
  return Number.isFinite(hours) && hours >= 0 && hours <= 168 ? hours : null
}

// No project workload field exists in the database, so a fixed, documented baseline is used:
// a student project asks for about 8 hours a week, 12 when the deadline is within three weeks.
export const BASELINE_WEEKLY_HOURS = 8
export const URGENT_WEEKLY_HOURS = 12

export function availabilityScore(availabilityText: unknown, deadline: string | null | undefined, now: Date) {
  let needed = BASELINE_WEEKLY_HOURS
  let passed = false
  if (deadline) {
    const end = new Date(`${String(deadline).slice(0, 10)}T23:59:59Z`)
    if (!Number.isNaN(end.getTime())) {
      const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000)
      if (days < 0) passed = true
      else if (days <= 21) needed = URGENT_WEEKLY_HOURS
    }
  }
  const hours = parseWeeklyHours(availabilityText)
  if (hours === null) return { score: 0, hours, needed, status: 'missing' as const }
  if (passed) return { score: 0, hours, needed, status: 'deadline_passed' as const }
  const ratio = hours / needed
  if (ratio >= 1) return { score: WEIGHTS.availability, hours, needed, status: 'full' as const }
  if (ratio >= 0.5) return { score: r1(2 + 2 * ((ratio - 0.5) / 0.5) * 0.999), hours, needed, status: 'partial' as const }
  return { score: 0, hours, needed, status: 'insufficient' as const }
}

// ---------------------------------------------------------------- experience
const RANK: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 }
export function experienceScore(student: string | null | undefined, required: string | null | undefined) {
  const s = RANK[String(student ?? '').trim().toLowerCase()]
  const p = RANK[String(required ?? '').trim().toLowerCase()]
  if (!s || !p) return { score: 0, status: 'missing' as const }
  const diff = s - p
  const factor = diff === 0 ? 1 : diff === 1 ? 0.75 : diff >= 2 ? 0.5 : diff === -1 ? 0.4 : 0
  return { score: r1(WEIGHTS.experience * factor), status: diff === 0 ? ('match' as const) : diff > 0 ? ('above' as const) : ('below' as const) }
}

// ---------------------------------------------------------------- collaboration
// The app stores one yes/no flag ("Open to collaborate"); there is no finer status to read.
export const collaborationScore = (open: boolean | null | undefined) => (open === true ? WEIGHTS.collaboration : 0)

// ---------------------------------------------------------------- skills
type Requirement = { label: string; id: string; importance: Importance; weight: number }

function requirementsOf(project: MatchProject, sem: Semantics): Requirement[] {
  return uniqueRequired(project.skills_required).map((label) => {
    const id = skillId(label)
    const importance = sem.importance[id] ?? 'normal'
    return { label, id, importance, weight: IMPORTANCE_MULTIPLIER[importance] }
  })
}

function semanticKind(sem: Semantics, required: string, term: string): MatchKind | null {
  const rid = skillId(required)
  const tid = skillId(term)
  const hit = sem.skillRelations.find((x) => skillId(x.required) === rid && skillId(x.term) === tid)
  return hit ? hit.kind : null
}

function bestForRequirement(req: Requirement, skills: string[], sem: Semantics): { via: string; kind: MatchKind } | null {
  let best: { via: string; kind: MatchKind } | null = null
  for (const skill of skills) {
    const local = localRelation(req.label, skill)
    const kind = local?.kind ?? semanticKind(sem, req.label, skill)
    if (!kind) continue
    if (!best || STRENGTH[kind] > STRENGTH[best.kind]) best = { via: skill, kind }
    if (best.kind === 'exact') break
  }
  return best
}

// ---------------------------------------------------------------- roles
function rolesToRequirements(role: string, reqs: Requirement[], sem: Semantics): Requirement[] {
  const mapped = sem.roleSkills[canon(role)]
  if (mapped && mapped.length) {
    const ids = new Set(mapped.map(skillId))
    return reqs.filter((r) => ids.has(r.id))
  }
  const norm = (v: string) => ` ${v.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim()}`
  const text = `${norm(role)} `
  // keyword is matched at the start of a word ("design" matches "designer"), never mid-word.
  const family = ROLE_FAMILIES.find((f) => f.keywords.some((k) => text.includes(norm(k))))
  if (!family) return []
  return reqs.filter((r) => family.skills.some((f) => skillId(f) === r.id || localRelation(r.label, f) || localRelation(f, r.label)))
}

// ---------------------------------------------------------------- interests
function interestStrengths(student: MatchStudent, project: MatchProject, reqs: Requirement[], sem: Semantics) {
  const domainId = project.domain ? skillId(project.domain) : ''
  const out: { interest: string; strength: number }[] = []
  for (const term of studentInterestNames(student)) {
    const id = skillId(term)
    let strength = 0
    if (domainId && id === domainId) strength = 1
    else if (reqs.some((r) => r.id === id)) strength = 0.75
    else {
      for (const r of reqs) {
        const rel = localRelation(r.label, term)
        if (rel) strength = Math.max(strength, rel.kind === 'partial' ? 0.4 : 0.75)
      }
      if (project.domain) {
        const rel = localRelation(project.domain, term)
        if (rel) strength = Math.max(strength, rel.kind === 'partial' ? 0.4 : 0.75)
      }
      const sr = sem.interestRelations.find((x) => skillId(x.term) === id)
      if (sr) strength = Math.max(strength, sr.kind === 'strong' ? 0.75 : 0.4)
    }
    if (strength > 0) out.push({ interest: term, strength })
  }
  return out.sort((a, b) => b.strength - a.strength || a.interest.localeCompare(b.interest))
}

// ---------------------------------------------------------------- explanation
const list = (items: string[]) => (items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

function explain(score: number, d: MatchDetails): string {
  const label = score >= 70 ? 'Strong match' : score >= 45 ? 'Good match' : 'Partial match'
  const parts: string[] = []
  const matched = d.matched_skills.map((h) => (canon(h.via) === canon(h.required) ? h.required : `${h.required} (${h.via})`))
  if (matched.length) parts.push(`The student's profile covers ${list(matched)}`)
  const related = d.related_skills.map((h) => `${h.via} for ${h.required}`)
  if (related.length) parts.push(`${matched.length ? 'Related skills also contribute' : 'Related skills contribute'}: ${list(related)}`)
  const missing = d.missing_skills.filter((m) => m.importance === 'critical' || m.importance === 'high').map((m) => m.skill)
  const missingOther = d.missing_skills.filter((m) => m.importance !== 'critical' && m.importance !== 'high').map((m) => m.skill)
  if (missing.length) parts.push(`Missing important skills: ${list(missing)}`)
  else if (missingOther.length) parts.push(`Not listed: ${list(missingOther)}`)
  const extras: string[] = []
  if (d.role_fit.role && d.role_fit.coverage > 0) extras.push(`fits the ${d.role_fit.role} role`)
  if (d.interest_matches.length) extras.push(`has relevant interests (${list(d.interest_matches.slice(0, 3).map((i) => i.interest))})`)
  if (d.availability.status === 'full') extras.push(`has enough weekly availability (${d.availability.hours} hrs)`)
  else if (d.availability.status === 'partial') extras.push(`has limited availability (${d.availability.hours} of about ${d.availability.needed_hours} hrs/week)`)
  else if (d.availability.status === 'insufficient') extras.push(`has too little availability (${d.availability.hours} hrs/week)`)
  else if (d.availability.status === 'missing') extras.push('has not shared availability')
  if (d.collaboration.open === true) extras.push('is open to collaboration')
  else if (d.collaboration.open === false) extras.push('is not currently open to collaboration')
  let text = `${label}: ${parts.join('. ')}.`
  if (extras.length) text += ` The student ${list(extras)}.`
  return text
}

// ---------------------------------------------------------------- main
export function scoreStudent(student: MatchStudent, project: MatchProject, roles: string[], sem: Semantics, now = new Date()): ScoredMatch | null {
  const reqs = requirementsOf(project, sem)
  if (reqs.length === 0) return null // nothing to compare against, so nothing can qualify

  const skills = studentSkillNames(student)
  const hitByReq = new Map<string, { via: string; kind: MatchKind }>()
  let weighted = 0
  let total = 0
  for (const req of reqs) {
    total += req.weight
    const hit = bestForRequirement(req, skills, sem)
    if (hit) {
      hitByReq.set(req.id, hit)
      weighted += req.weight * STRENGTH[hit.kind]
    }
  }

  // GATEWAY: no genuine required-skill match -> excluded, whatever else the profile says.
  if (hitByReq.size === 0 || weighted <= 0) return null

  const skill = r1(clamp((weighted / total) * WEIGHTS.skill, 0, WEIGHTS.skill))

  const matched: SkillHit[] = []
  const related: SkillHit[] = []
  const missing: { skill: string; importance: Importance }[] = []
  for (const req of reqs) {
    const hit = hitByReq.get(req.id)
    if (!hit) missing.push({ skill: req.label, importance: req.importance })
    else (hit.kind === 'exact' ? matched : related).push({ required: req.label, via: hit.via, kind: hit.kind, importance: req.importance })
  }

  // Role: best single role the student could fill, judged by the required skills that role relies on.
  let role: { role: string | null; coverage: number } = { role: null, coverage: 0 }
  for (const name of roles) {
    const roleReqs = rolesToRequirements(name, reqs, sem)
    const roleTotal = roleReqs.reduce((a, q) => a + q.weight, 0)
    if (!roleTotal) continue
    const got = roleReqs.reduce((a, q) => a + q.weight * (hitByReq.has(q.id) ? STRENGTH[hitByReq.get(q.id)!.kind] : 0), 0)
    const coverage = got / roleTotal
    if (coverage > role.coverage) role = { role: name, coverage: r1(coverage * 100) / 100 }
  }
  const roleScore = r1(clamp(role.coverage * WEIGHTS.role, 0, WEIGHTS.role))

  const interests = interestStrengths(student, project, reqs, sem)
  const top = interests[0]?.strength ?? 0
  const rest = interests.slice(1).reduce((a, i) => a + i.strength, 0)
  const interestScore = r1(clamp(Math.min(1, top + 0.25 * rest) * WEIGHTS.interest, 0, WEIGHTS.interest))

  const avail = availabilityScore(student.availability_hours, project.deadline, now)
  const collab = collaborationScore(student.open_to_collaborate)
  const exp = experienceScore(student.experience, project.experience_required)

  const breakdown = {
    skill,
    role: roleScore,
    interest: interestScore,
    availability: clamp(avail.score, 0, WEIGHTS.availability),
    collaboration: collab,
    experience: clamp(exp.score, 0, WEIGHTS.experience),
  }
  const totalScore = clamp(Object.values(breakdown).reduce((a, b) => a + b, 0), 0, 100)
  const score = Math.round(totalScore)

  const details: MatchDetails = {
    algorithm_version: MATCH_ALGORITHM_VERSION,
    breakdown,
    matched_skills: matched,
    related_skills: related,
    missing_skills: missing,
    role_fit: role,
    interest_matches: interests.slice(0, 5),
    availability: { hours: avail.hours === null ? null : r1(avail.hours), needed_hours: avail.needed, status: avail.status },
    collaboration: { open: student.open_to_collaborate ?? null },
    experience: { student: student.experience ?? null, required: project.experience_required ?? null, status: exp.status },
  }

  return {
    student_id: student.id,
    score_percent: score,
    skill_overlap: matched.concat(related.filter((h) => h.kind === 'strong')).map((h) => h.required),
    notes: explain(score, details),
    details,
  }
}

// Scores every candidate and returns only those who passed the skill gateway, best first.
// `excludeIds` (project creator, the signed-in user) and duplicate ids are removed here as well.
export function rankEligible(
  students: MatchStudent[],
  project: MatchProject,
  roles: string[],
  sem: Semantics,
  excludeIds: string[] = [],
  now = new Date(),
): ScoredMatch[] {
  const blocked = new Set(excludeIds.filter(Boolean))
  const seen = new Set<string>()
  const names = new Map(students.map((s) => [s.id, String(s.name ?? '')]))
  const out: ScoredMatch[] = []
  for (const student of students) {
    if (!student?.id || blocked.has(student.id) || seen.has(student.id)) continue
    if (student.account_type === 'organiser') continue
    seen.add(student.id)
    const scored = scoreStudent(student, project, roles, sem, now)
    if (scored) out.push(scored)
  }
  return out.sort((a, b) => b.score_percent - a.score_percent || String(names.get(a.student_id)).localeCompare(String(names.get(b.student_id))))
}
