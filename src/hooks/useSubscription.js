import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import { activeTier, monthStartUtc } from '../lib/plans'
import { getBillingConfig } from '../lib/subscriptions'
import { createSubscriptionStore } from '../lib/subscriptionStore'

function browserStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

// The subscription-manage Edge Function is the source of truth (service-role read, so it is
// not affected by RLS or session timing). 'config' is read-only and returns the entitlement.
async function fetchEntitlement() {
  const res = await getBillingConfig()
  if (!res?.entitlement) throw new Error('No entitlement in response')
  return res.entitlement
}

// Only used when the Edge Function is unreachable AND nothing is known yet (for example local
// dev mode). It can raise a plan, but the store never lets a failure lower a known one.
async function fetchFallbackEntitlement(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan_key, status, access_until, paypal_subscription_id')
    .eq('user_id', userId)
  if (error || !Array.isArray(data) || data.length === 0) return null
  const own = activeTier(data)
  if (own.tier === 'free') return null
  const row = data.find((r) => r.plan_key === own.planKey)
  return {
    tier: own.tier,
    planKey: own.planKey,
    status: row?.status ?? null,
    accessUntil: row?.access_until ?? null,
    subscriptionId: row?.paypal_subscription_id ?? null,
  }
}

async function fetchUsage(userId) {
  const { count } = await supabase
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', monthStartUtc())
  return count ?? 0
}

export const subscriptionStore = createSubscriptionStore({
  fetchEntitlement,
  fetchFallbackEntitlement,
  fetchUsage,
  storage: browserStorage(),
})

// The user's plan, shared by the whole app. Display only; the server enforces every limit.
export function useSubscription() {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const state = useSyncExternalStore(subscriptionStore.subscribe, subscriptionStore.getState, subscriptionStore.getState)

  // Follow sign in / sign out / account switches. Token refreshes keep the same id, so they
  // do not trigger a reload and cannot reset the plan.
  useEffect(() => {
    if (authLoading) return
    subscriptionStore.setUser(userId)
    if (userId) subscriptionStore.refresh({ maxAgeMs: 30000 })
  }, [userId, authLoading])

  const refresh = useCallback(() => subscriptionStore.refresh(), [])
  const apply = useCallback((entitlement) => subscriptionStore.apply(entitlement, userId), [userId])

  const ready = !authLoading && (!userId || state.userId === userId)
  return {
    ...state,
    // Still "loading" until auth is known and the store is tracking this user.
    loading: !ready || state.loading,
    refresh,
    apply,
  }
}
