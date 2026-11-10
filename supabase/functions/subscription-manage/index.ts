import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireUser } from '../_shared/http.ts'
import { cancelSubscription, createSubscription, getSubscription, PayPalError } from '../_shared/paypal.ts'
import { activeTier, PLAN_DEFS, type SubRow } from '../_shared/plans.ts'
import { verifySubscription } from '../_shared/paymentChecks.ts'

// deno-lint-ignore no-explicit-any
type Admin = any

async function entitlement(admin: Admin, userId: string) {
  const { data } = await admin.from('subscriptions').select('plan_key, status, access_until, paypal_subscription_id').eq('user_id', userId)
  const rows = (data ?? []) as (SubRow & { paypal_subscription_id: string })[]
  const { tier, planKey } = activeTier(rows)
  const current = rows.find((r) => r.plan_key === planKey)
  return { tier, planKey, status: current?.status ?? null, accessUntil: current?.access_until ?? null, subscriptionId: current?.paypal_subscription_id ?? null }
}

async function assertPlanAccountType(admin: Admin, userId: string, planKey: string) {
  const { data: profile, error } = await admin.from('student_profiles').select('account_type').eq('id', userId).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  const type = profile?.account_type || 'student'
  // New recurring subscriptions are student-only for now. Organisers use
  // one-time Event Pass payments when publishing each event. Legacy organiser
  // subscription rows remain intact for historical access/billing records.
  const allowed = type === 'student'
    ? ['premium_monthly', 'premium_yearly'].includes(planKey)
    : false
  if (!allowed) throw new HttpError(403, 'This subscription is not available for your account type.')
}

function planIdFor(planKey: string): string {
  const def = PLAN_DEFS[planKey]
  if (!def) throw new HttpError(400, 'Unknown plan.')
  const id = Deno.env.get(def.envVar)
  if (!id) throw new HttpError(500, `This plan is not set up yet. Run the plan setup script and add ${def.envVar} to your function secrets.`)
  return id
}

function paypalProblem(err: unknown): never {
  if (err instanceof PayPalError) throw new HttpError(502, `PayPal said: ${err.message}`)
  throw err
}

// One endpoint for everything about a user's subscription:
//   config   - which plans are available and their PayPal plan ids
//   activate - verify a freshly approved PayPal subscription and unlock the plan
//   sync     - refresh status from PayPal (renewals, cancellations)
//   cancel   - cancel at PayPal; access continues until the paid period ends
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')
    const admin = adminClient()

    if (action === 'config') {
      return json({
        plans: Object.values(PLAN_DEFS).map((p) => ({ key: p.key, planId: Deno.env.get(p.envVar) ?? null })),
        entitlement: await entitlement(admin, user.id),
      })
    }
if (action === 'create') {
  const current = await entitlement(admin, user.id)

if (current.tier !== 'free') {
  throw new HttpError(409, 'You already have an active subscription.')
}
  const planKey = String(body.planKey ?? '')
  await assertPlanAccountType(admin, user.id, planKey)
  const planId = planIdFor(planKey)

  const origin = req.headers.get('origin') ?? ''
  const allowedOrigins = (Deno.env.get('APP_ALLOWED_ORIGINS') || 'http://localhost:5173')
    .split(',').map((value) => value.trim()).filter(Boolean)

  if (!allowedOrigins.includes(origin)) {
    throw new HttpError(403, 'Invalid checkout origin.')
  }

  const subscription = await createSubscription({
    planId,
    userId: user.id,
    returnUrl: `${origin}/payment/success?planKey=${encodeURIComponent(planKey)}`,
    cancelUrl: `${origin}/payment/cancel`,
    requestId: crypto.randomUUID(),
  })

  const approvalUrl = subscription.links?.find(
    (link: { rel: string }) => link.rel === 'approve'
  )?.href

  if (!approvalUrl) {
    throw new HttpError(502, 'PayPal did not return an approval URL.')
  }

  return json({
    subscriptionId: subscription.id,
    approvalUrl,
  })
}
    if (action === 'activate') {
      const planKey = String(body.planKey ?? '')
      await assertPlanAccountType(admin, user.id, planKey)
      const subscriptionId = String(body.subscriptionId ?? '')
      if (!/^[A-Za-z0-9_-]{5,64}$/.test(subscriptionId)) throw new HttpError(400, 'Invalid subscription.')
      const expectedPlanId = planIdFor(planKey)

      let sub
      try {
        sub = await getSubscription(subscriptionId)
      } catch (err) {
        paypalProblem(err)
      }

      // Verify what PayPal actually created against what we sell and who is asking.
      const verdict = verifySubscription(sub, expectedPlanId, user.id)
      if (verdict.result === 'reject') throw new HttpError(verdict.status, verdict.message)
      if (verdict.result === 'pending') return json({ pending: true, entitlement: await entitlement(admin, user.id) })

      const current = await entitlement(admin, user.id)
      if (current.tier !== 'free' && current.subscriptionId !== subscriptionId) {
        throw new HttpError(409, 'You already have an active plan. Cancel it first, then subscribe to the new one.')
      }

      const { error } = await admin.from('subscriptions').upsert(
        {
          user_id: user.id,
          plan_key: planKey,
          paypal_subscription_id: subscriptionId,
          status: 'ACTIVE',
          access_until: verdict.accessUntil,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'paypal_subscription_id' },
      )
      if (error) throw new Error(error.message)
      return json({ entitlement: await entitlement(admin, user.id) })
    }

    if (action === 'sync') {
      const { data: rows } = await admin.from('subscriptions').select('*').eq('user_id', user.id)
      for (const row of rows ?? []) {
        if (row.status === 'EXPIRED') continue
        try {
          const sub = await getSubscription(row.paypal_subscription_id)
          await admin
            .from('subscriptions')
            .update({
              status: String(sub?.status ?? row.status),
              access_until: sub?.billing_info?.next_billing_time ?? row.access_until,
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id)
        } catch (err) {
          console.error('Subscription sync failed for', row.paypal_subscription_id, err)
        }
      }
      return json({ entitlement: await entitlement(admin, user.id) })
    }

    if (action === 'cancel') {
      const subscriptionId = String(body.subscriptionId ?? '')
      const { data: row } = await admin.from('subscriptions').select('*').eq('paypal_subscription_id', subscriptionId).maybeSingle()
      if (!row || row.user_id !== user.id) throw new HttpError(404, 'Subscription not found.')

      let accessUntil = row.access_until
      try {
        const sub = await getSubscription(subscriptionId)
        accessUntil = sub?.billing_info?.next_billing_time ?? accessUntil
        if (sub?.status !== 'CANCELLED') await cancelSubscription(subscriptionId, 'Cancelled by the user in COLLIVRA')
      } catch (err) {
        paypalProblem(err)
      }
      await admin
        .from('subscriptions')
        .update({ status: 'CANCELLED', access_until: accessUntil, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', row.id)
      return json({ entitlement: await entitlement(admin, user.id) })
    }

    throw new HttpError(400, 'Unknown action.')
  } catch (err) {
    return errorResponse(err)
  }
})
