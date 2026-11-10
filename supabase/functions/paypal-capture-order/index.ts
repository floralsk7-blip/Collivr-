import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireUser } from '../_shared/http.ts'
import { captureOrder, getOrder, PayPalError } from '../_shared/paypal.ts'
import { markPaid } from '../_shared/payments.ts'
import { verifyCapture } from '../_shared/paymentChecks.ts'

// Step 2: after the organizer approves in the PayPal popup, capture the money
// and ONLY THEN mark the event as paid. Everything is re-checked on the server.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    if (!/^[A-Za-z0-9_-]{5,64}$/.test(orderId)) throw new HttpError(400, 'Invalid order.')

    const admin = adminClient()
    const { data: payment } = await admin
      .from('payments')
      .select('*')
      .eq('paypal_order_id', orderId)
      .maybeSingle()

    if (!payment) throw new HttpError(404, 'Order not found.')
    if (payment.payer_id !== user.id) throw new HttpError(403, 'This order belongs to someone else.')
    if (payment.status === 'captured') return json({ status: 'paid', alreadyCaptured: true })

    // Never take a second payment for an event that is already paid (or covered by the College plan).
    const { data: eventRow } = await admin.from('events').select('status').eq('id', payment.event_id).maybeSingle()
    if (eventRow?.status === 'paid' || eventRow?.status === 'teams_formed') {
      throw new HttpError(409, 'This event has already been paid for. No charge was made.')
    }

    // Capture. If the buyer double-clicked, PayPal says ORDER_ALREADY_CAPTURED; read the order instead.
    let result
    try {
      result = await captureOrder(orderId)
    } catch (err) {
      if (err instanceof PayPalError && err.issue === 'ORDER_ALREADY_CAPTURED') {
        result = await getOrder(orderId)
      } else if (err instanceof PayPalError && err.issue === 'INSTRUMENT_DECLINED') {
        // The buyer can pick another payment method and try again on the same order.
        await admin.from('payments').update({ failure_reason: 'payment method declined' }).eq('id', payment.id)
        throw new HttpError(402, 'PayPal could not take the payment from that payment method. Please choose another one and try again.')
      } else if (err instanceof PayPalError) {
        await admin.from('payments').update({ status: 'failed', failure_reason: err.message.slice(0, 300) }).eq('id', payment.id)
        throw new HttpError(402, 'The payment could not be completed. Nothing was charged. Please try again.')
      } else {
        throw err
      }
    }

    // Verify what PayPal actually charged against what we asked for.
    const capture = result?.purchase_units?.[0]?.payments?.captures?.[0]
    const failures = verifyCapture(result, payment)

    if (failures.length > 0) {
      await admin.from('payments').update({ status: 'failed', failure_reason: failures.join(', ') }).eq('id', payment.id)
      throw new HttpError(402, `Payment could not be verified (${failures.join(', ')}). You have not unlocked the event.`)
    }

    await markPaid(admin, payment, capture.id)

    return json({ status: 'paid' })
  } catch (err) {
    return errorResponse(err)
  }
})
