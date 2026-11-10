// Checks that the server and browser copies of plans and prices agree, and that entitlements behave.
// Run: npm run test:plans  (Node 22.18+)
import assert from 'node:assert/strict'
import * as server from '../supabase/functions/_shared/plans.ts'
import * as client from '../src/lib/plans.js'
import { TIERS as serverTiers, quotePrice } from '../supabase/functions/_shared/pricing.ts'
import { TIERS as clientTiers, quotePrice as clientQuote } from '../src/lib/pricing.js'

// 1. Catalogs match (ignoring the server-only envVar)
for (const [key, def] of Object.entries(server.PLAN_DEFS)) {
  const { envVar, ...rest } = def
  assert.ok(envVar.startsWith('PAYPAL_PLAN_'), key)
  assert.deepEqual(client.PLAN_DEFS[key], rest, `plan ${key} differs`)
}
assert.deepEqual(Object.keys(client.PLAN_DEFS), Object.keys(server.PLAN_DEFS))
assert.deepEqual(client.LIMITS, server.LIMITS)
assert.deepEqual(clientTiers, Object.values(serverTiers))
for (const tier of ['standard', 'advanced', 'complex']) assert.equal(clientQuote(tier).price, quotePrice(tier).price)
assert.equal(quotePrice('standard').price, '9.00')
assert.equal(quotePrice('advanced').price, '19.00')
assert.equal(quotePrice('complex').price, '39.00')
assert.equal(quotePrice('unknown').price, '9.00')

// 2. Entitlements, same logic on both sides
const now = new Date('2026-11-10T00:00:00Z')
for (const lib of [server, client]) {
  assert.equal(lib.activeTier([], now).tier, 'free')
  assert.equal(lib.activeTier([{ plan_key: 'premium_monthly', status: 'ACTIVE' }], now).tier, 'premium')
  assert.equal(lib.activeTier([{ plan_key: 'college_yearly', status: 'ACTIVE' }], now).tier, 'college')
  // cancelled keeps access until the paid period ends, then drops
  assert.equal(lib.activeTier([{ plan_key: 'premium_monthly', status: 'CANCELLED', access_until: '2026-11-20T00:00:00Z' }], now).tier, 'premium')
  assert.equal(lib.activeTier([{ plan_key: 'premium_monthly', status: 'CANCELLED', access_until: '2026-11-01T00:00:00Z' }], now).tier, 'free')
  assert.equal(lib.activeTier([{ plan_key: 'premium_monthly', status: 'CANCELLED' }], now).tier, 'free')
  // anything that is not ACTIVE gives nothing
  for (const status of ['APPROVAL_PENDING', 'APPROVED', 'SUSPENDED', 'EXPIRED']) {
    assert.equal(lib.activeTier([{ plan_key: 'premium_yearly', status }], now).tier, 'free', status)
  }
  // unknown plans are ignored; college beats premium
  assert.equal(lib.activeTier([{ plan_key: 'made_up', status: 'ACTIVE' }], now).tier, 'free')
  assert.equal(lib.activeTier([{ plan_key: 'premium_yearly', status: 'ACTIVE' }, { plan_key: 'college_yearly', status: 'ACTIVE' }], now).tier, 'college')
  assert.equal(lib.monthStartUtc(now), '2026-11-01T00:00:00.000Z')
}

// 3. Business rules the pricing page promises
assert.equal(server.PLAN_DEFS.organiser_monthly.price, '19.00')
assert.equal(server.PLAN_DEFS.organiser_yearly.price, '190.00')
assert.equal(server.PLAN_DEFS.organiser_monthly.envVar, 'PAYPAL_PLAN_INSTITUTION_MONTHLY')
assert.equal(server.PLAN_DEFS.organiser_yearly.envVar, 'PAYPAL_PLAN_INSTITUTION_YEARLY')
assert.equal(server.activeTier([{ plan_key: 'organiser_monthly', status: 'ACTIVE' }], now).tier, 'college')
assert.equal(server.LIMITS.free.teamInsights, false)
assert.equal(server.LIMITS.premium.teamInsights, true)
assert.equal(server.LIMITS.college.freeEvents, false) // Event Pass is always paid per event
assert.equal(server.LIMITS.premium.freeEvents, false)
assert.ok(server.LIMITS.premium.aiActionsPerMonth > server.LIMITS.free.aiActionsPerMonth)
// Event Pass pricing is complexity-based, not participant-count based.

console.log('ok - plans, prices and entitlements agree on server and browser')
