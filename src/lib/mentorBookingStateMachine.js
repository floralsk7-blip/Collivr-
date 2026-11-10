/**
 * Collivra Mentor Booking State Machine
 * Pure deterministic state transition validator enforcing strict financial
 * and operational workflows for mentorship bookings.
 */

export const BOOKING_STATUSES = {
  PENDING_PAYMENT: 'pending_payment',
  PAYMENT_VERIFIED: 'payment_verified',
  AWAITING_ACCEPTANCE: 'awaiting_acceptance',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  REFUND_PENDING: 'refund_pending',
  REFUNDED: 'refunded',
}

/**
 * Adjacency list defining permitted status transitions.
 */
export const ALLOWED_TRANSITIONS = {
  [BOOKING_STATUSES.PENDING_PAYMENT]: [
    BOOKING_STATUSES.PAYMENT_VERIFIED,
    BOOKING_STATUSES.CANCELLED,
  ],
  [BOOKING_STATUSES.PAYMENT_VERIFIED]: [
    BOOKING_STATUSES.AWAITING_ACCEPTANCE,
    BOOKING_STATUSES.CONFIRMED,
    BOOKING_STATUSES.REFUND_PENDING,
  ],
  [BOOKING_STATUSES.AWAITING_ACCEPTANCE]: [
    BOOKING_STATUSES.CONFIRMED,
    BOOKING_STATUSES.REJECTED,
    BOOKING_STATUSES.CANCELLED,
    BOOKING_STATUSES.REFUND_PENDING,
  ],
  [BOOKING_STATUSES.CONFIRMED]: [
    BOOKING_STATUSES.COMPLETED,
    BOOKING_STATUSES.CANCELLED,
    BOOKING_STATUSES.REFUND_PENDING,
  ],
  [BOOKING_STATUSES.REJECTED]: [
    BOOKING_STATUSES.REFUND_PENDING,
    BOOKING_STATUSES.REFUNDED,
  ],
  [BOOKING_STATUSES.CANCELLED]: [
    BOOKING_STATUSES.REFUND_PENDING,
    BOOKING_STATUSES.REFUNDED,
  ],
  [BOOKING_STATUSES.REFUND_PENDING]: [
    BOOKING_STATUSES.REFUNDED,
  ],
  [BOOKING_STATUSES.COMPLETED]: [], // Terminal state
  [BOOKING_STATUSES.REFUNDED]: [],  // Terminal state
}

/**
 * Validates whether a state transition from `currentStatus` to `nextStatus` is allowed.
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function validateBookingTransition(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) {
    return { allowed: false, reason: 'Current and target status must both be specified.' }
  }

  if (currentStatus === nextStatus) {
    return { allowed: true } // Idempotent self-transition
  }

  const permitted = ALLOWED_TRANSITIONS[currentStatus]
  if (!permitted) {
    return { allowed: false, reason: `Unknown booking status: "${currentStatus}".` }
  }

  if (!permitted.includes(nextStatus)) {
    return {
      allowed: false,
      reason: `Illegal status transition from "${currentStatus}" to "${nextStatus}". Mentorship bookings cannot bypass payment verification or lifecycle safeguards.`,
    }
  }

  return { allowed: true }
}

/**
 * Asserts a valid transition, throwing a descriptive error if invalid.
 * @param {string} currentStatus
 * @param {string} nextStatus
 */
export function assertBookingTransition(currentStatus, nextStatus) {
  const result = validateBookingTransition(currentStatus, nextStatus)
  if (!result.allowed) {
    throw new Error(result.reason)
  }
}

