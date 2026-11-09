import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, json, requireUser } from '../_shared/http.ts'
import { getSubscriptionTransactions, PayPalError } from '../_shared/paypal.ts'
import { PLAN_DEFS } from '../_shared/plans.ts'
import { mapSubscriptionTransaction, transactionWindows } from '../_shared/invoices.ts'

// Invoices for recurring (subscription) payments.
//
// Event Pass invoices are created by a database trigger the moment a payment is captured.
// PayPal subscription renewals happen without COLLIVRA being involved, so this function asks PayPal
// for the COMPLETED transactions of the CALLER'S OWN subscriptions and records one invoice per
// transaction id. Re-running it is safe: (source_type, source_ref) is unique.
//
//   action 'sync' - import any subscription payments that do not have an invoice yet
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    if (String(body.action ?? '') !== 'sync') return json({ error: 'Unknown action.' }, 400)

    const admin = adminClient()
    const { data: subs, error } = await admin
      .from('subscriptions')
      .select('plan_key, paypal_subscription_id, started_at, user_id')
      .eq('user_id', user.id) // ownership: only the caller's own subscriptions
    if (error) throw new Error(error.message)

    const now = new Date()
    let created = 0
    const problems: string[] = []

    for (const sub of subs ?? []) {
      const def = PLAN_DEFS[sub.plan_key]
      if (!def) continue // unknown plan: cannot describe it truthfully, so no invoice

      // Resume from the newest invoice already issued for this subscription (minus a day of overlap).
      const { data: latest } = await admin
        .from('invoices')
        .select('paid_at')
        .eq('user_id', user.id)
        .eq('source_type', 'subscription')
        .eq('metadata->>paypal_subscription_id', sub.paypal_subscription_id)
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const startedAt = new Date(sub.started_at)
      const from = latest?.paid_at ? new Date(new Date(latest.paid_at).getTime() - 86_400_000) : startedAt
      const safeFrom = Number.isNaN(from.getTime()) ? new Date(now.getTime() - 30 * 86_400_000) : from

      for (const w of transactionWindows(new Date(Math.max(safeFrom.getTime(), 0)), now)) {
        let page
        try {
          page = await getSubscriptionTransactions(sub.paypal_subscription_id, w.start, w.end)
        } catch (err) {
          const msg = err instanceof PayPalError ? err.message : String(err)
          console.error('Invoice sync: PayPal lookup failed for', sub.paypal_subscription_id, msg)
          problems.push(`Could not read PayPal payments for ${sub.plan_key}.`)
          break
        }
        for (const tx of page?.transactions ?? []) {
          const inv = mapSubscriptionTransaction(tx, sub, def.name)
          if (!inv) continue
          const { data: id, error: rpcError } = await admin.rpc('record_invoice', {
            p_user: inv.user_id,
            p_source_type: inv.source_type,
            p_source_ref: inv.source_ref,
            p_transaction_id: inv.transaction_id,
            p_description: inv.description,
            p_amount: inv.amount,
            p_currency: inv.currency,
            p_paid_at: inv.paid_at,
            p_plan_key: inv.plan_key,
            p_metadata: inv.metadata,
          })
          if (rpcError) { console.error('record_invoice failed:', rpcError.message); problems.push('One payment could not be recorded.') } else if (id) created += 1
        }
      }
    }

    return json({ created, problems: [...new Set(problems)] })
  } catch (err) {
    return errorResponse(err)
  }
})
