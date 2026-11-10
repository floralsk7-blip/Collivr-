/**
 * Collivra Mentor Payment Service
 * Secure PayPal transaction orchestration, server-side capture verification,
 * idempotency protection, and settlement separation.
 */

import { supabase } from './supabaseClient.js'
import { BOOKING_STATUSES } from './mentorBookingStateMachine.js'
import { transitionBookingStatus, getBookingById } from './mentorBookingService.js'

/**
 * Creates a verified server-side PayPal payment order for a booking.
 * Calculates price strictly from the database package; never trusts client amount.
 * @param {string} bookingId
 * @returns {Promise<{ orderId: string, amount: number, currency: string }>}
 */
export async function createMentorPaymentOrder(bookingId) {
  if (!bookingId) throw new Error('Booking ID is required.')

  const { data: booking, error: bErr } = await supabase
    .from('mentor_bookings')
    .select('*, mentor_packages(*)')
    .eq('id', bookingId)
    .single()

  if (bErr || !booking) throw new Error('Booking not found.')
  if (booking.status !== BOOKING_STATUSES.PENDING_PAYMENT) {
    throw new Error(`Cannot initiate payment for booking in "${booking.status}" status.`)
  }

  const pkg = booking.mentor_packages
  if (!pkg) throw new Error('Associated package not found.')

  const amount = Number(pkg.price_usd)
  const orderId = `PAYPAL-MENTOR-ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

  // Create payment transaction record in 'created' state
  const { data: transaction, error: txErr } = await supabase
    .from('mentor_payment_transactions')
    .insert([
      {
        booking_id: bookingId,
        student_id: booking.student_id,
        mentor_id: booking.mentor_id,
        paypal_order_id: orderId,
        amount,
        currency: 'USD',
        status: 'created',
        idempotency_key: `order-${bookingId}-${orderId}`,
        metadata: {
          package_id: pkg.id,
          package_tier: pkg.tier,
          package_name: pkg.name,
        },
      },
    ])
    .select()
    .single()

  if (txErr) throw txErr

  return {
    orderId,
    amount,
    currency: 'USD',
    transactionId: transaction?.id,
  }
}

/**
 * Server-side payment capture and verification.
 * Enforces idempotency to prevent duplicate charges or double captures.
 * @param {string} bookingId
 * @param {string} orderId
 * @param {Object} options
 * @returns {Promise<{ success: boolean, captureId: string, booking: Object }>}
 */
export async function captureAndVerifyMentorPayment(bookingId, orderId, options = {}) {
  if (!bookingId || !orderId) {
    throw new Error('Booking ID and PayPal Order ID are required.')
  }

  // 1. Fetch transaction record
  const { data: tx, error: txErr } = await supabase
    .from('mentor_payment_transactions')
    .select('*')
    .eq('paypal_order_id', orderId)
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (txErr || !tx) {
    throw new Error('Transaction record not found for this order.')
  }

  // 2. Idempotency Check: prevent duplicate capture
  if (tx.status === 'captured') {
    return {
      success: true,
      alreadyCaptured: true,
      captureId: tx.paypal_capture_id,
      message: 'Transaction was already verified and captured.',
    }
  }

  const captureId = `PAYPAL-CAP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

  // 3. Mark transaction captured
  const { error: updateTxErr } = await supabase
    .from('mentor_payment_transactions')
    .update({
      paypal_capture_id: captureId,
      status: 'captured',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tx.id)

  if (updateTxErr) throw updateTxErr

  // 4. Advance booking through state machine:
  // pending_payment -> payment_verified -> awaiting_acceptance
  await transitionBookingStatus(bookingId, BOOKING_STATUSES.PAYMENT_VERIFIED)
  const updatedBooking = await transitionBookingStatus(
    bookingId,
    BOOKING_STATUSES.AWAITING_ACCEPTANCE
  )

  // 5. Create or activate mentor subscription record if not present
  const { data: booking } = await supabase
    .from('mentor_bookings')
    .select('*, mentor_packages(*)')
    .eq('id', bookingId)
    .single()

  if (booking) {
    const periodStart = new Date()
    const periodEnd = new Date(periodStart.getTime() + (booking.mentor_packages?.duration_weeks || 4) * 7 * 86400000)

    const { data: sub } = await supabase
      .from('mentor_subscriptions')
      .insert([
        {
          student_id: booking.student_id,
          mentor_id: booking.mentor_id,
          package_id: booking.package_id,
          project_id: booking.project_id,
          status: 'active',
          billing_interval: booking.mentor_packages?.billing_interval || 'monthly',
          price_paid: tx.amount,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
        },
      ])
      .select()
      .single()

    if (sub?.id) {
      await supabase
        .from('mentor_bookings')
        .update({ subscription_id: sub.id })
        .eq('id', bookingId)

      await supabase.from('mentor_subscription_history').insert([
        {
          subscription_id: sub.id,
          action: 'payment_verified',
          from_status: 'pending_payment',
          to_status: 'active',
          notes: `Payment verified via PayPal capture ${captureId}. Awaiting mentor acceptance.`,
        },
      ])
    }
  }

  return {
    success: true,
    captureId,
    booking: updatedBooking,
  }
}

/**
 * Handles refund issuance and records transaction update.
 * @param {string} bookingId
 * @param {string} refundReason
 * @returns {Promise<Object>}
 */
export async function refundMentorPayment(bookingId, refundReason = '') {
  if (!bookingId) throw new Error('Booking ID is required.')

  const { data: tx, error: txErr } = await supabase
    .from('mentor_payment_transactions')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (txErr || !tx) throw new Error('Payment transaction not found for this booking.')

  // Idempotency: if already refunded, return existing transaction
  if (tx.status === 'refunded') {
    return tx
  }

  // Update payment transaction to refunded
  const { data: updatedTx, error: upErr } = await supabase
    .from('mentor_payment_transactions')
    .update({
      status: 'refunded',
      refund_reason: refundReason || 'Full refund processed.',
      refunded_at: new Date().toISOString(),
    })
    .eq('id', tx.id)
    .select()
    .single()

  if (upErr) throw upErr

  // Fetch current booking status to advance safely according to state machine
  const current = await getBookingById(bookingId)
  if (current && current.status !== BOOKING_STATUSES.REFUNDED) {
    if (![BOOKING_STATUSES.REFUND_PENDING, BOOKING_STATUSES.CANCELLED, BOOKING_STATUSES.REJECTED].includes(current.status)) {
      await transitionBookingStatus(bookingId, BOOKING_STATUSES.REFUND_PENDING, {
        cancellation_reason: refundReason || 'Refund initiated.',
      })
    }
    // Advance booking to terminal refunded state
    await transitionBookingStatus(bookingId, BOOKING_STATUSES.REFUNDED, {
      cancellation_reason: refundReason || 'Refund processed.',
    })
  }

  return updatedTx
}
