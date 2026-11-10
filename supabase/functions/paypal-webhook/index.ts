import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, HttpError, json } from '../_shared/http.ts'
import { verifyWebhookSignature } from '../_shared/paypal.ts'
import { markPaid } from '../_shared/payments.ts'

// PayPal Webhook listener for asynchronous payment capture, refund, and subscription events.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const rawHeaders = Object.fromEntries(req.headers.entries())
    const body = await req.json().catch(() => null)

    if (!body || !body.id || !body.event_type) {
      throw new HttpError(400, 'Invalid webhook payload.')
    }

    const admin = adminClient()
    const webhookId = Deno.env.get('PAYPAL_WEBHOOK_ID')
    const verifyDisabled = Deno.env.get('PAYPAL_WEBHOOK_VERIFY_DISABLED') === 'true'

    // 1. Signature Verification
    if (!verifyDisabled) {
      if (!webhookId) {
        throw new HttpError(500, 'PAYPAL_WEBHOOK_ID is not configured on the server.')
      }

      const authAlgo = rawHeaders['paypal-auth-algo']
      const certUrl = rawHeaders['paypal-cert-url']
      const transmissionId = rawHeaders['paypal-transmission-id']
      const transmissionSig = rawHeaders['paypal-transmission-sig']
      const transmissionTime = rawHeaders['paypal-transmission-time']

      if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
        throw new HttpError(400, 'Missing required PayPal signature verification headers.')
      }

      const verifyRes = await verifyWebhookSignature({
        authAlgo,
        certUrl,
        transmissionId,
        transmissionSig,
        transmissionTime,
        webhookId,
        webhookEvent: body,
      })

      if (verifyRes?.verification_status !== 'SUCCESS') {
        throw new HttpError(400, 'PayPal webhook signature verification failed.')
      }
    }

    const eventId = body.id
    const eventType = body.event_type
    const resource = body.resource || {}

    // 2. Idempotency Check: prevent duplicate event processing
    const { data: existingEvent } = await admin
      .from('paypal_webhook_events')
      .select('id, processed_at')
      .eq('event_id', eventId)
      .maybeSingle()

    if (existingEvent) {
      return json({
        received: true,
        alreadyProcessed: true,
        eventId,
        processedAt: existingEvent.processed_at,
      }, 200)
    }

    // 3. Event Processing
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const captureId = resource.id
      const orderId =
        resource?.supplementary_data?.related_ids?.order_id ||
        resource?.custom_id ||
        resource?.invoice_id

      // Check mentor bookings & transactions
      const { data: tx } = await admin
        .from('mentor_payment_transactions')
        .select('*')
        .or(`paypal_order_id.eq.${orderId},paypal_capture_id.eq.${captureId}`)
        .maybeSingle()

      if (tx && tx.status !== 'captured') {
        await admin
          .from('mentor_payment_transactions')
          .update({
            status: 'captured',
            paypal_capture_id: captureId || tx.paypal_capture_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tx.id)

        // Advance booking to awaiting_acceptance
        await admin
          .from('mentor_bookings')
          .update({
            status: 'awaiting_acceptance',
            updated_at: new Date().toISOString(),
          })
          .eq('id', tx.booking_id)
      }

      // Check event pass payments
      const { data: eventPayment } = await admin
        .from('payments')
        .select('*')
        .eq('paypal_order_id', orderId)
        .maybeSingle()

      if (eventPayment && eventPayment.status !== 'captured') {
        await markPaid(admin, eventPayment, captureId)
      }
    } else if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
      const refundId = resource.id
      const parentCaptureId =
        resource?.links?.find((l: any) => l.rel === 'up')?.href?.split('/')?.pop() ||
        resource?.capture_id

      const { data: tx } = await admin
        .from('mentor_payment_transactions')
        .select('*')
        .or(`paypal_capture_id.eq.${parentCaptureId},id.eq.${resource.custom_id}`)
        .maybeSingle()

      if (tx && tx.status !== 'refunded') {
        await admin
          .from('mentor_payment_transactions')
          .update({
            status: 'refunded',
            refund_reason: `PayPal webhook refund ${refundId}`,
            refunded_at: new Date().toISOString(),
          })
          .eq('id', tx.id)

        await admin
          .from('mentor_bookings')
          .update({
            status: 'refunded',
            cancellation_reason: `Refunded via PayPal refund ${refundId}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tx.booking_id)
      }
    } else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
      const subId = resource.id
      if (subId) {
        await admin
          .from('mentor_subscriptions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', subId)

        await admin
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('paypal_subscription_id', subId)
      }
    }

    // 4. Record event in idempotency audit log
    await admin.from('paypal_webhook_events').insert([
      {
        event_id: eventId,
        event_type: eventType,
        resource_id: resource?.id || null,
        status: 'processed',
        payload: body,
        processed_at: new Date().toISOString(),
      },
    ])

    return json({
      received: true,
      processed: true,
      eventId,
      eventType,
    }, 200)
  } catch (err) {
    return errorResponse(err)
  }
})

