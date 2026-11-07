/**
 * Collivra Mentor Booking Service
 * Handles booking creation, scheduling, mentor acceptance/rejection,
 * and transition enforcement through the state machine.
 */

import { supabase } from './supabaseClient.js'
import {
  BOOKING_STATUSES,
  assertBookingTransition,
} from './mentorBookingStateMachine.js'

/**
 * Creates a new booking request in initial pending_payment state.
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function createBookingRequest({
  studentId,
  mentorId,
  packageId,
  projectId = null,
  sessionScheduledAt,
  sessionDurationMinutes = 60,
  studentNotes = '',
}) {
  if (!studentId) throw new Error('Student authentication is required.')
  if (!mentorId) throw new Error('Mentor must be selected.')
  if (!packageId) throw new Error('Mentorship package must be selected.')
  if (!sessionScheduledAt) throw new Error('Session scheduled time is required.')

  const scheduledDate = new Date(sessionScheduledAt)
  if (isNaN(scheduledDate.getTime())) {
    throw new Error('Invalid session scheduled time.')
  }

  const payload = {
    student_id: studentId,
    mentor_id: mentorId,
    package_id: packageId,
    project_id: projectId || null,
    status: BOOKING_STATUSES.PENDING_PAYMENT,
    session_scheduled_at: scheduledDate.toISOString(),
    session_duration_minutes: Number(sessionDurationMinutes) || 60,
    student_notes: studentNotes ? studentNotes.trim() : null,
  }

  const { data, error } = await supabase
    .from('mentor_bookings')
    .insert([payload])
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Retrieves a booking by its UUID.
 * @param {string} bookingId
 * @returns {Promise<Object>}
 */
export async function getBookingById(bookingId) {
  if (!bookingId) throw new Error('Booking ID is required.')

  const { data, error } = await supabase
    .from('mentor_bookings')
    .select('*, mentor_profiles(*), mentor_packages(*), projects(id, name, domain)')
    .eq('id', bookingId)
    .single()

  if (error) throw error
  return data
}

/**
 * Advances booking status strictly complying with the state machine.
 * @param {string} bookingId
 * @param {string} nextStatus
 * @param {Object} updates
 * @returns {Promise<Object>}
 */
export async function transitionBookingStatus(bookingId, nextStatus, updates = {}) {
  const current = await getBookingById(bookingId)
  if (!current) throw new Error('Booking not found.')

  assertBookingTransition(current.status, nextStatus)

  const payload = {
    status: nextStatus,
    ...updates,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('mentor_bookings')
    .update(payload)
    .eq('id', bookingId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Mentor accepts an incoming booking request.
 * Transitions from awaiting_acceptance or payment_verified -> confirmed.
 * @param {string} bookingId
 * @param {string} mentorId
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function acceptBooking(bookingId, mentorId, { meetingLink = '', mentorNotes = '' } = {}) {
  const current = await getBookingById(bookingId)
  if (!current) throw new Error('Booking not found.')
  if (current.mentor_id !== mentorId) {
    throw new Error('Unauthorized: only the designated mentor can accept this booking.')
  }

  return transitionBookingStatus(bookingId, BOOKING_STATUSES.CONFIRMED, {
    meeting_link: meetingLink || 'https://meet.google.com/collivra-mentorship',
    mentor_notes: mentorNotes ? mentorNotes.trim() : 'Booking accepted by mentor.',
  })
}

/**
 * Mentor declines an incoming booking request.
 * Transitions from awaiting_acceptance -> rejected, initiating refund pending.
 * @param {string} bookingId
 * @param {string} mentorId
 * @param {string} rejectionReason
 * @returns {Promise<Object>}
 */
export async function rejectBooking(bookingId, mentorId, rejectionReason = '') {
  const current = await getBookingById(bookingId)
  if (!current) throw new Error('Booking not found.')
  if (current.mentor_id !== mentorId) {
    throw new Error('Unauthorized: only the designated mentor can reject this booking.')
  }

  const rejected = await transitionBookingStatus(bookingId, BOOKING_STATUSES.REJECTED, {
    rejection_reason: rejectionReason || 'Mentor is unavailable at the requested time.',
  })

  // Automatically queue refund workflow
  return transitionBookingStatus(bookingId, BOOKING_STATUSES.REFUND_PENDING, {
    rejection_reason: rejectionReason || 'Mentor declined — full refund queued.',
  })
}

/**
 * Mentor proposes alternative session times.
 * @param {string} bookingId
 * @param {string} mentorId
 * @param {string[]} alternativeTimes
 * @param {string} mentorNotes
 * @returns {Promise<Object>}
 */
export async function proposeAlternativeTimes(bookingId, mentorId, alternativeTimes = [], mentorNotes = '') {
  const current = await getBookingById(bookingId)
  if (!current) throw new Error('Booking not found.')
  if (current.mentor_id !== mentorId) {
    throw new Error('Unauthorized: only the designated mentor can propose alternative times.')
  }

  const { data, error } = await supabase
    .from('mentor_bookings')
    .update({
      proposed_alternative_times: alternativeTimes,
      mentor_notes: mentorNotes ? mentorNotes.trim() : 'Mentor suggested alternative session times.',
    })
    .eq('id', bookingId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Cancels a booking according to cancellation policy.
 * @param {string} bookingId
 * @param {string} actorUserId
 * @param {string} reason
 * @returns {Promise<Object>}
 */
export async function cancelBooking(bookingId, actorUserId, reason = '') {
  const current = await getBookingById(bookingId)
  if (!current) throw new Error('Booking not found.')

  const wasPaid = [
    BOOKING_STATUSES.PAYMENT_VERIFIED,
    BOOKING_STATUSES.AWAITING_ACCEPTANCE,
    BOOKING_STATUSES.CONFIRMED,
  ].includes(current.status)

  const cancelled = await transitionBookingStatus(bookingId, BOOKING_STATUSES.CANCELLED, {
    cancellation_reason: reason || 'Cancelled by participant.',
  })

  // If payment was verified/captured, automatically advance to refund_pending
  if (wasPaid) {
    return transitionBookingStatus(bookingId, BOOKING_STATUSES.REFUND_PENDING, {
      cancellation_reason: reason || 'Cancelled by participant — refund pending.',
    })
  }

  return cancelled
}

/**
 * Marks a confirmed mentorship session as completed.
 * @param {string} bookingId
 * @param {string} mentorId
 * @returns {Promise<Object>}
 */
export async function completeBooking(bookingId, mentorId) {
  const current = await getBookingById(bookingId)
  if (!current) throw new Error('Booking not found.')
  if (current.mentor_id !== mentorId) {
    throw new Error('Unauthorized.')
  }

  return transitionBookingStatus(bookingId, BOOKING_STATUSES.COMPLETED)
}

/**
 * Retrieves all bookings for a student.
 * @param {string} studentId
 * @returns {Promise<Array>}
 */
export async function getBookingsForStudent(studentId) {
  if (!studentId) return []

  const { data, error } = await supabase
    .from('mentor_bookings')
    .select('*, mentor_profiles(*), mentor_packages(*), projects(id, name, domain)')
    .eq('student_id', studentId)
    .order('session_scheduled_at', { ascending: true })

  if (error) {
    console.warn('[MentorBookingService] Error loading student bookings:', error.message)
    return []
  }
  return data || []
}

/**
 * Retrieves all bookings for a mentor.
 * @param {string} mentorId
 * @returns {Promise<Array>}
 */
export async function getBookingsForMentor(mentorId) {
  if (!mentorId) return []

  const { data, error } = await supabase
    .from('mentor_bookings')
    .select('*, student_profiles(*), mentor_packages(*), projects(id, name, domain)')
    .eq('mentor_id', mentorId)
    .order('session_scheduled_at', { ascending: true })

  if (error) {
    console.warn('[MentorBookingService] Error loading mentor bookings:', error.message)
    return []
  }
  return data || []
}

