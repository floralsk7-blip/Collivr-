import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, json, requireUser } from '../_shared/http.ts'
import { aiUsage, requireInsights, getTier } from '../_shared/entitlements.ts'
import { monthStartUtc } from '../_shared/plans.ts'
import { average, branchMix, skillDemand, summarizeMilestones, summarizeTasks, weeklyActivity } from '../_shared/analytics.ts'

// deno-lint-ignore no-explicit-any
type Row = any

const unique = <T>(list: T[]) => [...new Set(list)]

// Analytics: Event Organisers receive full analytics for their events without requiring
// Student Premium. Students require Student Premium for project and AI analytics.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await requireUser(req)
    const admin = adminClient()
    const now = new Date()

    // Determine account role from profile
    const { data: profile } = await admin
      .from('student_profiles')
      .select('id, account_type')
      .eq('id', user.id)
      .maybeSingle()

    const isOrganiser = profile?.account_type === 'organiser' ||
      profile?.account_type === 'institution' ||
      profile?.account_type === 'organisation'

    // -------------------------------------------------------------------------
    // EVENT ORGANISER ANALYTICS (No Student Premium required)
    // -------------------------------------------------------------------------
    if (isOrganiser) {
      // Query events strictly owned by this organiser account
      const { data: owned, error: eventErr } = await admin
        .from('events')
        .select('id, name, status, team_size, skills_focus, expected_participants, created_at, paid_at')
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (eventErr) throw new Error(eventErr.message)

      const eventList = owned ?? []
      const eventIds = eventList.map((e: Row) => e.id)

      let allParticipantRows: Row[] = []
      let allTeams: Row[] = []

      if (eventIds.length > 0) {
        const [partsRes, teamsRes] = await Promise.all([
          admin
            .from('event_participants')
            .select('id, event_id, student_id, joined_at, student_profiles(skills, branch, department)')
            .in('event_id', eventIds),
          admin
            .from('event_teams')
            .select('id, event_id, score, created_at')
            .in('event_id', eventIds),
        ])
        allParticipantRows = partsRes.data ?? []
        allTeams = teamsRes.data ?? []
      }

      // Group participants and teams by event_id
      const participantsByEvent = new Map<string, Row[]>()
      for (const p of allParticipantRows) {
        if (!participantsByEvent.has(p.event_id)) participantsByEvent.set(p.event_id, [])
        participantsByEvent.get(p.event_id)!.push(p)
      }

      const teamsByEvent = new Map<string, Row[]>()
      for (const t of allTeams) {
        if (!teamsByEvent.has(t.event_id)) teamsByEvent.set(t.event_id, [])
        teamsByEvent.get(t.event_id)!.push(t)
      }

      const detailedEvents = eventList.map((ev: Row) => {
        const parts = participantsByEvent.get(ev.id) ?? []
        const teams = teamsByEvent.get(ev.id) ?? []
        const people = parts.map((r: Row) => r.student_profiles).filter(Boolean)

        return {
          id: ev.id,
          name: ev.name,
          status: ev.status,
          created_at: ev.created_at,
          paid_at: ev.paid_at,
          participants: parts.length,
          teamsFormed: teams.length,
          avgTeamScore: average(teams.map((t: Row) => Number(t.score))),
          skillDemand: skillDemand(ev.skills_focus ?? [], people),
          branches: branchMix(people),
        }
      })

      const totalEvents = eventList.length
      const publishedEvents = eventList.filter((e: Row) => ['published', 'teams_formed'].includes(e.status)).length
      const draftEvents = eventList.filter((e: Row) => ['draft', 'pending_payment'].includes(e.status)).length
      const totalRegistrations = allParticipantRows.length
      const totalTeamsFormed = allTeams.length
      const allScores = allTeams.map((t: Row) => Number(t.score)).filter((n) => Number.isFinite(n))
      const averageTeamScore = average(allScores)

      // Registration trend over time (using joined_at timestamps)
      const regEventsForWeekly = allParticipantRows.map((p: Row) => ({ created_at: p.joined_at }))
      const weekly = weeklyActivity(regEventsForWeekly, now, 6)

      return json({
        accountType: 'organiser',
        tier: 'college',
        overview: {
          totalEvents,
          publishedEvents,
          draftEvents,
          totalRegistrations,
          totalTeamsFormed,
          averageTeamScore,
        },
        events: detailedEvents,
        weekly,
      })
    }

    // -------------------------------------------------------------------------
    // STUDENT ACCOUNT ANALYTICS (Requires Student Premium subscription)
    // -------------------------------------------------------------------------
    const tier = await requireInsights(admin, user.id, 'Analytics is')

    // Projects the student created or works on, and their teams.
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

    return json({
      accountType: 'student',
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
      events: null,
    })
  } catch (err) {
    return errorResponse(err)
  }
})
