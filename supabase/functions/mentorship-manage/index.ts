import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireUser, requireUuid } from '../_shared/http.ts'
import { callGeminiJson } from '../_shared/gemini.ts'
import { assertProjectAccess, requireInsights, withAi } from '../_shared/entitlements.ts'
import { STUDENT_COLUMNS } from '../_shared/students.ts'
import { rankMentors, type MentorProfile } from '../_shared/mentors.ts'
import { buildMentorPrompt, cleanText, mergeMatchResults } from '../_shared/aiPrompts.ts'
import type { StudentMatch } from '../_shared/teamInsights.ts'
import type { Student } from '../_shared/teamOptimizer.ts'

// deno-lint-ignore no-explicit-any
type Admin = any

const MENTOR_COLUMNS = `${STUDENT_COLUMNS}, college, mentor_topics, mentor_bio`
const AI_MENTORS = 8
const MAX_OPEN_REQUESTS = 5

async function loadContext(admin: Admin, userId: string, rawProjectId: unknown) {
  const project = rawProjectId ? await assertProjectAccess(admin, userId, requireUuid(rawProjectId, 'project')) : null
  const { data: me } = await admin.from('student_profiles').select(STUDENT_COLUMNS).eq('id', userId).maybeSingle()
  if (!me) throw new HttpError(400, 'Finish your profile first.')
  const { data: mentors } = await admin.from('student_profiles').select(MENTOR_COLUMNS).eq('is_mentor', true).neq('id', userId).limit(200)
  return { project, me: me as Student, mentors: (mentors ?? []) as MentorProfile[] }
}

function present(ranked: StudentMatch[], mentors: MentorProfile[]) {
  const byId = new Map(mentors.map((m) => [m.id, m]))
  return ranked.slice(0, 30).map((r) => {
    const m = byId.get(r.student_id)!
    return {
      id: m.id,
      name: m.name,
      college: m.college ?? null,
      experience: m.experience ?? null,
      skills: (m.skills ?? []).slice(0, 8),
      topics: m.mentor_topics ?? [],
      bio: cleanText(m.mentor_bio, 300),
      score: r.score_percent,
      overlap: r.skill_overlap,
      notes: r.notes,
    }
  })
}

// Mentorship. Anyone can opt in as a mentor (on the Mentors page). Finding and requesting a mentor
// is a Premium feature, enforced here. When a mentor accepts, the two become connections and can message.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')
    const admin = adminClient()

    if (action === 'list' || action === 'match') {
      await requireInsights(admin, user.id, 'Mentorship is')
      const { project, me, mentors } = await loadContext(admin, user.id, body.projectId)
      const goal = project ?? {}
      const ranked = rankMentors(me, mentors, goal)
      if (action === 'list' || ranked.length === 0) return json({ mentors: present(ranked, mentors) })

      // AI-refined ranking of the best candidates (one AI action, rules fallback).
      const byId = new Map(mentors.map((m) => [m.id, m]))
      const outcome = await withAi<StudentMatch[]>(
        admin,
        user.id,
        'mentor',
        async () => {
          const raw = await callGeminiJson<unknown>(
            buildMentorPrompt(me, goal, ranked.slice(0, AI_MENTORS).map((baseline) => ({ mentor: byId.get(baseline.student_id)!, baseline }))),
          )
          return mergeMatchResults(ranked, raw, AI_MENTORS)
        },
        () => ranked,
      )
      return json({ mentors: present(outcome.value, mentors), source: outcome.source, notice: outcome.notice, code: outcome.code })
    }

    if (action === 'request') {
      await requireInsights(admin, user.id, 'Mentorship is')
      const mentorId = requireUuid(body.mentorId, 'mentor')
      if (mentorId === user.id) throw new HttpError(400, 'You cannot mentor yourself.')
      const { data: mentor } = await admin.from('student_profiles').select('id, is_mentor').eq('id', mentorId).maybeSingle()
      if (!mentor?.is_mentor) throw new HttpError(404, 'That person is not a mentor.')

      let projectId: string | null = null
      if (body.projectId) {
        const project = await assertProjectAccess(admin, user.id, requireUuid(body.projectId, 'project'))
        projectId = project.id
      }

      const { count } = await admin.from('mentorship_requests').select('id', { count: 'exact', head: true }).eq('mentee_id', user.id).eq('status', 'pending')
      if ((count ?? 0) >= MAX_OPEN_REQUESTS) throw new HttpError(429, `You already have ${MAX_OPEN_REQUESTS} open requests. Wait for replies or cancel one.`)

      const { error } = await admin.from('mentorship_requests').insert({
        mentee_id: user.id,
        mentor_id: mentorId,
        project_id: projectId,
        message: cleanText(body.message, 500) || null,
      })
      if (error) {
        if (error.code === '23505') throw new HttpError(409, 'You already have an open request with this mentor.')
        throw new Error(error.message)
      }
      return json({ ok: true })
    }

    if (action === 'respond') {
      const requestId = requireUuid(body.requestId, 'request')
      const { data: row } = await admin.from('mentorship_requests').select('*').eq('id', requestId).maybeSingle()
      if (!row || row.mentor_id !== user.id) throw new HttpError(404, 'Request not found.')
      if (row.status !== 'pending') throw new HttpError(409, 'This request was already answered.')

      const accept = body.accept === true
      await admin
        .from('mentorship_requests')
        .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
        .eq('id', requestId)

      if (accept) {
        // Make them connections so the existing Messages page lets them talk.
        const a = row.mentee_id
        const b = row.mentor_id
        const { data: existing } = await admin
          .from('connections')
          .select('id')
          .or(`and(sender_id.eq.${a},receiver_id.eq.${b}),and(sender_id.eq.${b},receiver_id.eq.${a})`)
          .limit(1)
          .maybeSingle()
        if (existing) await admin.from('connections').update({ status: 'accepted' }).eq('id', existing.id)
        else await admin.from('connections').insert({ sender_id: a, receiver_id: b, status: 'accepted' })
      }
      return json({ ok: true, status: accept ? 'accepted' : 'declined' })
    }

    if (action === 'cancel') {
      const requestId = requireUuid(body.requestId, 'request')
      const { data: row } = await admin.from('mentorship_requests').select('*').eq('id', requestId).maybeSingle()
      if (!row || row.mentee_id !== user.id) throw new HttpError(404, 'Request not found.')
      if (row.status !== 'pending') throw new HttpError(409, 'Only open requests can be cancelled.')
      await admin.from('mentorship_requests').update({ status: 'cancelled', responded_at: new Date().toISOString() }).eq('id', requestId)
      return json({ ok: true })
    }

    throw new HttpError(400, 'Unknown action.')
  } catch (err) {
    return errorResponse(err)
  }
})
