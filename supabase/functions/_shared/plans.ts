// COLLIVRA plans: the single source of truth on the server.
// A copy for display lives in src/lib/plans.js; scripts/test-plans.mjs checks they match.
// Pure TypeScript (no Deno), so it is unit-tested with plain Node.

export type Tier = 'free' | 'premium' | 'college'

export type PlanDef = {
  key: string
  tier: Tier
  name: string
  price: string // USD, sandbox
  interval: 'MONTH' | 'YEAR'
  envVar: string // function secret that holds the PayPal plan id
}

export const PLAN_DEFS: Record<string, PlanDef> = {
  premium_monthly: { key: 'premium_monthly', tier: 'premium', name: 'Premium for Students (monthly)', price: '2.99', interval: 'MONTH', envVar: 'PAYPAL_PLAN_PREMIUM_MONTHLY' },
  premium_yearly: { key: 'premium_yearly', tier: 'premium', name: 'Premium for Students (yearly)', price: '24.99', interval: 'YEAR', envVar: 'PAYPAL_PLAN_PREMIUM_YEARLY' },
  organiser_monthly: { key: 'organiser_monthly', tier: 'college', name: 'Event Organiser (monthly)', price: '19.00', interval: 'MONTH', envVar: 'PAYPAL_PLAN_INSTITUTION_MONTHLY' },
  organiser_yearly: { key: 'organiser_yearly', tier: 'college', name: 'Event Organiser (yearly)', price: '190.00', interval: 'YEAR', envVar: 'PAYPAL_PLAN_INSTITUTION_YEARLY' },
  institution_monthly: { key: 'institution_monthly', tier: 'college', name: 'Institution (legacy monthly)', price: '19.00', interval: 'MONTH', envVar: 'PAYPAL_PLAN_INSTITUTION_MONTHLY' },
  institution_yearly: { key: 'institution_yearly', tier: 'college', name: 'Institution (legacy yearly)', price: '190.00', interval: 'YEAR', envVar: 'PAYPAL_PLAN_INSTITUTION_YEARLY' },
  organisation_monthly: { key: 'organisation_monthly', tier: 'college', name: 'Organisation (monthly)', price: '29.00', interval: 'MONTH', envVar: 'PAYPAL_PLAN_ORGANISATION_MONTHLY' },
  organisation_yearly: { key: 'organisation_yearly', tier: 'college', name: 'Organisation (yearly)', price: '290.00', interval: 'YEAR', envVar: 'PAYPAL_PLAN_ORGANISATION_YEARLY' },
  // Backward-compatible plan key for subscriptions created before the new catalog.
  college_yearly: { key: 'college_yearly', tier: 'college', name: 'Institution (legacy yearly)', price: '190.00', interval: 'YEAR', envVar: 'PAYPAL_PLAN_COLLEGE_YEARLY' },
}

export const LIMITS: Record<Tier, { aiActionsPerMonth: number; teamInsights: boolean; freeEvents: boolean }> = {
  free: { aiActionsPerMonth: 15, teamInsights: false, freeEvents: false },
  premium: { aiActionsPerMonth: 150, teamInsights: true, freeEvents: false },
  college: { aiActionsPerMonth: 150, teamInsights: true, freeEvents: false },
}

export type SubRow = { plan_key: string; status: string; access_until?: string | null }

// A subscription gives access while PayPal says ACTIVE, or after cancelling until the
// period the user already paid for ends.
export function isActive(row: SubRow, now: Date = new Date()): boolean {
  // Legacy subscription rows may store lowercase status strings.
  const status = String(row.status ?? '').toUpperCase()
  if (status === 'ACTIVE') return true
  if (status === 'CANCELLED' && row.access_until) return new Date(row.access_until).getTime() > now.getTime()
  return false
}

export function activeTier(rows: SubRow[], now: Date = new Date()): { tier: Tier; planKey: string | null } {
  let best: { tier: Tier; planKey: string | null } = { tier: 'free', planKey: null }
  for (const row of rows) {
    const def = PLAN_DEFS[row.plan_key]
    if (!def || !isActive(row, now)) continue
    if (def.tier === 'college') return { tier: 'college', planKey: row.plan_key }
    if (def.tier === 'premium') best = { tier: 'premium', planKey: row.plan_key }
  }
  return best
}

export function monthStartUtc(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}
