// Aggregations behind the Premium analytics dashboard. Pure TypeScript (no Deno, no network),
// unit-tested with plain Node (see scripts/test-analytics.mjs).

export type TaskRow = { team_id?: string | null; status?: string | null; deadline?: string | null; created_at?: string | null }
export type MilestoneRow = { team_id?: string | null; status?: string | null; due_date?: string | null }

const rate = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100))
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export function summarizeTasks(tasks: TaskRow[], now: Date = new Date()) {
  const today = isoDay(now)
  const done = tasks.filter((t) => t.status === 'done').length
  const overdue = tasks.filter((t) => t.status !== 'done' && !!t.deadline && String(t.deadline).slice(0, 10) < today).length
  return { total: tasks.length, done, open: tasks.length - done, overdue, completionRate: rate(done, tasks.length) }
}

export function summarizeMilestones(milestones: MilestoneRow[], now: Date = new Date()) {
  const today = isoDay(now)
  const done = milestones.filter((m) => m.status === 'done').length
  const current = milestones.filter((m) => m.status === 'current').length
  const overdue = milestones.filter((m) => m.status !== 'done' && !!m.due_date && String(m.due_date).slice(0, 10) < today).length
  return { total: milestones.length, done, current, overdue, completionRate: rate(done, milestones.length) }
}

// Tasks added per week for the last N weeks (weeks start on Monday, UTC), oldest first.
export function weeklyActivity(tasks: TaskRow[], now: Date = new Date(), weeks = 6): { weekStart: string; added: number }[] {
  const startOfWeek = (d: Date) => {
    const day = (d.getUTCDay() + 6) % 7 // Monday = 0
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day))
  }
  const current = startOfWeek(now)
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(current.getTime() - (weeks - 1 - i) * 7 * 86400000)
    return { weekStart: isoDay(start), startMs: start.getTime(), added: 0 }
  })
  for (const t of tasks) {
    if (!t.created_at) continue
    const ms = startOfWeek(new Date(t.created_at)).getTime()
    const bucket = buckets.find((b) => b.startMs === ms)
    if (bucket) bucket.added++
  }
  return buckets.map(({ weekStart, added }) => ({ weekStart, added }))
}

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[\s.\-_/]/g, '')

// How many participants have each skill an event asked for (shows the batch's skill gaps).
export function skillDemand(skillsFocus: string[], people: { skills?: string[] | null }[]) {
  return skillsFocus.map((skill) => {
    const have = people.filter((p) => (p.skills ?? []).some((s) => norm(s) === norm(skill))).length
    return { skill, have, share: rate(have, people.length) }
  })
}

export function branchMix(people: { branch?: string | null; department?: string | null }[]) {
  const counts = new Map<string, number>()
  for (const p of people) {
    const key = (p.branch || p.department || 'Not set').trim() || 'Not set'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].map(([branch, count]) => ({ branch, count })).sort((a, b) => b.count - a.count || a.branch.localeCompare(b.branch))
}

export function average(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return nums.length === 0 ? null : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}
