// Display copy of supabase/functions/_shared/plans.ts. The SERVER enforces everything.
// scripts/test-plans.mjs fails if the two ever disagree.
export const PLAN_DEFS = {
  premium_monthly: { key: 'premium_monthly', tier: 'premium', name: 'Premium for Students (monthly)', price: '2.99', interval: 'MONTH' },
  premium_yearly: { key: 'premium_yearly', tier: 'premium', name: 'Premium for Students (yearly)', price: '24.99', interval: 'YEAR' },
  organiser_monthly: { key: 'organiser_monthly', tier: 'college', name: 'Event Organiser (monthly)', price: '19.00', interval: 'MONTH' },
  organiser_yearly: { key: 'organiser_yearly', tier: 'college', name: 'Event Organiser (yearly)', price: '190.00', interval: 'YEAR' },
  institution_monthly: { key: 'institution_monthly', tier: 'college', name: 'Institution (legacy monthly)', price: '19.00', interval: 'MONTH' },
  institution_yearly: { key: 'institution_yearly', tier: 'college', name: 'Institution (legacy yearly)', price: '190.00', interval: 'YEAR' },
  organisation_monthly: { key: 'organisation_monthly', tier: 'college', name: 'Organisation (monthly)', price: '29.00', interval: 'MONTH' },
  organisation_yearly: { key: 'organisation_yearly', tier: 'college', name: 'Organisation (yearly)', price: '290.00', interval: 'YEAR' },
  // Legacy key retained for existing institutional subscriptions.
  college_yearly: { key: 'college_yearly', tier: 'college', name: 'Institution (legacy yearly)', price: '190.00', interval: 'YEAR' },
}

export const LIMITS = {
  free: { aiActionsPerMonth: 15, teamInsights: false, freeEvents: false },
  premium: { aiActionsPerMonth: 150, teamInsights: true, freeEvents: false },
  college: { aiActionsPerMonth: 150, teamInsights: true, freeEvents: false },
}

export const TIER_LABEL = { free: 'Free', premium: 'Premium', college: 'Event Organiser' }

export function isActive(row, now = new Date()) {
  // Normalise PayPal/database status values because legacy rows may contain
  // lowercase values while current webhook writes use uppercase values.
  const status = String(row.status || '').toUpperCase()
  if (status === 'ACTIVE') return true
  if (status === 'CANCELLED' && row.access_until) return new Date(row.access_until).getTime() > now.getTime()
  return false
}

export function activeTier(rows, now = new Date()) {
  let best = { tier: 'free', planKey: null }
  for (const row of rows) {
    const def = PLAN_DEFS[row.plan_key]
    if (!def || !isActive(row, now)) continue
    if (def.tier === 'college') return { tier: 'college', planKey: row.plan_key }
    if (def.tier === 'premium') best = { tier: 'premium', planKey: row.plan_key }
  }
  return best
}

export function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

// The five offers on the Business Model slide, in the same order and with the same names.
// Only list things the app actually does.
export const PLAN_COPY = {
  free: {
    name: 'Free for Students',
    tag: 'Free',
    blurb: 'Basic team matching, profile creation.',
    features: [
      'Profile, skills and portfolio links',
      'Basic team matching, unlimited',
      'Find people and projects',
      'Connect with students and discover projects',
      `${LIMITS.free.aiActionsPerMonth} AI actions a month to try the AI features`,
      'Join events',
    ],
  },
  premium: {
    name: 'Premium for Students',
    tag: 'Premium',
    blurb: 'Advanced AI, analytics, mentorship.',
    features: [
      'Everything in Free',
      `Advanced AI: ${LIMITS.premium.aiActionsPerMonth} AI actions a month, AI risk analysis, what-if simulator`,
      'Advanced project insights and progress analytics',
      'Mentorship: request mentors, AI-matched to your project',
    ],
  },
  college: {
    name: 'Event Organiser',
    tag: 'Free account',
    blurb: 'Create event drafts for free and pay once when each event is ready to publish.',
    features: [
      'Free organiser profile and dashboard',
      'Create, edit and preview event drafts',
      'Pay a one-time Event Pass only when publishing an event',
    ],
  },
  hackathon: {
    name: 'Event Pass',
    tag: 'One-time payment',
    blurb: 'A one-time Event Pass for each event, based on its workflow complexity.',
    features: [
      'A one-time plan selected by event workflow complexity',
      'Event setup, participant management and event workflows',
      'Paid once per event with PayPal',
    ],
  },
  organization: {
    name: 'Enterprise',
    tag: 'Custom',
    blurb: 'Team-building for innovation projects.',
    features: ['Custom event volume', 'Tailored onboarding', 'Request a quote and we will contact you'],
  },
}
