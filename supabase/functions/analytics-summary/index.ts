import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, json, requireUser } from '../_shared/http.ts'
import { aiUsage, requireInsights } from '../_shared/entitlements.ts'
import { monthStartUtc } from '../_shared/plans.ts'
import { average, branchMix, skillDemand, summarizeMilestones, summarizeTasks, weeklyActivity } from '../_shared/analytics.ts'

// deno-lint-ignore no-explicit-any
type Row = any

const unique = <T>(list: T[]) => [...new Set(list)]

// Premium analytics: how your projects and teams are doing. College plan owners also get
// analytics for the events they organize. Computed on the server from your own data.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await requireUser(req)
    const admin = adminClient()
    const tier = await requireInsights(admin, user.id, 'Analytics is')
    const now = new Date()

    // Projects the user created or works on, and their teams.
    const { data: created } = await admin.from('projects').select('id, name, domain, status').eq('creator_id', user.id)
    const { data: memberRows } = await admin.from('team_members').select('team_id').eq('student_id', user.id)

    const teamMap = new Map<string, Row>()
    const memberTeamIds = (memberRows ?? []).map((r: Row) => r.team_id)
    if (memberTeamIds.length > 0) {
      const { data } = await admin.from('teams').select('id, project_id, overall_match_score').in('id', memberTeamIds)
      for (const t of data ?? []) teamMap.set(t.id, t)
    }
    const createdIds = (created ?? []).map((p: Row) => p.id)
    if (createdIds.length > 0) {
      const { data } = await admin.from('teams').select('id, project_id, overall_match_score').in('project_id', createdIds)
      for (const t of data ?? []) teamMap.set(t.id, t)
    }
    const teams = [...teamMap.values()]
    const teamIds = teams.map((t) => t.id)

    const projectMap = new Map<string, Row>((created ?? []).map((p: Row) => [p.id, p]))
    const missing = unique(teams.map((t) => t.project_id)).filter((id) => id && !projectMap.has(id))
    if (missing.length > 0) {
      const { data } = await admin.from('projects').select('id, name, domain, status').in('id', missing)
      for (const p of data ?? []) projectMap.set(p.id, p)
    }

    const tasks: Row[] = teamIds.length ? ((await admin.from('tasks').select('team_id, status, deadline, created_at').in('team_id', teamIds)).data ?? []) : []
    const milestones: Row[] = teamIds.length ? ((await admin.from('milestones').select('team_id, status, due_date').in('team_id', teamIds)).data ?? []) : []

    const projects = [...projectMap.values()].map((p) => {
      const ids = new Set(teams.filter((t) => t.project_id === p.id).map((t) => t.id))
      return {
        id: p.id,
        name: p.name,
        domain: p.domain,
        teams: ids.size,
        avgTeamScore: average(teams.filter((t) => ids.has(t.id)).map((t) => t.overall_match_score)),
        tasks: summarizeTasks(tasks.filter((t) => ids.has(t.team_id)), now),
        milestones: summarizeMilestones(milestones.filter((m) => ids.has(m.team_id)), now),
      }
    })

    // AI usage this month.
    const { used, limit } = await aiUsage(admin, user.id)
    const { data: usageRows } = await admin.from('ai_usage').select('kind').eq('user_id', user.id).gte('created_at', monthStartUtc(now))
    const byKind = new Map<string, number>()
    for (const r of usageRows ?? []) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1)

    // Event Organiser analytics are scoped to events created by this account.
    let events = null
    if (tier === 'college') {
      const { data: owned } = await admin.from('events')
        .select('id, name, status, team_size, skills_focus, expected_participants')
        .eq('organizer_id', user.id).order('created_at', { ascending: false }).limit(50)
      const eventMap = new Map<string, Row>()
      for (const ev of owned ?? []) eventMap.set(ev.id, ev)
      events = []
      for (const ev of [...eventMap.values()].slice(0, 50)) {
        const { data: parts } = await admin
          .from('event_participants')
          .select('student_profiles(skills, branch, department)')
          .eq('event_id', ev.id)
        const people = (parts ?? []).map((r: Row) => r.student_profiles).filter(Boolean)
        const { data: formed } = await admin.from('event_teams').select('score').eq('event_id', ev.id)
        events.push({
          id: ev.id,
          name: ev.name,
          status: ev.status,
          participants: people.length,
          teamsFormed: (formed ?? []).length,
          avgTeamScore: average((formed ?? []).map((t: Row) => Number(t.score))),
          skillDemand: skillDemand(ev.skills_focus ?? [], people),
          branches: branchMix(people),
        })
      }
    }

    return json({
      tier,
      overview: {
        projects: projects.length,
        teams: teams.length,
        avgTeamScore: average(teams.map((t) => t.overall_match_score)),
        tasks: summarizeTasks(tasks, now),
        milestones: summarizeMilestones(milestones, now),
      },
      weekly: weeklyActivity(tasks, now, 6),
      projects,
      ai: { used, limit, byKind: [...byKind.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count) },
      events,
    })
  } catch (err) {
    return errorResponse(err)
  }
})
