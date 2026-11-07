import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  BOOKING_STATUSES,
  validateBookingTransition,
  assertBookingTransition,
} from '../src/lib/mentorBookingStateMachine.js'
import {
  createBookingRequest,
  getBookingById,
  acceptBooking,
  rejectBooking,
  proposeAlternativeTimes,
  cancelBooking,
  completeBooking,
  getBookingsForStudent,
  getBookingsForMentor,
} from '../src/lib/mentorBookingService.js'
import {
  createMentorPaymentOrder,
  captureAndVerifyMentorPayment,
  refundMentorPayment,
} from '../src/lib/mentorPaymentService.js'

console.log('Testing Collivra Smart Mentor Matching: Sub-phase 7 (Booking & PayPal Payments)...')

// 1. Database Migration & Schema Check
const migrationPath = new URL('../supabase/migrations/20261117000000_mentor_bookings_and_payments.sql', import.meta.url)
assert.ok(existsSync(migrationPath), 'Migration 20261117000000 must exist')
const migrationSql = readFileSync(migrationPath, 'utf8')
assert.ok(migrationSql.includes('create table if not exists public.mentor_bookings'), 'Migration must create mentor_bookings table')
assert.ok(migrationSql.includes('create table if not exists public.mentor_payment_transactions'), 'Migration must create mentor_payment_transactions table')
assert.ok(migrationSql.includes('session_scheduled_at timestamptz not null'), 'Migration must enforce session scheduled time')
console.log('  ok - 1. Database migration defines normalized mentor_bookings and mentor_payment_transactions tables')

// 2. State Machine: Valid Transitions
assert.equal(validateBookingTransition(BOOKING_STATUSES.PENDING_PAYMENT, BOOKING_STATUSES.PAYMENT_VERIFIED).allowed, true)
assert.equal(validateBookingTransition(BOOKING_STATUSES.PAYMENT_VERIFIED, BOOKING_STATUSES.AWAITING_ACCEPTANCE).allowed, true)
assert.equal(validateBookingTransition(BOOKING_STATUSES.AWAITING_ACCEPTANCE, BOOKING_STATUSES.CONFIRMED).allowed, true)
assert.equal(validateBookingTransition(BOOKING_STATUSES.CONFIRMED, BOOKING_STATUSES.COMPLETED).allowed, true)
assert.equal(validateBookingTransition(BOOKING_STATUSES.AWAITING_ACCEPTANCE, BOOKING_STATUSES.REJECTED).allowed, true)
assert.equal(validateBookingTransition(BOOKING_STATUSES.REJECTED, BOOKING_STATUSES.REFUND_PENDING).allowed, true)
assert.equal(validateBookingTransition(BOOKING_STATUSES.REFUND_PENDING, BOOKING_STATUSES.REFUNDED).allowed, true)
console.log('  ok - 2. State machine permits all valid lifecycle transitions')

// 3. State Machine: Invalid Transitions Strictly Blocked
const invalidNoPayment = validateBookingTransition(BOOKING_STATUSES.PENDING_PAYMENT, BOOKING_STATUSES.CONFIRMED)
assert.equal(invalidNoPayment.allowed, false, 'Direct pending_payment -> confirmed transition must be strictly forbidden')

const invalidTerminalCompleted = validateBookingTransition(BOOKING_STATUSES.COMPLETED, BOOKING_STATUSES.AWAITING_ACCEPTANCE)
assert.equal(invalidTerminalCompleted.allowed, false, 'Modifying completed booking must be strictly forbidden')

const invalidTerminalRefunded = validateBookingTransition(BOOKING_STATUSES.REFUNDED, BOOKING_STATUSES.CONFIRMED)
assert.equal(invalidTerminalRefunded.allowed, false, 'Re-confirming refunded booking must be forbidden')
console.log('  ok - 3. State machine strictly blocks illegal transitions, preventing unverified activation')

// 4. Booking Request Creation
const studentId = 'dev-user-student-001'
const mentorId = 'dev-mentor-faculty-001'
const packageId = 'dev-pkg-fac-basic'

const booking = await createBookingRequest({
  studentId,
  mentorId,
  packageId,
  projectId: 'dev-project-001',
  sessionScheduledAt: new Date(Date.now() + 86400000 * 4).toISOString(),
  sessionDurationMinutes: 60,
  studentNotes: 'Assistance with PyTorch model architecture and training convergence.',
})
assert.ok(booking.id, 'Booking request must generate ID')
assert.equal(booking.status, BOOKING_STATUSES.PENDING_PAYMENT, 'Booking must initialize in pending_payment status')
console.log('  ok - 4. Booking request created in pending_payment state with scheduled session time')

// 5. Server-Side PayPal Order Creation
const order = await createMentorPaymentOrder(booking.id)
assert.ok(order.orderId.startsWith('PAYPAL-MENTOR-ORD-'), 'Must create server-side PayPal order ID')
assert.equal(order.amount, 60, 'Order amount must be calculated from database package (not client)')
console.log('  ok - 5. Server-side PayPal order creation derives pricing from package, preventing client tampering')

// 6. Server-Side Payment Capture & Booking State Advancement
const capture = await captureAndVerifyMentorPayment(booking.id, order.orderId)
assert.equal(capture.success, true, 'Payment capture must succeed')
assert.ok(capture.captureId.startsWith('PAYPAL-CAP-'), 'Capture ID must be returned')

const capturedBooking = await getBookingById(booking.id)
assert.equal(capturedBooking.status, BOOKING_STATUSES.AWAITING_ACCEPTANCE, 'Verified payment advances booking to awaiting_acceptance')
console.log('  ok - 6. Payment capture verifies transaction and advances booking to awaiting_acceptance')

// 7. Idempotency Check (Duplicate Capture Prevention)
const duplicateAttempt = await captureAndVerifyMentorPayment(booking.id, order.orderId)
assert.equal(duplicateAttempt.alreadyCaptured, true, 'Duplicate capture must be idempotently caught without double charging')
console.log('  ok - 7. Idempotency protection prevents duplicate captures on repeated requests')

// 8. Mentor Alternative Times Proposal
const withAlternatives = await proposeAlternativeTimes(booking.id, mentorId, [
  '2026-11-25T14:00:00.000Z',
  '2026-11-26T16:00:00.000Z',
], 'Suggested afternoons due to university faculty meeting.')
assert.equal(withAlternatives.proposed_alternative_times.length, 2, 'Alternative times must be saved')
console.log('  ok - 8. Mentors can propose alternative session times')

// 9. Mentor Acceptance Workflow
const confirmedBooking = await acceptBooking(booking.id, mentorId, {
  meetingLink: 'https://meet.google.com/collivra-quantum-ml',
  mentorNotes: 'Accepted. Please review the paper draft ahead of our sync.',
})
assert.equal(confirmedBooking.status, BOOKING_STATUSES.CONFIRMED, 'Mentor acceptance advances booking to confirmed')
assert.equal(confirmedBooking.meeting_link, 'https://meet.google.com/collivra-quantum-ml')

// Unauthorized acceptance rejected
await assert.rejects(
  () => acceptBooking(booking.id, 'unauthorized-mentor-999'),
  /Unauthorized/,
  'Unauthorized mentor must be rejected'
)
console.log('  ok - 9. Mentor acceptance confirms booking and meeting link with strict authorization')

// 10. Session Completion Workflow
const completedBooking = await completeBooking(booking.id, mentorId)
assert.equal(completedBooking.status, BOOKING_STATUSES.COMPLETED, 'Session marked completed')
console.log('  ok - 10. Completed session advances to terminal completed state')

// 11. Mentor Rejection & Refund Pipeline
const rejectedBookingCandidate = await createBookingRequest({
  studentId,
  mentorId,
  packageId,
  sessionScheduledAt: new Date(Date.now() + 86400000 * 2).toISOString(),
})
const rejOrder = await createMentorPaymentOrder(rejectedBookingCandidate.id)
await captureAndVerifyMentorPayment(rejectedBookingCandidate.id, rejOrder.orderId)

// Mentor rejects
const refundPendingBooking = await rejectBooking(rejectedBookingCandidate.id, mentorId, 'Faculty sabbatical conflict.')
assert.equal(refundPendingBooking.status, BOOKING_STATUSES.REFUND_PENDING, 'Mentor rejection triggers refund_pending')

// Process refund
const refundTx = await refundMentorPayment(rejectedBookingCandidate.id, 'Booking declined by mentor')
assert.equal(refundTx.status, 'refunded', 'Payment transaction marked refunded')

const finalRefundedBooking = await getBookingById(rejectedBookingCandidate.id)
assert.equal(finalRefundedBooking.status, BOOKING_STATUSES.REFUNDED, 'Booking reaches terminal refunded status')
console.log('  ok - 11. Mentor rejection cleanly routes through refund_pending to terminal refunded state')

// 12. Frontend Integration Check
const projectDetailPath = new URL('../src/pages/ProjectDetail.jsx', import.meta.url)
const projectDetailCode = readFileSync(projectDetailPath, 'utf8')
assert.ok(projectDetailCode.includes('MentorBookingModal'), 'ProjectDetail.jsx must import MentorBookingModal')
assert.ok(projectDetailCode.includes('Book Session →'), 'ProjectDetail.jsx must render Book Session button')
console.log('  ok - 12. Frontend ProjectDetail.jsx integrates MentorBookingModal and checkout triggers')

console.log('\nAll 12 Sub-phase 7 tests passed successfully!')

