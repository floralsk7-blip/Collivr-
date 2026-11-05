import { HttpError } from './http.ts'
import { callGeminiJson } from './gemini.ts'
import { formTeams, type FormedTeam, type Student } from './teamOptimizer.ts'

// deno-lint-ignore no-explicit-any
type Admin = any
type Explanation = { team_index: number; reasoning: string; coaching_notes: string }

function fallbackExplanation(team: FormedTeam, focusCount: number): Explanation {
  const covered = focusCount - team.missingSkills.length
  const reasoning =
    focusCount > 0
      ? `This team covers ${covered} of ${focusCount} focus skills and scores ${team.score}/100 on balance of skills, interests, availability, experience and branch diversity.`
      : `This team scores ${team.score}/100 on balance of skills, interests, availability, experience and branch diversity.`
  const coaching_notes =
    team.missingSkills.length > 0
      ? `Nobody here is strong in ${team.missingSkills.join(', ')}. Plan early for who will learn it or get help.`
      : 'Agree on roles in the first meeting and hold a short weekly sync.'
  return { team_index: team.index, reasoning, coaching_notes }
}

// Forms and saves teams for an event with a captured Event Pass.
// Caller must already have checked that the signed-in user is the organizer.
export async function formTeamsForEvent(
  admin: Admin,
  // deno-lint-ignore no-explicit-any
  event: any,
): Promise<{ teams: number; overallScore: number }> {
  // Event Pass is mandatory for every event, regardless of workspace subscription.
  const { data: paid } = await admin
    .from('payments')
    .select('id')
    .eq('event_id', event.id)
    .eq('status', 'captured')
    .limit(1)
    .maybeSingle()
  if (!paid || !['paid', 'published', 'teams_formed'].includes(event.status)) {
    throw new HttpError(402, 'A successfully captured Event Pass payment is required before team formation.', 'payment_required')
  }

  const { data: rows, error: partError } = await admin
    .from('event_participants')
    .select('student_profiles(id, name, skills, skills_detailed, experience, project_interests, availability_hours, branch, department)')
    .eq('event_id', event.id)
  if (partError) throw new Error(partError.message)

  // deno-lint-ignore no-explicit-any
  const students = (rows ?? []).map((r: any) => r.student_profiles).filter(Boolean) as Student[]
  if (students.length < 2) throw new HttpError(400, 'At least 2 participants are needed to form teams.')

  const spec = {
    domain: event.domain,
    skillsFocus: (event.skills_focus ?? []) as string[],
    teamSize: event.team_size as number,
  }
  const result = formTeams(students, spec)
  const byId = new Map(students.map((s) => [s.id, s]))

  // Gemini explains; a fallback keeps a Gemini outage from blocking a paid event.
  let explanations: Explanation[] = result.teams.map((t) => fallbackExplanation(t, spec.skillsFocus.length))
  try {
    const prompt = `You are a coach for student hackathon teams. The teams below were already formed and scored by a deterministic optimizer. Do NOT change members or scores.
For each team write "reasoning" (2 sentences on why this combination works, naming real skills, and mentioning any missing skill) and "coaching_notes" (1-2 actionable sentences).

Event: ${JSON.stringify({ name: event.name, domain: event.domain, focus_skills: spec.skillsFocus })}
Teams: ${JSON.stringify(
      result.teams.map((t) => ({
        team_index: t.index,
        score: t.score,
        breakdown: t.breakdown,
        missing_skills: t.missingSkills,
        members: t.memberIds.map((id) => ({
          name: byId.get(id)?.name,
          role: t.roles[id],
          skills: (byId.get(id)?.skills ?? []).slice(0, 6),
          experience: byId.get(id)?.experience,
        })),
      })),
    )}

Return ONLY a JSON array, one item per team: [{"team_index":1,"reasoning":"...","coaching_notes":"..."}]`
    const ai = await callGeminiJson<Explanation[]>(prompt)
    if (Array.isArray(ai)) {
      explanations = explanations.map((fb) => {
        const hit = ai.find((x) => Number(x?.team_index) === fb.team_index)
        return hit && typeof hit.reasoning === 'string' && typeof hit.coaching_notes === 'string'
          ? { team_index: fb.team_index, reasoning: hit.reasoning, coaching_notes: hit.coaching_notes }
          : fb
      })
    }
  } catch (err) {
    console.error('Gemini explanation failed, using fallback text:', err)
  }

  await admin.from('event_teams').delete().eq('event_id', event.id)

  for (const team of result.teams) {
    const ex = explanations.find((e) => e.team_index === team.index)!
    const { data: row, error: teamError } = await admin
      .from('event_teams')
      .insert({
        event_id: event.id,
        team_index: team.index,
        score: team.score,
        score_breakdown: team.breakdown,
        missing_skills: team.missingSkills,
        reasoning: ex.reasoning,
        coaching_notes: ex.coaching_notes,
      })
      .select('id')
      .single()
    if (teamError) throw new Error(teamError.message)

    const { error: memberError } = await admin.from('event_team_members').insert(
      team.memberIds.map((studentId) => ({
        event_team_id: row.id,
        student_id: studentId,
        role: team.roles[studentId] ?? null,
      })),
    )
    if (memberError) throw new Error(memberError.message)
  }

  await admin.from('events').update({ status: 'teams_formed' }).eq('id', event.id)
  return { teams: result.teams.length, overallScore: result.overallScore }
}
