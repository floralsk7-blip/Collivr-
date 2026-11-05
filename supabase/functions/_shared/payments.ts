// deno-lint-ignore no-explicit-any
type Admin = any

// The single place that flips an event to "paid". Never regresses an event that already formed teams.
export async function markPaid(admin: Admin, payment: { id: string; event_id: string }, captureId: string | null = null) {
  const now = new Date().toISOString()
  await admin
    .from('payments')
    .update({ status: 'captured', paypal_capture_id: captureId, captured_at: now })
    .eq('id', payment.id)
  await admin
    .from('events')
    .update({ status: 'paid', paid_at: now })
    .eq('id', payment.event_id)
    .in('status', ['draft', 'pending_payment'])
}
