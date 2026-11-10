/**
 * Collivra PayPal Webhook Service
 * Handles asynchronous PayPal webhook notifications, signature verification,
 * event idempotency deduplication, and financial state transitions.
 */

import { supabase as defaultClient } from './supabaseClient.js'
import { BOOKING_STATUSES } from './mentorBookingStateMachine.js'

export const SUPPORTED_WEBHOOK_EVENTS = {
  PAYMENT_CAPTURE_COMPLETED: 'PAYMENT.CAPTURE.COMPLETED',
  PAYMENT_CAPTURE_REFUNDED: 'PAYMENT.CAPTURE.REFUNDED',
  PAYMENT_CAPTURE_DENIED: 'PAYMENT.CAPTURE.DENIED',
  CHECKOUT_ORDER_APPROVED: 'CHECKOUT.ORDER.APPROVED',
  BILLING_SUBSCRIPTION_CANCELLED: 'BILLING.SUBSCRIPTION.CANCELLED',
  BILLING_SUBSCRIPTION_SUSPENDED: 'BILLING.SUBSCRIPTION.SUSPENDED',
}

/**
 * Validates PayPal webhook headers.
 * @param {Object} headers
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateWebhookHeaders(headers = {}) {
  const normalized = {}
  for (const [k, v] of Object.entries(headers)) {
    normalized[k.toLowerCase()] = v
  }

  const required = [
    'paypal-auth-algo',
    'paypal-cert-url',
    'paypal-transmission-id',
    'paypal-transmission-sig',
    'paypal-transmission-time',
  ]

  for (const h of required) {
    if (!normalized[h]) {
      return { valid: false, reason: `Missing required header: ${h}` }
    }
  }

  return { valid: true }
}

/**
 * Verifies PayPal webhook signature.
 * In production/sandbox, calls PayPal's verification endpoint.
 * In local dev / mock mode, validates required headers and structure.
 * @param {Object} params
 * @returns {Promise<{ verified: boolean, reason?: string }>}
 */
export async function verifyWebhookSignature({
  headers = {},
  body = {},
  webhookId = '',
  mockVerifier = null,
  bypassVerification = false,
}) {
  if (bypassVerification) {
    return { verified: true }
  }

  const headerCheck = validateWebhookHeaders(headers)
  if (!headerCheck.valid) {
    return { verified: false, reason: headerCheck.reason }
  }

  if (mockVerifier) {
    return mockVerifier({ headers, body, webhookId })
  }

  // If live PayPal credentials and environment are available
  const clientId = process?.env?.PAYPAL_CLIENT_ID
  const clientSecret = process?.env?.PAYPAL_CLIENT_SECRET
  const liveWebhookId = webhookId || process?.env?.PAYPAL_WEBHOOK_ID

  if (!clientId || !clientSecret || !liveWebhookId) {
    return {
      verified: false,
      reason: 'Live PayPal credentials or PAYPAL_WEBHOOK_ID not configured on server.',
    }
  }

  try {
    const isLive = process.env.PAYPAL_ENV === 'live'
    const baseUrl = isLive ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

    // Obtain access token
    const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    const authData = await authRes.json()
    if (!authRes.ok) throw new Error(authData?.error_description || 'Auth failed')

    // Call verify-webhook-signature
    const normalized = {}
    for (const [k, v] of Object.entries(headers)) {
      normalized[k.toLowerCase()] = v
    }

    const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: normalized['paypal-auth-algo'],
        cert_url: normalized['paypal-cert-url'],
        transmission_id: normalized['paypal-transmission-id'],
        transmission_sig: normalized['paypal-transmission-sig'],
        transmission_time: normalized['paypal-transmission-time'],
        webhook_id: liveWebhookId,
        webhook_event: body,
      }),
    })

    const verifyData = await verifyRes.json()
    if (verifyData?.verification_status === 'SUCCESS') {
      return { verified: true }
    }
    return { verified: false, reason: `PayPal signature verification failed (${verifyData?.verification_status || 'FAILURE'}).` }
  } catch (err) {
    return { verified: false, reason: err.message }
  }
}

/**
 * Processes incoming PayPal webhook event with idempotency guarantees.
 * @param {Object} event
 * @param {Object} options
 * @returns {Promise<{ status: number, body: Object }>}
 */
export async function handlePayPalWebhookEvent(event, {
  client = defaultClient,
  skipSignatureCheck = false,
  headers = {},
  mockVerifier = null,
} = {}) {
  if (!event || !event.id || !event.event_type) {
    return { status: 400, body: { error: 'Invalid PayPal webhook event payload.' } }
  }

  // 1. Signature Verification Check
  if (!skipSignatureCheck) {
    const sigCheck = await verifyWebhookSignature({
      headers,
      body: event,
      mockVerifier,
    })
    if (!sigCheck.verified) {
      return { status: 400, body: { error: sigCheck.reason || 'Unauthorized webhook signature.' } }
    }
  }

  const eventId = event.id
  const eventType = event.event_type
  const resource = event.resource || {}

  // 2. Idempotency Check: check if event has already been recorded
  const { data: existingEvent } = await client
    .from('paypal_webhook_events')
    .select('id, status, processed_at')
    .eq('event_id', eventId)
    .maybeSingle()

  if (existingEvent) {
    return {
      status: 200,
      body: {
        received: true,
        alreadyProcessed: true,
        eventId,
        processedAt: existingEvent.processed_at,
      },
    }
  }

  // 3. Process Domain Operations based on event type
  let processedResult = { action: 'acknowledged' }

  if (eventType === SUPPORTED_WEBHOOK_EVENTS.PAYMENT_CAPTURE_COMPLETED) {
    const captureId = resource.id
    const orderId =
      resource?.supplementary_data?.related_ids?.order_id ||
      resource?.custom_id ||
      resource?.invoice_id

    // Check mentor payment transactions
    const { data: tx } = await client
      .from('mentor_payment_transactions')
      .select('*')
      .or(`paypal_order_id.eq.${orderId},paypal_capture_id.eq.${captureId}`)
      .maybeSingle()

    if (tx) {
      if (tx.status !== 'captured') {
        await client
          .from('mentor_payment_transactions')
          .update({
            status: 'captured',
            paypal_capture_id: captureId || tx.paypal_capture_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tx.id)

        // Advance booking status
        const { data: booking } = await client
          .from('mentor_bookings')
          .select('*')
          .eq('id', tx.booking_id)
          .single()

        if (booking && booking.status === BOOKING_STATUSES.PENDING_PAYMENT) {
          await client
            .from('mentor_bookings')
            .update({
              status: BOOKING_STATUSES.AWAITING_ACCEPTANCE,
              updated_at: new Date().toISOString(),
            })
            .eq('id', booking.id)
        }
      }
      processedResult = { action: 'mentor_payment_captured', bookingId: tx.booking_id }
    }

    // Check organizer event pass payments
    const { data: eventPayment } = await client
      .from('payments')
      .select('*')
      .eq('paypal_order_id', orderId)
      .maybeSingle()

    if (eventPayment && eventPayment.status !== 'captured') {
      await client
        .from('payments')
        .update({
          status: 'captured',
          paypal_capture_id: captureId,
          captured_at: new Date().toISOString(),
        })
        .eq('id', eventPayment.id)

      await client
        .from('events')
        .update({ status: 'paid' })
        .eq('id', eventPayment.event_id)

      processedResult = { action: 'event_payment_captured', eventId: eventPayment.event_id }
    }
  } else if (eventType === SUPPORTED_WEBHOOK_EVENTS.PAYMENT_CAPTURE_REFUNDED) {
    const refundId = resource.id
    const parentCaptureId =
      resource?.links?.find((l) => l.rel === 'up')?.href?.split('/')?.pop() ||
      resource?.capture_id

    const { data: tx } = await client
      .from('mentor_payment_transactions')
      .select('*')
      .or(`paypal_capture_id.eq.${parentCaptureId},id.eq.${resource.custom_id}`)
      .maybeSingle()

    if (tx) {
      if (tx.status !== 'refunded') {
        await client
          .from('mentor_payment_transactions')
          .update({
            status: 'refunded',
            refund_reason: `PayPal webhook refund ${refundId}`,
            refunded_at: new Date().toISOString(),
          })
          .eq('id', tx.id)

        // Advance booking to refunded
        await client
          .from('mentor_bookings')
          .update({
            status: BOOKING_STATUSES.REFUNDED,
            cancellation_reason: `Refunded via PayPal refund ${refundId}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tx.booking_id)
      }
      processedResult = { action: 'mentor_payment_refunded', bookingId: tx.booking_id }
    }
  } else if (eventType === SUPPORTED_WEBHOOK_EVENTS.BILLING_SUBSCRIPTION_CANCELLED) {
    const subId = resource.id
    if (subId) {
      await client
        .from('mentor_subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', subId)

      await client
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('paypal_subscription_id', subId)

      processedResult = { action: 'subscription_cancelled', subscriptionId: subId }
    }
  }

  // 4. Record event in idempotency log
  await client.from('paypal_webhook_events').insert([
    {
      event_id: eventId,
      event_type: eventType,
      resource_id: resource?.id || null,
      status: 'processed',
      payload: event,
      processed_at: new Date().toISOString(),
    },
  ])

  return {
    status: 200,
    body: {
      received: true,
      processed: true,
      eventId,
      eventType,
      result: processedResult,
    },
  }
}

