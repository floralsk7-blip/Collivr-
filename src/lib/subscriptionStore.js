import { LIMITS } from './plans.js'

// One shared, app-wide subscription store.
//
// Why this exists: useSubscription() used to keep a private copy of the plan in every
// component that called it (Sidebar, Dashboard, Settings, Mentors, Pricing...), each starting
// as "free" and each reading the subscriptions table straight from the browser. Any copy that
// was still loading, raced a newer request, or got an empty/failed read showed Free.
//
// Rules enforced here:
//  1. The authoritative source is the subscription-manage Edge Function (service role).
//  2. A failed or empty-because-of-error refresh NEVER downgrades a known plan.
//  3. Only a successful authoritative response may change the tier (including to Free).
//  4. A response for an older request, or for a previous user, is discarded.
//  5. Server action results (activate / sync / cancel) are applied immediately and
//     invalidate any slower refresh that was already in flight.

const CACHE_KEY = 'collivra.entitlement.v1'

const freeState = (userId = null) => ({
  userId,
  loading: Boolean(userId),
  resolved: false, // true once we have a trustworthy answer (server, or cached for this user)
  error: null,
  tier: 'free',
  planKey: null,
  status: null,
  accessUntil: null,
  subscriptionId: null,
  aiUsed: 0,
  aiLimit: LIMITS.free.aiActionsPerMonth,
})

export function normaliseEntitlement(raw) {
  if (!raw || typeof raw !== 'object' || !LIMITS[raw.tier]) return null
  return {
    tier: raw.tier,
    planKey: raw.planKey ?? null,
    status: raw.status ?? null,
    accessUntil: raw.accessUntil ?? null,
    subscriptionId: raw.subscriptionId ?? null,
  }
}

// A cached paid entitlement is only trusted until its paid period has ended.
function cachedStillValid(ent, now = new Date()) {
  if (!ent || ent.tier === 'free') return false
  if (String(ent.status || '').toUpperCase() === 'ACTIVE') return true
  return Boolean(ent.accessUntil) && new Date(ent.accessUntil).getTime() > now.getTime()
}

export function createSubscriptionStore({
  fetchEntitlement, // async (userId) => entitlement object | throws on failure
  fetchFallbackEntitlement = null, // async (userId) => entitlement | null (last resort when nothing is known)
  fetchUsage = async () => 0, // async (userId) => number of AI actions this month
  storage = null, // optional { getItem, setItem, removeItem }
  now = () => new Date(),
} = {}) {
  let state = freeState(null)
  let seq = 0 // increments on every request AND every applied server result
  let inflight = null // { userId, promise }
  let lastOkAt = 0
  const listeners = new Set()

  const emit = () => listeners.forEach((l) => l())
  const set = (patch) => {
    state = { ...state, ...patch }
    emit()
  }

  function readCache(userId) {
    try {
      const parsed = JSON.parse(storage?.getItem(CACHE_KEY) || 'null')
      if (parsed?.userId !== userId) return null
      const ent = normaliseEntitlement(parsed.entitlement)
      return cachedStillValid(ent, now()) ? ent : null
    } catch {
      return null
    }
  }

  function writeCache(userId, ent) {
    try {
      if (ent.tier === 'free') storage?.removeItem(CACHE_KEY)
      else storage?.setItem(CACHE_KEY, JSON.stringify({ userId, entitlement: ent }))
    } catch {
      /* cache is best effort */
    }
  }

  function entitlementPatch(ent) {
    return { ...ent, aiLimit: LIMITS[ent.tier].aiActionsPerMonth }
  }

  // Called whenever the signed-in user changes (sign in, sign out, switch account).
  function setUser(userId) {
    const id = userId ?? null
    if (id === state.userId) return
    seq += 1
    inflight = null
    lastOkAt = 0
    if (!id) {
      try { storage?.removeItem(CACHE_KEY) } catch { /* ignore */ }
      state = freeState(null)
      emit()
      return
    }
    const cached = readCache(id)
    state = cached
      ? { ...freeState(id), ...entitlementPatch(cached), resolved: true, loading: true }
      : freeState(id)
    emit()
  }

  // refresh()                  always asks the server (after activation, cancel, etc.)
  // refresh({ maxAgeMs: 30000 }) skips the call if the answer is already fresh (route changes)
  async function refresh({ maxAgeMs = 0 } = {}) {
    const userId = state.userId
    if (!userId) return state
    if (inflight && inflight.userId === userId) return inflight.promise
    if (maxAgeMs > 0 && state.resolved && !state.error && now().getTime() - lastOkAt < maxAgeMs) return state

    const mySeq = ++seq
    const run = (async () => {
      set({ loading: true })
      let ent = null
      let failure = null
      try {
        ent = normaliseEntitlement(await fetchEntitlement(userId))
        if (!ent) failure = new Error('Subscription response was empty.')
      } catch (err) {
        failure = err
      }

      // Last resort, only when the server could not answer AND we know nothing yet.
      if (!ent && !state.resolved && fetchFallbackEntitlement) {
        try { ent = normaliseEntitlement(await fetchFallbackEntitlement(userId)) } catch { /* ignore */ }
      }

      let used = null
      try { used = await fetchUsage(userId) } catch { /* usage is display only */ }

      // Stale: a newer request or a user change happened while we waited.
      if (mySeq !== seq || userId !== state.userId) return state

      if (ent) {
        writeCache(userId, ent)
        if (!failure) lastOkAt = now().getTime()
        set({
          ...entitlementPatch(ent),
          aiUsed: used ?? state.aiUsed,
          loading: false,
          resolved: true,
          error: failure,
        })
      } else {
        // Keep whatever we already knew. Never fall back to Free because a request failed.
        if (failure) console.error('Subscription refresh failed; keeping current plan:', failure)
        set({ loading: false, error: failure })
      }
      return state
    })()

    inflight = { userId, promise: run }
    try {
      return await run
    } finally {
      if (inflight?.promise === run) inflight = null
    }
  }

  // Apply an entitlement returned by activate / sync / cancel / config.
  function apply(rawEntitlement, userId = state.userId) {
    const ent = normaliseEntitlement(rawEntitlement)
    if (!ent || !userId || userId !== state.userId) return false
    seq += 1 // anything slower that is still in flight is now stale
    inflight = null
    lastOkAt = now().getTime()
    writeCache(userId, ent)
    set({ ...entitlementPatch(ent), loading: false, resolved: true, error: null })
    return true
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setUser,
    refresh,
    apply,
  }
}
