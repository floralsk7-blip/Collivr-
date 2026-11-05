// Deterministic team optimizer used by the `form-event-teams` edge function.
//
// Pure TypeScript with no Deno or network dependencies, so it can be unit-tested
// with plain Node (see scripts/test-optimizer.mjs).
//
// How it works
//   1. Every possible team is scored 0-100 with a transparent weighted formula.
//   2. Students are snake-drafted into balanced starting teams.
//   3. A seeded local search swaps students between teams, keeping any swap that
//      improves (average team score + 0.5 * weakest team score), so no team is
//      sacrificed for the others.
// The same input always produces the same teams. The LLM is only used afterwards,
// to explain the result in words.

export type SkillDetail = { name: string; level?: string | null }

export type Student = {
  id: string
  name: string
  skills?: string[] | null
  skills_detailed?: SkillDetail[] | null
  experience?: string | null
  project_interests?: string[] | null
  availability_hours?: string | null
  branch?: string | null
  department?: string | null
}

export type EventSpec = {
  domain?: string | null
  skillsFocus: string[]
  teamSize: number
}

// Weights sum to 100. They mirror the "Why this team?" slide:
// skill 35, interest 20, availability 15, experience 15, role/branch diversity 15.
export const WEIGHTS = {
  skill: 35,
  interest: 20,
  availability: 15,
  experience: 15,
  diversity: 15,
} as const

export type Breakdown = {
  skill: number
  interest: number
  availability: number
  experience: number
  diversity: number
}

export type FormedTeam = {
  index: number // 1-based
  memberIds: string[]
  score: number // 0-100, one decimal
  breakdown: Breakdown // each part 0-100
  missingSkills: string[]
  roles: Record<string, string> // studentId -> role label
}

export type FormationResult = {
  teams: FormedTeam[]
  overallScore: number
}

export type Prepared = {
  student: Student
  skills: Map<string, { level: number; label: string }>
  hours: number | null
  rank: number // 1 beginner .. 3 advanced
  interests: Set<string>
  branch: string
  strength: number
}

const LEVEL_VALUE: Record<string, number> = { beginner: 0.4, intermediate: 0.7, advanced: 1 }
const EXPERIENCE_RANK: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 }
const ALIASES: Record<string, string> = {
  js: 'javascript',
  reactjs: 'react',
  nodejs: 'node',
  expressjs: 'express',
  ml: 'machinelearning',
  ts: 'typescript',
  py: 'python',
}

export function skillKey(raw: string): string {
  const k = String(raw ?? '').toLowerCase().replace(/[\s.\-_/]/g, '')
  return ALIASES[k] ?? k
}

function parseHours(text?: string | null): number | null {
  if (!text) return null
  const nums = (String(text).match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 2).map(Number)
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function prepareStudent(student: Student, spec: EventSpec): Prepared {
  const skills = new Map<string, { level: number; label: string }>()
  for (const d of student.skills_detailed ?? []) {
    if (!d?.name) continue
    const key = skillKey(d.name)
    const level = LEVEL_VALUE[String(d.level ?? 'intermediate').toLowerCase()] ?? 0.7
    const prev = skills.get(key)
    if (!prev || level > prev.level) skills.set(key, { level, label: d.name })
  }
  for (const name of student.skills ?? []) {
    const key = skillKey(name)
    if (key && !skills.has(key)) skills.set(key, { level: 0.7, label: name })
  }

  const rank = EXPERIENCE_RANK[String(student.experience ?? 'intermediate').toLowerCase()] ?? 2
  const focusKeys = spec.skillsFocus.map(skillKey)
  const focusStrength = focusKeys.reduce((sum, k) => sum + (skills.get(k)?.level ?? 0), 0)

  return {
    student,
    skills,
    hours: parseHours(student.availability_hours),
    rank,
    interests: new Set((student.project_interests ?? []).map(skillKey).filter(Boolean)),
    branch: skillKey(student.branch ?? student.department ?? ''),
    strength: focusKeys.length > 0 ? focusStrength + rank * 0.1 : skills.size * 0.3 + rank * 0.1,
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export function scoreTeam(
  members: Prepared[],
  spec: EventSpec,
): { total: number; breakdown: Breakdown; missingSkills: string[] } {
  const n = members.length
  const focus = spec.skillsFocus.filter((s) => skillKey(s))

  // Skill coverage and depth: best level in the team for each required skill.
  let skillPart: number
  const missingSkills: string[] = []
  if (focus.length > 0) {
    let sum = 0
    for (const label of focus) {
      const key = skillKey(label)
      const best = members.reduce((m, p) => Math.max(m, p.skills.get(key)?.level ?? 0), 0)
      if (best === 0) missingSkills.push(label)
      sum += best
    }
    skillPart = sum / focus.length
  } else {
    const distinct = new Set<string>()
    members.forEach((p) => p.skills.forEach((_v, k) => distinct.add(k)))
    skillPart = clamp01(distinct.size / Math.max(1, n * 3))
  }

  // Interest: matches the event domain, or at least shared with a teammate.
  const domainKey = skillKey(spec.domain ?? '')
  const anyInterests = members.some((p) => p.interests.size > 0)
  let interestPart = 0.5
  if (anyInterests) {
    interestPart =
      members.reduce((sum, p, i) => {
        if (domainKey && p.interests.has(domainKey)) return sum + 1
        const sharedWithMate = members.some(
          (q, j) => j !== i && [...p.interests].some((x) => q.interests.has(x)),
        )
        return sum + (sharedWithMate ? 0.5 : 0)
      }, 0) / n
  }

  // Availability: members should have similar weekly hours.
  const hours = members.map((p) => p.hours).filter((h): h is number => h !== null)
  let availabilityPart = 0.5
  if (hours.length >= 2) {
    const max = Math.max(...hours)
    const min = Math.min(...hours)
    availabilityPart = 1 - clamp01((max - min) / Math.max(max, 1))
  }

  // Experience balance: at least one intermediate/advanced member, and a mix of levels.
  const ranks = members.map((p) => p.rank)
  const hasLead = Math.max(...ranks) >= 2 ? 1 : 0
  const variety = new Set(ranks).size / Math.min(3, n)
  const experiencePart = clamp01(0.6 * hasLead + 0.4 * variety)

  // Diversity: different branches complement each other (up to 3 distinct).
  const branches = new Set(members.map((p) => p.branch).filter(Boolean))
  const diversityPart =
    branches.size === 0 ? 0.5 : n <= 1 ? 0.5 : clamp01(branches.size / Math.min(n, 3))

  const parts = {
    skill: skillPart,
    interest: interestPart,
    availability: availabilityPart,
    experience: experiencePart,
    diversity: diversityPart,
  }
  const total =
    WEIGHTS.skill * parts.skill +
    WEIGHTS.interest * parts.interest +
    WEIGHTS.availability * parts.availability +
    WEIGHTS.experience * parts.experience +
    WEIGHTS.diversity * parts.diversity

  const pct = (x: number) => Math.round(x * 1000) / 10
  return {
    total,
    breakdown: {
      skill: pct(parts.skill),
      interest: pct(parts.interest),
      availability: pct(parts.availability),
      experience: pct(parts.experience),
      diversity: pct(parts.diversity),
    },
    missingSkills,
  }
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function objective(scores: number[]): number {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  return mean + 0.5 * Math.min(...scores)
}

export function assignRoles(members: Prepared[], spec: EventSpec): Record<string, string> {
  const roles: Record<string, string> = {}
  const taken = new Set<string>()

  // Each required skill is "owned" by the strongest member for it.
  for (const label of spec.skillsFocus) {
    const key = skillKey(label)
    let owner: Prepared | null = null
    let best = 0
    for (const p of members) {
      const level = p.skills.get(key)?.level ?? 0
      if (level > best && !roles[p.student.id]) {
        best = level
        owner = p
      }
    }
    if (owner && !taken.has(owner.student.id)) {
      roles[owner.student.id] = label
      taken.add(owner.student.id)
    }
  }

  // Anyone left gets their strongest own skill, or "Generalist".
  for (const p of members) {
    if (roles[p.student.id]) continue
    let top: { level: number; label: string } | null = null
    for (const s of p.skills.values()) if (!top || s.level > top.level) top = s
    roles[p.student.id] = top ? top.label : 'Generalist'
  }
  return roles
}

export function formTeams(
  students: Student[],
  spec: EventSpec,
  options: { iterations?: number; seed?: number } = {},
): FormationResult {
  const iterations = options.iterations ?? 6000
  const rand = mulberry32(options.seed ?? 42)

  const prepared = students.map((s) => prepareStudent(s, spec))
  const teamCount = Math.max(1, Math.ceil(prepared.length / Math.max(2, spec.teamSize)))

  // Snake draft strongest-first so the starting teams are already balanced.
  const ordered = [...prepared].sort((a, b) => b.strength - a.strength)
  const teams: Prepared[][] = Array.from({ length: teamCount }, () => [])
  ordered.forEach((p, i) => {
    const round = Math.floor(i / teamCount)
    const pos = i % teamCount
    teams[round % 2 === 0 ? pos : teamCount - 1 - pos].push(p)
  })

  const scores = teams.map((t) => scoreTeam(t, spec).total)

  if (teamCount > 1) {
    for (let it = 0; it < iterations; it++) {
      const a = Math.floor(rand() * teamCount)
      let b = Math.floor(rand() * teamCount)
      if (a === b) b = (b + 1) % teamCount
      if (teams[a].length === 0 || teams[b].length === 0) continue
      const i = Math.floor(rand() * teams[a].length)
      const j = Math.floor(rand() * teams[b].length)

      const nextA = teams[a].slice()
      const nextB = teams[b].slice()
      ;[nextA[i], nextB[j]] = [nextB[j], nextA[i]]

      const trial = scores.slice()
      trial[a] = scoreTeam(nextA, spec).total
      trial[b] = scoreTeam(nextB, spec).total
      if (objective(trial) > objective(scores) + 1e-9) {
        teams[a] = nextA
        teams[b] = nextB
        scores[a] = trial[a]
        scores[b] = trial[b]
      }
    }
  }

  const formed: FormedTeam[] = teams.map((members, idx) => {
    const s = scoreTeam(members, spec)
    return {
      index: idx + 1,
      memberIds: members.map((m) => m.student.id),
      score: Math.round(s.total * 10) / 10,
      breakdown: s.breakdown,
      missingSkills: s.missingSkills,
      roles: assignRoles(members, spec),
    }
  })
  formed.sort((x, y) => y.score - x.score)
  formed.forEach((t, i) => (t.index = i + 1))

  const overall = formed.reduce((sum, t) => sum + t.score, 0) / formed.length
  return { teams: formed, overallScore: Math.round(overall * 10) / 10 }
}
