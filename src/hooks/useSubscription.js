import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import { activeTier, LIMITS, monthStartUtc } from '../lib/plans'

// The user's plan, read from their own rows (display only; the server enforces limits).
export function useSubscription() {
  const { user } = useAuth()
  const [state, setState] = useState({
    loading: true,
    tier: 'free',
    planKey: null,
    status: null,
    accessUntil: null,
    subscriptionId: null,
    aiUsed: 0,
    aiLimit: LIMITS.free.aiActionsPerMonth,
  })

  const load = useCallback(async () => {
    if (!user) {
      setState((current) => ({ ...current, loading: false, tier: 'free', planKey: null, status: null, accessUntil: null, subscriptionId: null }))
      return
    }
    const [{ data: rows, error: subscriptionError }, { count }] = await Promise.all([
      supabase.from('subscriptions').select('plan_key, status, access_until, paypal_subscription_id').eq('user_id', user.id),
      supabase
        .from('ai_usage')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStartUtc()),
    ])
    if (subscriptionError) {
      console.error('Subscription lookup failed:', subscriptionError)
      setState((current) => ({ ...current, loading: false }))
      return
    }
    const own = activeTier(rows || [])
    const tier = own.tier
    const planKey = own.planKey
    const current = (rows || []).find((r) => r.plan_key === own.planKey)
    setState({
      loading: false,
      tier,
      planKey,
      status: current?.status ?? null,
      accessUntil: current?.access_until ?? null,
      subscriptionId: current?.paypal_subscription_id ?? null,
      aiUsed: count ?? 0,
      aiLimit: LIMITS[tier].aiActionsPerMonth,
    })
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, refresh: load }
}
