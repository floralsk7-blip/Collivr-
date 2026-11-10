// Pure helpers for invoices (no Deno, no network) so they are unit-tested with plain Node.
// Rule: an invoice is only ever built from a COMPLETED PayPal payment that carries its own
// transaction id, amount, currency and time. Anything less returns null. Nothing is invented.

// deno-lint-ignore no-explicit-any
type Json = any

export type InvoiceInput = {
  user_id: string
  source_type: 'subscription'
  source_ref: string
  transaction_id: string
  description: string
  plan_key: string
  amount: number
  currency: string
  paid_at: string
  metadata: Record<string, unknown>
}

export function mapSubscriptionTransaction(
  tx: Json,
  sub: { user_id: string; plan_key: string; paypal_subscription_id: string },
  planName: string,
): InvoiceInput | null {
  if (!tx || typeof tx !== 'object') return null
  if (String(tx.status ?? '').toUpperCase() !== 'COMPLETED') return null // never pending, failed, refunded, reversed
  const id = typeof tx.id === 'string' ? tx.id.trim() : ''
  const gross = tx.amount_with_breakdown?.gross_amount
  const amount = Number(gross?.value)
  const currency = String(gross?.currency_code ?? '').toUpperCase()
  const time = typeof tx.time === 'string' ? new Date(tx.time) : null
  if (!id || !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) return null
  if (!time || Number.isNaN(time.getTime())) return null
  return {
    user_id: sub.user_id,
    source_type: 'subscription',
    source_ref: id, // PayPal's transaction id is the stable key => re-syncing can never duplicate
    transaction_id: id,
    description: planName,
    plan_key: sub.plan_key,
    amount: Math.round(amount * 100) / 100,
    currency,
    paid_at: time.toISOString(),
    metadata: { paypal_subscription_id: sub.paypal_subscription_id },
  }
}

const DAY = 86_400_000

// PayPal wants a start/end window; ask in <=30 day slices so no window is rejected as too long.
export function transactionWindows(from: Date, to: Date, maxWindows = 72): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = []
  let cursor = from.getTime()
  const end = to.getTime()
  while (cursor < end && out.length < maxWindows) {
    const next = Math.min(cursor + 30 * DAY, end)
    out.push({ start: new Date(cursor).toISOString(), end: new Date(next).toISOString() })
    cursor = next
  }
  return out
}
