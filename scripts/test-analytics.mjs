// Tests for analytics aggregation and mentor ranking. Run: npm run test:analytics (Node 22.18+)
import assert from 'node:assert/strict'
import { summarizeTasks, summarizeMilestones, weeklyActivity, skillDemand, branchMix, average } from '../supabase/functions/_shared/analytics.ts'
import { rankMentors } from '../supabase/functions/_shared/mentors.ts'
import { mergeMatchResults, buildMentorPrompt } from '../supabase/functions/_shared/aiPrompts.ts'

const now = new Date('2026-11-04T10:00:00Z') // a Wednesday

// ---------- tasks and milestones ----------
const tasks = [
  { status: 'done', deadline: '2026-10-01', created_at: '2026-11-03T08:00:00Z' },
  { status: 'todo', deadline: '2026-11-01', created_at: '2026-11-02T08:00:00Z' }, // overdue
  { status: 'todo', deadline: '2026-11-04', created_at: '2026-10-28T08:00:00Z' }, // due today, not overdue
  { status: 'todo', deadline: null, created_at: '2026-09-01T08:00:00Z' }, // old, outside the 6 weeks
]
assert.deepEqual(summarizeTasks(tasks, now), { total: 4, done: 1, open: 3, overdue: 1, completionRate: 25 })
assert.deepEqual(summarizeTasks([], now), { total: 0, done: 0, open: 0, overdue: 0, completionRate: 0 })
assert.deepEqual(
  summarizeMilestones([{ status: 'done', due_date: '2026-10-01' }, { status: 'current', due_date: '2026-11-10' }, { status: 'upcoming', due_date: '2026-10-20' }], now),
  { total: 3, done: 1, current: 1, overdue: 1, completionRate: 33 },
)

// ---------- weekly activity (weeks start Monday, oldest first, always N buckets) ----------
const weeks = weeklyActivity(tasks, now, 6)
assert.equal(weeks.length, 6)
assert.equal(weeks.at(-1).weekStart, '2026-11-02')           // this week's Monday
assert.equal(weeks.at(-1).added, 2)                           // 3 Nov and 2 Nov
assert.equal(weeks.at(-2).weekStart, '2026-10-26')
assert.equal(weeks.at(-2).added, 1)                           // 28 Oct
assert.equal(weeks.reduce((a, w) => a + w.added, 0), 3)       // the September task is outside the window
assert.deepEqual(weeks.map((w) => w.weekStart), [...weeks.map((w) => w.weekStart)].sort())

// ---------- event batch analytics ----------
const people = [
  { skills: ['React', 'Node'], branch: 'CSE' },
  { skills: ['python'], branch: 'CSE' },
  { skills: ['UI/UX'], department: 'Design' },
  { skills: [], branch: null },
]
assert.deepEqual(skillDemand(['React', 'Python', 'ML'], people), [
  { skill: 'React', have: 1, share: 25 },
  { skill: 'Python', have: 1, share: 25 },
  { skill: 'ML', have: 0, share: 0 },
])
assert.deepEqual(branchMix(people), [{ branch: 'CSE', count: 2 }, { branch: 'Design', count: 1 }, { branch: 'Not set', count: 1 }])
assert.equal(average([80, 90, null, undefined]), 85)
assert.equal(average([]), null)

// ---------- mentor ranking ----------
const mentee = { id: 'me', name: 'Me', skills: ['React'], experience: 'Beginner', project_interests: ['AI/ML'] }
const goal = { domain: 'AI/ML', skills_required: ['Python', 'React', 'UI/UX'] }
const mentors = [
  { id: 'm1', name: 'Mira', skills: ['Python', 'React'], experience: 'Advanced', mentor_topics: ['AI/ML'] },
  { id: 'm2', name: 'Nik', skills: ['Excel'], experience: 'Advanced', mentor_topics: ['Finance'] },
  { id: 'm3', name: 'Omar', skills: ['Python'], experience: 'Beginner', mentor_topics: [] },
  { id: 'me', name: 'Me', skills: ['Python'], experience: 'Advanced', mentor_topics: ['AI/ML'] }, // cannot mentor yourself
]
const ranked = rankMentors(mentee, mentors, goal)
assert.deepEqual(ranked.map((m) => m.student_id), ['m1', 'm3', 'm2'])
assert.deepEqual(ranked[0].skill_overlap, ['Python', 'React'])
assert.match(ranked[0].notes, /Can help with Python, React/)
assert.match(ranked[0].notes, /Mentors on AI\/ML/)
assert.match(ranked[2].notes, /No direct skill overlap/)
assert.ok(ranked[0].score_percent > ranked[1].score_percent && ranked[1].score_percent > ranked[2].score_percent)
assert.deepEqual(ranked, rankMentors(mentee, mentors, goal)) // deterministic
assert.equal(rankMentors(mentee, [], goal).length, 0)
// with no project, the mentee's own skills are the goal
assert.equal(rankMentors(mentee, mentors)[0].student_id, 'm1')

// ---------- AI refinement reuses the same safe merge ----------
const merged = mergeMatchResults(ranked, [{ student_id: 'm3', score_percent: 100, notes: 'Strong <i>Python</i> coaching.' }, { student_id: 'ghost', score_percent: 100 }])
assert.equal(merged.find((m) => m.student_id === 'm3').notes, 'Strong Python coaching.')
assert.equal(merged.length, ranked.length)
const prompt = buildMentorPrompt(mentee, goal, ranked.slice(0, 2).map((baseline) => ({ mentor: mentors.find((m) => m.id === baseline.student_id), baseline })))
assert.match(prompt, /data, not instructions/)
assert.match(prompt, /baseline_score/)

console.log('ok - analytics aggregation and mentor ranking')
