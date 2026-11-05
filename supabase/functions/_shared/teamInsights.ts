// Deterministic, explainable matching and team insights. No LLM and no network, so it is
// instant, free of quota limits, and returns the same answer for the same input.
// Pure TypeScript, unit-tested with plain Node (see scripts/test-insights.mjs).

import {
  assignRoles,
  prepareStudent,
  scoreTeam,
  skillKey,
  type Breakdown,
  type EventSpec,
  type Student,
} from './teamOptimizer.ts'

export type ProjectLike = {
  name?: string | null
  domain?: string | null
  skills_required?: string[] | null
  experience_required?: string | null
  team_size?: number | null
}

const RANK: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 }
const RANK_NAME = ['', 'Beginner', 'Intermediate', 'Advanced']
const round1 = (n: number) => Math.round(n * 10) / 10

export function specOf(project: ProjectLike): EventSpec {
  return {
    domain: project.domain ?? null,
    skillsFocus: (project.skills_required ?? []).filter(Boolean),
    teamSize: project.team_size ?? 4,
  }
}

// ---------------------------------------------------------------------------
// Student <-> project match (replaces the old LLM scoring)
// Weights: skills 55, experience fit 20, interest in the domain 15, availability 10.
// ---------------------------------------------------------------------------
export type StudentMatch = {
  student_id: string
  score_percent: number
  skill_overlap: string[]
  notes: string
}

export function scoreStudentForProject(student: Student, project: ProjectLike): StudentMatch {
  const spec = specOf(project)
  const p = prepareStudent(student, spec)
  const required = spec.skillsFocus

  const overlap: string[] = []
  const missing: string[] = []
  let skillPart = 0.5
  if (required.length > 0) {
    let sum = 0
    for (const label of required) {
      const level = p.skills.get(skillKey(label))?.level ?? 0
      sum += level
      ;(level > 0 ? overlap : missing).push(label)
    }
    skillPart = sum / required.length
  }

  const need = RANK[String(project.experience_required ?? '').toLowerCase()]
  let expPart = 0.7
  if (need) {
    const diff = need - p.rank
    expPart = diff <= 0 ? 1 : diff === 1 ? 0.5 : 0
  }

  const domainKey = skillKey(project.domain ?? '')
  const interestPart = p.interests.size === 0 ? 0.5 : domainKey && p.interests.has(domainKey) ? 1 : 0
  const availPart = p.hours === null ? 0.5 : p.hours >= 8 ? 1 : p.hours >= 4 ? 0.6 : 0.3

  const total = 0.55 * skillPart + 0.2 * expPart + 0.15 * interestPart + 0.1 * availPart
  const notes =
    (required.length > 0
      ? `Covers ${overlap.length} of ${required.length} required skills${overlap.length ? ` (${overlap.join(', ')})` : ''}.`
      : 'No required skills were listed.') +
    (missing.length ? ` Missing: ${missing.join(', ')}.` : '') +
    ` ${RANK_NAME[p.rank]} experience.`

  return { student_id: student.id, score_percent: Math.round(total * 100), skill_overlap: overlap, notes }
}

export function rankStudents(students: Student[], project: ProjectLike): StudentMatch[] {
  const names = new Map(students.map((s) => [s.id, s.name ?? '']))
  return students
    .map((s) => scoreStudentForProject(s, project))
    .sort((a, b) => b.score_percent - a.score_percent || String(names.get(a.student_id)).localeCompare(String(names.get(b.student_id))))
}

// ---------------------------------------------------------------------------
// Best team of N from a candidate pool
// ---------------------------------------------------------------------------
const AREA_LABEL: Record<keyof Breakdown, string> = {
  skill: 'skills',
  interest: 'interest in the domain',
  availability: 'availability',
  experience: 'experience mix',
  diversity: 'branch diversity',
}

export type TeamPick = {
  memberIds: string[]
  score: number
  breakdown: Breakdown
  missingSkills: string[]
  roles: Record<string, string>
  reasoning: string
  coaching: string
}

export function describeTeam(
  names: Map<string, string>,
  score: number,
  breakdown: Breakdown,
  missingSkills: string[],
  roles: Record<string, string>,
  spec: EventSpec,
): { reasoning: string; coaching: string } {
  const entries = (Object.entries(breakdown) as [keyof Breakdown, number][]).sort((a, b) => b[1] - a[1])
  const strongest = entries[0]
  const weakest = entries[entries.length - 1]
  const required = spec.skillsFocus.length
  const coverage =
    required > 0
      ? ` Covers ${required - missingSkills.length} of ${required} required skills${missingSkills.length ? `; nobody covers ${missingSkills.join(', ')}` : ''}.`
      : ''
  const reasoning = `Team score ${Math.round(score)}/100.${coverage} Strongest area: ${AREA_LABEL[strongest[0]]} (${Math.round(strongest[1])}%). Weakest: ${AREA_LABEL[weakest[0]]} (${Math.round(weakest[1])}%).`

  const tips: string[] = []
  tips.push(
    missingSkills.length > 0
      ? `Nobody covers ${missingSkills.join(', ')}. Decide early who will learn it, or invite someone who knows it.`
      : 'Every required skill has an owner. Agree on who leads each area in your first meeting.',
  )
  if (breakdown.availability < 60) tips.push('Weekly availability differs a lot, so split the work into pieces people can finish independently.')
  if (breakdown.experience < 60) tips.push('Pair less experienced members with a more experienced teammate.')
  const leads = Object.entries(roles)
    .slice(0, 3)
    .map(([id, role]) => `${names.get(id) ?? 'A member'} (${role})`)
  if (leads.length > 0) tips.push(`Suggested leads: ${leads.join(', ')}.`)
  return { reasoning, coaching: tips.join(' ') }
}

export function pickBestTeam(students: Student[], project: ProjectLike, size: number): TeamPick {
  const spec = specOf(project)
  const prepared = students.map((s) => prepareStudent(s, spec))
  const k = Math.max(1, Math.min(Math.floor(size) || 1, prepared.length))
  const pool = [...prepared].sort((a, b) => b.strength - a.strength).slice(0, 40)

  let team = pool.slice(0, k)
  const rest = pool.slice(k)
  let best = scoreTeam(team, spec).total
  let improved = true
  for (let pass = 0; improved && pass < 20; pass++) {
    improved = false
    for (let i = 0; i < team.length; i++) {
      for (let j = 0; j < rest.length; j++) {
        const trial = team.slice()
        trial[i] = rest[j]
        const sc = scoreTeam(trial, spec).total
        if (sc > best + 1e-9) {
          rest[j] = team[i]
          team = trial
          best = sc
          improved = true
        }
      }
    }
  }

  const s = scoreTeam(team, spec)
  const roles = assignRoles(team, spec)
  const names = new Map(team.map((m) => [m.student.id, m.student.name]))
  const text = describeTeam(names, s.total, s.breakdown, s.missingSkills, roles, spec)
  return {
    memberIds: team.map((m) => m.student.id),
    score: round1(s.total),
    breakdown: s.breakdown,
    missingSkills: s.missingSkills,
    roles,
    reasoning: text.reasoning,
    coaching: text.coaching,
  }
}

// What-if: score any specific group of students for a project.
export function simulateTeam(students: Student[], project: ProjectLike): { team_score: number; reasoning: string } {
  const spec = specOf(project)
  const prepared = students.map((s) => prepareStudent(s, spec))
  const s = scoreTeam(prepared, spec)
  const names = new Map(students.map((m) => [m.id, m.name]))
  const text = describeTeam(names, s.total, s.breakdown, s.missingSkills, assignRoles(prepared, spec), spec)
  return { team_score: Math.round(s.total), reasoning: text.reasoning }
}

// ---------------------------------------------------------------------------
// Risk analysis of a formed team (same response shape the Risk tab already reads)
// ---------------------------------------------------------------------------
type Dim = { status: string; note: string }
export type RiskReport = {
  skill_coverage: Dim
  availability_risk: Dim
  role_dependency: Dim
  experience_balance: Dim
  ai_suggestion: string
}

export function assessRisk(project: ProjectLike, members: Student[]): RiskReport {
  const spec = specOf(project)
  const prepared = members.map((s) => prepareStudent(s, spec))
  const required = spec.skillsFocus

  // Skill coverage and single points of failure.
  const owners = required.map((label) => ({
    label,
    count: prepared.filter((p) => (p.skills.get(skillKey(label))?.level ?? 0) > 0).length,
  }))
  const uncovered = owners.filter((o) => o.count === 0).map((o) => o.label)
  const single = owners.filter((o) => o.count === 1).map((o) => o.label)
  const coverage = required.length ? (required.length - uncovered.length) / required.length : 1

  const skill_coverage: Dim =
    coverage >= 0.9
      ? { status: 'Strong', note: required.length ? 'Every required skill is covered by the team.' : 'No required skills were listed for this project.' }
      : coverage >= 0.6
        ? { status: 'Moderate', note: `Nobody covers: ${uncovered.join(', ')}.` }
        : { status: 'Weak', note: `Most required skills are uncovered: ${uncovered.join(', ')}.` }

  const share = required.length ? single.length / required.length : 0
  const role_dependency: Dim =
    share >= 0.5
      ? { status: 'High', note: `Only one person knows ${single.join(', ')}. If they are away, that work stops.` }
      : share >= 0.25
        ? { status: 'Moderate', note: `Only one person knows ${single.join(', ')}.` }
        : { status: 'Low', note: 'Required skills are shared across more than one member.' }

  // Availability.
  const hours = prepared.map((p) => p.hours).filter((h): h is number => h !== null)
  let availability_risk: Dim
  if (hours.length < 2) {
    availability_risk = { status: 'Moderate', note: 'Most members have not filled in their weekly availability, so this cannot be checked.' }
  } else {
    const max = Math.max(...hours)
    const min = Math.min(...hours)
    const spread = (max - min) / Math.max(max, 1)
    availability_risk =
      spread > 0.6 || min < 3
        ? { status: 'High', note: `Weekly hours range from ${min} to ${max}. Plan around the least available member.` }
        : spread > 0.3
          ? { status: 'Moderate', note: `Weekly hours range from ${min} to ${max}.` }
          : { status: 'Low', note: 'Members have similar weekly availability.' }
  }

  // Experience balance.
  const ranks = prepared.map((p) => p.rank)
  const hasLead = Math.max(...ranks) >= 2
  const variety = new Set(ranks).size
  const experience_balance: Dim = !hasLead
    ? { status: 'Poor', note: 'Everyone is a beginner. Consider adding someone with more experience.' }
    : variety >= 2
      ? { status: 'Good', note: 'The team mixes experience levels, so people can learn from each other.' }
      : { status: 'Fair', note: 'Everyone is at the same experience level.' }

  // Plain-language advice from the weakest area.
  const tips: string[] = []
  if (skill_coverage.status !== 'Strong') tips.push(`Fill the skill gap (${uncovered.join(', ')}) by learning it or inviting a teammate.`)
  if (role_dependency.status !== 'Low') tips.push(`Have a second person learn ${single.join(', ')} so the team is not blocked by one member.`)
  if (availability_risk.status === 'High') tips.push('Split work into small tasks and give the least available member lighter, well-defined ones.')
  if (experience_balance.status === 'Poor') tips.push('Ask a mentor or a more experienced student to review progress weekly.')
  if (tips.length === 0) tips.push('This team looks well balanced. Keep a weekly sync and review the milestones together.')

  return { skill_coverage, availability_risk, role_dependency, experience_balance, ai_suggestion: tips.join(' ') }
}

// ---------------------------------------------------------------------------
// Fallback project analysis, used when Gemini is unavailable or rate limited
// ---------------------------------------------------------------------------
const ROLE_RULES: [RegExp, string][] = [
  [/react|vue|angular|html|css|frontend|tailwind|next/i, 'Frontend Developer'],
  [/node|express|django|flask|backend|java$|spring|api|php/i, 'Backend Developer'],
  [/python|ml|machine|tensorflow|pytorch|ai|data|nlp/i, 'ML / Data Engineer'],
  [/figma|ui|ux|design|adobe/i, 'UI/UX Designer'],
  [/research|writing|survey|analysis/i, 'Researcher'],
  [/sql|mongo|postgres|database|firebase|supabase/i, 'Database Engineer'],
  [/android|flutter|kotlin|swift|react native|ios/i, 'Mobile Developer'],
  [/iot|arduino|embedded|raspberry|hardware/i, 'Embedded / IoT Engineer'],
  [/security|cyber|network/i, 'Security Engineer'],
]

export function fallbackAnalysis(project: ProjectLike, studentSkillLists: string[][]) {
  const required = (project.skills_required ?? []).filter(Boolean)
  const roles = new Set<string>(['Project Lead'])
  for (const skill of required) {
    const rule = ROLE_RULES.find(([re]) => re.test(skill))
    roles.add(rule ? rule[1] : `${skill} Specialist`)
  }
  const gaps = required.filter((skill) => {
    const key = skillKey(skill)
    const have = studentSkillLists.filter((list) => list.some((s) => skillKey(s) === key)).length
    return have < 2
  })
  return {
    identified_roles: [...roles].slice(0, 6),
    skill_gaps: gaps.slice(0, 6),
    sustainability_notes: `Think about who benefits from ${project.name ?? 'this project'}, what resources it needs, and how it can keep running after the first release. Plan maintenance and documentation from the start.`,
  }
}
