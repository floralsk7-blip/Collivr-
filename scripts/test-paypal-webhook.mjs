/**
 * Test Suite: Collivra Asynchronous PayPal Webhook & State Transitions
 * Validates:
 * 1. Webhook header validation & signature rejection
 * 2. Signature verification mock flow
 * 3. Event idempotency (prevent duplicate captures / side effects)
 * 4. PAYMENT.CAPTURE.COMPLETED handling (advancing booking & payments)
 * 5. PAYMENT.CAPTURE.REFUNDED handling
 * 6. BILLING.SUBSCRIPTION.CANCELLED handling
 * 7. End-to-end booking cancellation and refund state transitions
 */

import assert from 'node:assert/strict'
import { supabase } from '../src/lib/supabaseClient.js'
import {
  handlePayPalWebhookEvent,
  validateWebhookHeaders,
  verifyWebhookSignature,
  SUPPORTED_WEBHOOK_EVENTS,
} from '../src/lib/paypalWebhookService.js'
import {
  BOOKING_STATUSES,
  validateBookingTransition,
  assertBookingTransition,
} from '../src/lib/mentorBookingStateMachine.js'
import {
  createBookingRequest,
  getBookingById,
  acceptBooking,
  cancelBooking,
  rejectBooking,
  completeBooking,
} from '../src/lib/mentorBookingService.js'
import {
  createMentorPaymentOrder,
  captureAndVerifyMentorPayment,
  refundMentorPayment,
} from '../src/lib/mentorPaymentService.js'

console.log('Testing Collivra PayPal Webhooks & Payment Lifecycle...\n')

// 1. Webhook Header Validation
const validHeaders = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123',
  'paypal-transmission-id': 'trans-uuid-9876',
  'paypal-transmission-sig': 'mock-base64-signature',
  'paypal-transmission-time': '2026-11-07T01:00:00Z',
}

const headerCheckValid = validateWebhookHeaders(validHeaders)
assert.equal(headerCheckValid.valid, true, 'Valid headers must pass validation')

const missingHeaderCheck = validateWebhookHeaders({ 'paypal-auth-algo': 'SHA256withRSA' })
assert.equal(missingHeaderCheck.valid, false, 'Missing headers must be rejected')
assert.match(missingHeaderCheck.reason, /Missing required header/, 'Reason must name missing header')
console.log('  ok - 1. Webhook header validator enforces required PayPal security headers')

// 2. Signature Verification with Mock Verifier
const mockVerifierSuccess = async () => ({ verified: true })
const mockVerifierFail = async () => ({ verified: false, reason: 'Invalid RSA signature from PayPal' })

const verifiedResult = await verifyWebhookSignature({
  headers: validHeaders,
  body: { id: 'WH-TEST-1' },
  mockVerifier: mockVerifierSuccess,
})
assert.equal(verifiedResult.verified, true, 'Mock verifier success must succeed')

const rejectedSigResult = await verifyWebhookSignature({
  headers: validHeaders,
  body: { id: 'WH-TEST-1' },
  mockVerifier: mockVerifierFail,
})
assert.equal(rejectedSigResult.verified, false, 'Failed verification must be caught')
assert.match(rejectedSigResult.reason, /Invalid RSA signature/, 'Failure reason must be propagated')
console.log('  ok - 2. Signature verification enforces cryptographic authenticity checks')

// 3. Webhook Delivery Rejection when Signature Fails
const badDelivery = await handlePayPalWebhookEvent(
  { id: 'WH-FORGED-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' },
  { headers: validHeaders, mockVerifier: mockVerifierFail }
)
assert.equal(badDelivery.status, 400, 'Unverified webhook must return HTTP 400')
console.log('  ok - 3. Webhook processor rejects unverified payloads with HTTP 400')

// Setup Seed Data for Webhook and State Machine Tests
const studentId = 'student-webhook-test-1'
const mentorId = 'mentor-webhook-test-1'
const packageId = 'pkg-webhook-monthly-1'

// Insert Mock Package
await supabase.from('mentor_packages').insert([
  {
    id: packageId,
    mentor_id: mentorId,
    name: 'Full Stack Acceleration',
    tier: 'standard',
    price_usd: 120,
    duration_weeks: 4,
    sessions_included: 4,
    session_duration_minutes: 60,
    is_active: true,
  },
])

// 4. End-to-End PAYMENT.CAPTURE.COMPLETED via Webhook
const booking1 = await createBookingRequest({
  studentId,
  mentorId,
  packageId,
  sessionScheduledAt: new Date(Date.now() + 86400000 * 3).toISOString(),
})
assert.equal(booking1.status, BOOKING_STATUSES.PENDING_PAYMENT)

const order1 = await createMentorPaymentOrder(booking1.id)
const webhookCaptureEvent = {
  id: 'WH-EVT-CAPTURE-101',
  event_type: SUPPORTED_WEBHOOK_EVENTS.PAYMENT_CAPTURE_COMPLETED,
  create_time: new Date().toISOString(),
  resource: {
    id: 'CAP-PAYPAL-WH-001',
    status: 'COMPLETED',
    amount: { currency_code: 'USD', value: '120.00' },
    supplementary_data: {
      related_ids: { order_id: order1.orderId },
    },
  },
}

const webhookRes1 = await handlePayPalWebhookEvent(webhookCaptureEvent, {
  client: supabase,
  skipSignatureCheck: true,
})
assert.equal(webhookRes1.status, 200, 'Webhook returns HTTP 200')
assert.equal(webhookRes1.body.processed, true, 'Event marked processed')

// Verify database mutations from webhook
const updatedBooking1 = await getBookingById(booking1.id)
assert.equal(
  updatedBooking1.status,
  BOOKING_STATUSES.AWAITING_ACCEPTANCE,
  'Webhook capture automatically advances booking to awaiting_acceptance'
)

const { data: updatedTx1 } = await supabase
  .from('mentor_payment_transactions')
  .select('*')
  .eq('booking_id', booking1.id)
  .single()
assert.equal(updatedTx1.status, 'captured', 'Transaction marked captured via webhook')
assert.equal(updatedTx1.paypal_capture_id, 'CAP-PAYPAL-WH-001')
console.log('  ok - 4. Asynchronous PAYMENT.CAPTURE.COMPLETED updates transactions and advances booking to awaiting_acceptance')

// 5. Idempotency Protection: Redelivery of Same Webhook Event
const duplicateWebhookRes = await handlePayPalWebhookEvent(webhookCaptureEvent, {
  client: supabase,
  skipSignatureCheck: true,
})
assert.equal(duplicateWebhookRes.status, 200, 'Duplicate webhook returns HTTP 200')
assert.equal(duplicateWebhookRes.body.alreadyProcessed, true, 'Duplicate delivery flagged as alreadyProcessed')
console.log('  ok - 5. Webhook idempotency audit log prevents duplicate event side-effects on redelivery')

// 6. PAYMENT.CAPTURE.REFUNDED via Webhook
const webhookRefundEvent = {
  id: 'WH-EVT-REFUND-202',
  event_type: SUPPORTED_WEBHOOK_EVENTS.PAYMENT_CAPTURE_REFUNDED,
  create_time: new Date().toISOString(),
  resource: {
    id: 'REFUND-PAYPAL-WH-001',
    status: 'COMPLETED',
    amount: { currency_code: 'USD', value: '120.00' },
    links: [{ rel: 'up', href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAP-PAYPAL-WH-001' }],
  },
}

const refundWebhookRes = await handlePayPalWebhookEvent(webhookRefundEvent, {
  client: supabase,
  skipSignatureCheck: true,
})
assert.equal(refundWebhookRes.status, 200)
assert.equal(refundWebhookRes.body.processed, true)

const refundedBooking1 = await getBookingById(booking1.id)
assert.equal(refundedBooking1.status, BOOKING_STATUSES.REFUNDED, 'Booking reaches terminal refunded status via webhook')

const { data: refundedTx1 } = await supabase
  .from('mentor_payment_transactions')
  .select('*')
  .eq('booking_id', booking1.id)
  .single()
assert.equal(refundedTx1.status, 'refunded')
console.log('  ok - 6. Asynchronous PAYMENT.CAPTURE.REFUNDED updates transaction and transitions booking to refunded')

// 7. Booking Lifecycle: Unpaid Cancellation (pending_payment -> cancelled)
const unpaidBooking = await createBookingRequest({
  studentId,
  mentorId,
  packageId,
  sessionScheduledAt: new Date(Date.now() + 86400000 * 4).toISOString(),
})
const cancelledUnpaid = await cancelBooking(unpaidBooking.id, studentId, 'Scheduling conflict before checkout')
assert.equal(cancelledUnpaid.status, BOOKING_STATUSES.CANCELLED, 'Unpaid booking cleanly cancels')
// Verify it did NOT enter refund_pending because no funds were collected
assert.notEqual(cancelledUnpaid.status, BOOKING_STATUSES.REFUND_PENDING)
console.log('  ok - 7. Unpaid booking cancellation transitions cleanly to cancelled without initiating refund')

// 8. Booking Lifecycle: Paid Cancellation (confirmed -> cancelled -> refund_pending -> refunded)
const paidBooking = await createBookingRequest({
  studentId,
  mentorId,
  packageId,
  sessionScheduledAt: new Date(Date.now() + 86400000 * 5).toISOString(),
})
const paidOrder = await createMentorPaymentOrder(paidBooking.id)
await captureAndVerifyMentorPayment(paidBooking.id, paidOrder.orderId)
await acceptBooking(paidBooking.id, mentorId, { meetingLink: 'https://meet.google.com/test' })

const confirmedBeforeCancel = await getBookingById(paidBooking.id)
assert.equal(confirmedBeforeCancel.status, BOOKING_STATUSES.CONFIRMED)

// Student cancels confirmed booking
const cancelledPaid = await cancelBooking(paidBooking.id, studentId, 'Emergency withdrawal')
assert.equal(cancelledPaid.status, BOOKING_STATUSES.REFUND_PENDING, 'Paid cancellation automatically queues refund_pending')

// Process refund
const refundExecTx = await refundMentorPayment(paidBooking.id, 'Emergency withdrawal approved')
assert.equal(refundExecTx.status, 'refunded')

const finalCancelledBooking = await getBookingById(paidBooking.id)
assert.equal(finalCancelledBooking.status, BOOKING_STATUSES.REFUNDED, 'Paid booking successfully transitions to terminal refunded')
console.log('  ok - 8. Paid cancellation automatically routes through refund_pending to terminal refunded state')

// 9. State Machine Terminal States Assertion
assert.equal(validateBookingTransition(BOOKING_STATUSES.COMPLETED, BOOKING_STATUSES.REFUNDED).allowed, false)
assert.equal(validateBookingTransition(BOOKING_STATUSES.COMPLETED, BOOKING_STATUSES.CANCELLED).allowed, false)
assert.equal(validateBookingTransition(BOOKING_STATUSES.REFUNDED, BOOKING_STATUSES.CONFIRMED).allowed, false)
assert.equal(validateBookingTransition(BOOKING_STATUSES.PENDING_PAYMENT, BOOKING_STATUSES.CONFIRMED).allowed, false)

assert.throws(
  () => assertBookingTransition(BOOKING_STATUSES.COMPLETED, BOOKING_STATUSES.CANCELLED),
  /Illegal status transition/,
  'Completed session must not be cancellable'
)
console.log('  ok - 9. State machine strictly asserts terminal states and prohibits unauthorized regressions')

console.log('\nAll 9 PayPal Webhook & Payment Lifecycle tests passed successfully!')

