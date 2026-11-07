// Mentor ranking for the Premium mentorship feature. Pure TypeScript, unit-tested with plain Node.
// Weights: skills the mentee needs 60, mentor seniority 25, topic / domain fit 15.
// When project skill gaps are present: gap coverage 35, general skills 30, seniority 20, domain 15.

import { skillKey, type Student } from './teamOptimizer.ts'
import type { StudentMatch } from './teamInsights.ts'

export type MentorProfile = Student & { mentor_topics?: string[] | null; mentor_bio?: string | null; college?: string | null }

const RANK: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 }
const RANK_NAME = ['', 'Beginner', 'Intermediate', 'Advanced']
const rankOf = (e?: string | null) => RANK[String(e ?? 'intermediate').toLowerCase()] ?? 2

// student_id in the result is the MENTOR's id, so the same merge and prompt code as matching works.
export function rankMentors(
  mentee: Student,
  mentors: MentorProfile[],
  goal: { domain?: string | null; skills_required?: string[] | null; skill_gaps?: string[] | null } = {},
): StudentMatch[] {
  const goalSkills = (goal.skills_required?.length ? goal.skills_required : (mentee.skills ?? []).slice(0, 6)).filter(Boolean)
  const goalGaps = (goal.skill_gaps ?? []).filter(Boolean)
  const domainKey = skillKey(goal.domain ?? '')
  const menteeInterests = new Set((mentee.project_interests ?? []).map(skillKey))
  const menteeRank = rankOf(mentee.experience)

  const ranked = mentors
    .filter((m) => m.id !== mentee.id)
    .map((m) => {
      const knows = new Set([...(m.skills ?? []), ...(m.mentor_topics ?? [])].map(skillKey))
      const covered = goalSkills.filter((s) => knows.has(skillKey(s)))
      const coveredGaps = goalGaps.filter((g) => knows.has(skillKey(g)))
      const skillPart = goalSkills.length ? covered.length / goalSkills.length : 0.5

      const diff = rankOf(m.experience) - menteeRank
      const seniorPart = diff >= 1 ? 1 : diff === 0 ? 0.6 : 0.2

      const topics = new Set((m.mentor_topics ?? []).map(skillKey))
      const domainPart = domainKey && topics.has(domainKey)
        ? 1
        : [...menteeInterests].some((i) => topics.has(i))
          ? 0.7
          : domainKey || menteeInterests.size > 0
            ? 0.3
            : 0.5

      let score: number
      if (goalGaps.length > 0) {
        const gapPart = coveredGaps.length / goalGaps.length
        score = Math.round(100 * (0.35 * gapPart + 0.3 * skillPart + 0.2 * seniorPart + 0.15 * domainPart))
      } else {
        score = Math.round(100 * (0.6 * skillPart + 0.25 * seniorPart + 0.15 * domainPart))
      }

      let notes = ''
      if (coveredGaps.length > 0) {
        notes += `Addresses project skill gaps: ${coveredGaps.join(', ')}. `
      }
      if (covered.length > 0) {
        notes += `Can help with ${covered.join(', ')}.`
      } else if (coveredGaps.length === 0) {
        notes += 'No direct skill overlap, but can offer general guidance.'
      }
      notes += ` ${RANK_NAME[rankOf(m.experience)]} experience.`
      if (domainKey && topics.has(domainKey)) {
        notes += ` Mentors on ${goal.domain}.`
      }

      const allCovered = [...new Set([...covered, ...coveredGaps])]
      return { student_id: m.id, score_percent: score, skill_overlap: allCovered, notes: notes.trim(), name: m.name ?? '' }
    })

  return ranked
    .sort((a, b) => b.score_percent - a.score_percent || a.name.localeCompare(b.name))
    .map(({ name: _name, ...rest }) => rest)
}
