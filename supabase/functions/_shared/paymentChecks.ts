// The checks that decide whether PayPal money unlocks anything. Pure TypeScript (no Deno,
// no network) so they are unit-tested with realistic and tampered PayPal responses.

// deno-lint-ignore no-explicit-any
type Json = any

export type Verdict =
  | { result: 'active'; accessUntil: string | null }
  | { result: 'pending' }
  | { result: 'reject'; status: number; message: string }

// A subscription is only trusted if PayPal says it is for OUR plan, belongs to THIS user
// (custom_id set at creation) and is ACTIVE.
export function verifySubscription(sub: Json, expectedPlanId: string, userId: string): Verdict {
  if (!sub || typeof sub !== 'object') return { result: 'reject', status: 402, message: 'PayPal did not return that subscription.' }
  if (sub.plan_id !== expectedPlanId) return { result: 'reject', status: 402, message: 'That subscription is not for the selected plan.' }
  if ((sub.custom_id ?? '') !== userId) return { result: 'reject', status: 403, message: 'That subscription belongs to a different account.' }

  const status = String(sub.status ?? '')
  if (status === 'APPROVAL_PENDING' || status === 'APPROVED') return { result: 'pending' }
  if (status !== 'ACTIVE') {
    return { result: 'reject', status: 402, message: `The subscription is ${status ? status.toLowerCase().replaceAll('_', ' ') : 'not active'}, so the plan was not unlocked.` }
  }
  return { result: 'active', accessUntil: sub.billing_info?.next_billing_time ?? null }
}

// An Event Pass capture is only trusted if it completed for the exact amount, currency and event we asked for.
export function verifyCapture(
  result: Json,
  expected: { event_id: string; amount: number | string; currency: string },
): string[] {
  const unit = result?.purchase_units?.[0]
  const capture = unit?.payments?.captures?.[0]
  const failures: string[] = []
  if (result?.status !== 'COMPLETED') failures.push('order not completed')
  if (capture?.status !== 'COMPLETED') failures.push('capture not completed')
  if ((capture?.custom_id ?? unit?.custom_id) !== expected.event_id) failures.push('event mismatch')
  if (capture?.amount?.currency_code !== expected.currency) failures.push('currency mismatch')
  if (Number(capture?.amount?.value) !== Number(expected.amount)) failures.push('amount mismatch')
  return failures
}
