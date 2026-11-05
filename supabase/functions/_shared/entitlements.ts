import { HttpError } from './http.ts'
import { activeTier, LIMITS, monthStartUtc, type Tier } from './plans.ts'
import { gateAi, type AiOutcome } from './aiGate.ts'

// deno-lint-ignore no-explicit-any
type Admin = any

export async function getTier(admin: Admin, userId: string): Promise<Tier> {
  const { data } = await admin.from('subscriptions').select('plan_key, status, access_until').eq('user_id', userId)
  const ownTier = activeTier(data ?? []).tier
  if (ownTier === 'college') return 'college'

  // Organiser subscriptions belong directly to the organiser account. There is no
  // workspace membership inheritance in the event-first product model.
  return ownTier
}

// Premium-only features (risk analysis, what-if simulator, analytics, mentorship).
export async function requireInsights(
  admin: Admin,
  userId: string,
  feature = 'Team risk analysis and the what-if simulator are',
): Promise<Tier> {
  const tier = await getTier(admin, userId)
  if (!LIMITS[tier].teamInsights) {
    throw new HttpError(402, `${feature} part of COLLIVRA Premium.`, 'upgrade_required')
  }
  return tier
}

export async function aiUsage(admin: Admin, userId: string): Promise<{ tier: Tier; used: number; limit: number }> {
  const tier = await getTier(admin, userId)
  const { count } = await admin
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', monthStartUtc())
  return { tier, used: count ?? 0, limit: LIMITS[tier].aiActionsPerMonth }
}

// Runs an AI call if the plan allows it. On quota or AI failure it returns the rules-based
// fallback instead of an error, so the screen always works.
export async function withAi<T>(
  admin: Admin,
  userId: string,
  kind: string,
  call: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<AiOutcome<T>> {
  const { tier, used, limit } = await aiUsage(admin, userId)
  return gateAi({
    tier,
    used,
    limit,
    premiumLimit: LIMITS.premium.aiActionsPerMonth,
    call,
    fallback,
    record: async () => {
      await admin.from('ai_usage').insert({ user_id: userId, kind })
    },
  })
}

// Creator or team member of the project.
export async function assertProjectAccess(admin: Admin, userId: string, projectId: string, creatorOnly = false) {
  const { data: project } = await admin.from('projects').select('*').eq('id', projectId).maybeSingle()
  if (!project) throw new HttpError(404, 'Project not found.')
  if (project.creator_id === userId) return project
  if (creatorOnly) throw new HttpError(403, 'Only the project creator can do this.')
  const { data: teams } = await admin.from('teams').select('id').eq('project_id', projectId)
  const teamIds = (teams ?? []).map((t: { id: string }) => t.id)
  if (teamIds.length > 0) {
    const { data: member } = await admin.from('team_members').select('id').in('team_id', teamIds).eq('student_id', userId).limit(1).maybeSingle()
    if (member) return project
  }
  throw new HttpError(403, 'You are not part of this project.')
}
