import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireUser, requireUuid } from '../_shared/http.ts'
import { createOrder, EVENT_PASS_CURRENCY, PayPalError } from '../_shared/paypal.ts'
import { quotePrice } from '../_shared/pricing.ts'

// Checkout flow, step 1: the organizer asks for a PayPal order.
// The price is decided here from the saved workflow-complexity tier, never by the browser.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const eventId = requireUuid(body.eventId, 'event')

    const admin = adminClient()
    const { data: event } = await admin
      .from('events')
      .select('id, name, organizer_id, organization_id, status, event_pass_tier')
      .eq('id', eventId)
      .maybeSingle()

    if (!event) throw new HttpError(404, 'Event not found.')
    const { data: allowed, error: permissionError } = await admin.rpc('can_manage_collivra_event', {
      p_event: eventId, p_user: user.id,
    })
    if (permissionError) throw new HttpError(500, permissionError.message)
    if (!allowed || event.organizer_id !== user.id) throw new HttpError(403, 'Only the event creator can pay for this event.')
    if (event.status === 'paid' || event.status === 'teams_formed') {
      throw new HttpError(409, 'This event has already been paid for.')
    }

    const tier = quotePrice(event.event_pass_tier)

    let order
try {
  order = await createOrder({
    eventId,
    eventName: event.name,
    amount: tier.price,
    requestId: crypto.randomUUID(),
  })

  console.log('PayPal order diagnostic:', {
    orderId: order.id,
    status: order.status,
    merchantId: order.purchase_units?.[0]?.payee?.merchant_id,
  })
} catch (err) {
  if (err instanceof PayPalError) {
    throw new HttpError(502, `PayPal could not create the order: ${err.message}`)
  }
  throw err
}

    const { error: insertError } = await admin.from('payments').insert({
      event_id: eventId,
      payer_id: user.id,
      paypal_order_id: order.id,
      amount: tier.price,
      currency: EVENT_PASS_CURRENCY,
      status: 'created',
    })
    if (insertError) throw new Error(insertError.message)

    await admin.from('events').update({ status: 'pending_payment' }).eq('id', eventId).eq('status', 'draft')

    return json({ orderId: order.id })
  } catch (err) {
    return errorResponse(err)
  }
})
