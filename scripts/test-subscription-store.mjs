// Tests the shared subscription store: authoritative entitlement, no false downgrades,
// stale-response protection, sign out / sign in. Run: npm run test:subscription-store
import assert from 'node:assert/strict'
import { createSubscriptionStore } from '../src/lib/subscriptionStore.js'
import * as server from '../supabase/functions/_shared/plans.ts'

const monthly = { tier: 'premium', planKey: 'premium_monthly', status: 'ACTIVE', accessUntil: '2026-12-08T10:00:00+00:00', subscriptionId: 'I-XLJ8JKJTRC7M' }
const yearly = { tier: 'premium', planKey: 'premium_yearly', status: 'ACTIVE', accessUntil: '2027-11-08T10:00:00+00:00', subscriptionId: 'I-YEARLY0001' }
const free = { tier: 'free', planKey: null, status: null, accessUntil: null, subscriptionId: null }
const now = () => new Date('2026-11-08T12:00:00Z')
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) } }
const mk = (fetchEntitlement, extra = {}) => createSubscriptionStore({ fetchEntitlement, storage: memory(), now, ...extra })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

// 0. Backend entitlement derivation for rows shaped like the real DB rows (monthly + yearly, free)
for (const [plan, expect] of [['premium_monthly', 'premium'], ['premium_yearly', 'premium']]) {
  const rows = [{ plan_key: plan, status: 'ACTIVE', access_until: '2026-12-08T10:00:00+00:00' }]
  assert.equal(server.activeTier(rows, now()).tier, expect, plan)
}
assert.equal(server.activeTier([], now()).tier, 'free')
assert.equal(server.activeTier([{ plan_key: 'premium_monthly', status: 'active' }], now()).tier, 'premium') // legacy lowercase

// 1. Monthly and yearly are recognised from the server entitlement
for (const ent of [monthly, yearly]) {
  const s = mk(async () => ent)
  s.setUser('u1'); await s.refresh()
  assert.equal(s.getState().tier, 'premium'); assert.equal(s.getState().planKey, ent.planKey)
  assert.equal(s.getState().aiLimit, 150); assert.equal(s.getState().loading, false)
}

// 2. Free account stays Free
{ const s = mk(async () => free); s.setUser('u2'); await s.refresh(); assert.equal(s.getState().tier, 'free'); assert.equal(s.getState().resolved, true) }

// 3. Temporary API errors never downgrade Premium
{
  let fail = false
  const s = mk(async () => { if (fail) throw new Error('Could not reach the server'); return monthly })
  s.setUser('u1'); await s.refresh()
  fail = true; await s.refresh()
  assert.equal(s.getState().tier, 'premium'); assert.ok(s.getState().error)
  // malformed / empty response also keeps Premium
  const t = mk(async () => ({}))
  t.setUser('u1'); t.apply(monthly); await t.refresh()
  assert.equal(t.getState().tier, 'premium')
}

// 4. Loading never shows a wrong downgrade: cached Premium is shown immediately on reload
{
  const storage = memory()
  const a = createSubscriptionStore({ fetchEntitlement: async () => monthly, storage, now })
  a.setUser('u1'); await a.refresh()
  const gate = deferred()
  const b = createSubscriptionStore({ fetchEntitlement: () => gate.promise, storage, now })
  b.setUser('u1')
  assert.equal(b.getState().tier, 'premium'); assert.equal(b.getState().loading, true)
  gate.reject(new Error('offline')); await b.refresh().catch(() => {})
  assert.equal(b.getState().tier, 'premium')
  // cache for a different user is ignored
  const c = createSubscriptionStore({ fetchEntitlement: async () => free, storage, now })
  c.setUser('someone-else'); assert.equal(c.getState().tier, 'free')
}

// 5. Stale responses cannot overwrite newer state
{
  const slow = deferred()
  let call = 0
  const s = mk(() => (++call === 1 ? slow.promise : Promise.resolve(monthly)))
  s.setUser('u1')
  const first = s.refresh()           // slow, would say "free"
  s.apply(monthly)                    // activation result arrives first
  slow.resolve(free); await first
  assert.equal(s.getState().tier, 'premium', 'stale free response must be discarded')
}

// 6. Sign out / sign in as another user / sign back in
{
  const byUser = { u1: monthly, u2: free }
  const s = mk(async (id) => byUser[id])
  s.setUser('u1'); await s.refresh(); assert.equal(s.getState().tier, 'premium')
  s.setUser(null); assert.equal(s.getState().tier, 'free'); assert.equal(s.getState().userId, null)
  s.setUser('u2'); await s.refresh(); assert.equal(s.getState().tier, 'free')
  s.setUser('u1'); await s.refresh(); assert.equal(s.getState().tier, 'premium')
  // a response for a previous user is dropped
  const gate = deferred()
  const t = mk((id) => (id === 'u1' ? gate.promise : Promise.resolve(free)))
  t.setUser('u1'); const p = t.refresh(); t.setUser('u2'); gate.resolve(monthly); await p
  assert.equal(t.getState().userId, 'u2'); assert.equal(t.getState().tier, 'free')
}

// 7. A successful authoritative Free answer does downgrade (e.g. subscription expired)
{ const s = mk(async () => free); s.setUser('u1'); s.apply(monthly); await s.refresh(); assert.equal(s.getState().tier, 'free') }

// 8. Fallback (direct table read) is used only when nothing is known and the server failed
{
  const s = mk(async () => { throw new Error('down') }, { fetchFallbackEntitlement: async () => monthly })
  s.setUser('u1'); await s.refresh(); assert.equal(s.getState().tier, 'premium')
  const t = mk(async () => { throw new Error('down') }, { fetchFallbackEntitlement: async () => free })
  t.setUser('u1'); t.apply(monthly); await t.refresh(); assert.equal(t.getState().tier, 'premium')
}

// 9. Expired cancelled cache is not trusted
{
  const storage = memory()
  storage.setItem('collivra.entitlement.v1', JSON.stringify({ userId: 'u1', entitlement: { ...monthly, status: 'CANCELLED', accessUntil: '2026-11-01T00:00:00Z' } }))
  const s = createSubscriptionStore({ fetchEntitlement: async () => free, storage, now })
  s.setUser('u1'); assert.equal(s.getState().tier, 'free')
}

console.log('subscription store tests passed')
