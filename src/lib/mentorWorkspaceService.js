/**
 * Collivra Mentor Workspace and Collaboration Service
 * Powers shared project workspace notes, code reviews, milestones, and feedback.
 */

import { supabase } from './supabaseClient.js'

/**
 * Retrieves all workspace collaboration notes for a project mentorship.
 * @param {string} projectId
 * @param {string} mentorId
 * @returns {Promise<Array>}
 */
export async function getWorkspaceNotes(projectId, mentorId = null) {
  if (!projectId) return []

  let query = supabase
    .from('mentor_workspace_notes')
    .select('*')
    .eq('project_id', projectId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (mentorId) {
    query = query.eq('mentor_id', mentorId)
  }

  const { data, error } = await query
  if (error) {
    console.warn('[MentorWorkspaceService] Error loading notes:', error.message)
    return []
  }
  return data || []
}

/**
 * Adds a new mentorship note or feedback entry.
 * @param {Object} noteData
 * @returns {Promise<Object>}
 */
export async function addWorkspaceNote({
  bookingId = null,
  projectId,
  mentorId,
  studentId,
  authorId,
  category = 'general',
  content,
  isPinned = false,
}) {
  if (!projectId) throw new Error('Project ID is required.')
  if (!mentorId) throw new Error('Mentor ID is required.')
  if (!studentId) throw new Error('Student ID is required.')
  if (!authorId) throw new Error('Author ID is required.')
  if (!content || !content.trim()) throw new Error('Note content cannot be empty.')

  const payload = {
    booking_id: bookingId || null,
    project_id: projectId,
    mentor_id: mentorId,
    student_id: studentId,
    author_id: authorId,
    category,
    content: content.trim(),
    is_pinned: Boolean(isPinned),
  }

  const { data, error } = await supabase
    .from('mentor_workspace_notes')
    .insert([payload])
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Retrieves milestones for a project.
 * @param {string} projectId
 * @returns {Promise<Array>}
 */
export async function getProjectMilestones(projectId) {
  if (!projectId) return []

  const { data, error } = await supabase
    .from('mentorship_milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('due_date', { ascending: true })

  if (error) {
    console.warn('[MentorWorkspaceService] Error loading milestones:', error.message)
    return []
  }
  return data || []
}

/**
 * Creates a new milestone.
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function createMilestone({
  projectId,
  mentorId,
  studentId,
  title,
  description = '',
  dueDate = null,
}) {
  if (!projectId || !mentorId || !studentId) {
    throw new Error('Project, mentor, and student IDs are required.')
  }
  if (!title || !title.trim()) {
    throw new Error('Milestone title is required.')
  }

  const payload = {
    project_id: projectId,
    mentor_id: mentorId,
    student_id: studentId,
    title: title.trim(),
    description: description ? description.trim() : null,
    due_date: dueDate || null,
    status: 'pending',
  }

  const { data, error } = await supabase
    .from('mentorship_milestones')
    .insert([payload])
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Updates a milestone status.
 * @param {string} milestoneId
 * @param {string} nextStatus
 * @returns {Promise<Object>}
 */
export async function toggleMilestoneStatus(milestoneId, nextStatus) {
  if (!milestoneId) throw new Error('Milestone ID is required.')

  const completedAt = nextStatus === 'completed' ? new Date().toISOString() : null

  const { data, error } = await supabase
    .from('mentorship_milestones')
    .update({ status: nextStatus, completed_at: completedAt })
    .eq('id', milestoneId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Submits a student review for a completed mentorship booking.
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function submitMentorReview({
  bookingId,
  mentorId,
  studentId,
  rating,
  reviewTitle = '',
  reviewText,
}) {
  if (!bookingId || !mentorId || !studentId) {
    throw new Error('Booking, mentor, and student IDs are required.')
  }
  const numericRating = Number(rating)
  if (isNaN(numericRating) || numericRating < 1.0 || numericRating > 5.0) {
    throw new Error('Rating must be between 1.0 and 5.0.')
  }
  if (!reviewText || reviewText.trim().length < 5) {
    throw new Error('Review feedback must be at least 5 characters.')
  }

  const payload = {
    booking_id: bookingId,
    mentor_id: mentorId,
    student_id: studentId,
    rating: numericRating,
    review_title: reviewTitle ? reviewTitle.trim() : null,
    review_text: reviewText.trim(),
    is_public: true,
  }

  const { data, error } = await supabase
    .from('mentor_reviews')
    .insert([payload])
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Retrieves public reviews for a mentor.
 * @param {string} mentorId
 * @returns {Promise<Array>}
 */
export async function getMentorReviews(mentorId) {
  if (!mentorId) return []

  const { data, error } = await supabase
    .from('mentor_reviews')
    .select('*, student_profiles(name, college, photo_url)')
    .eq('mentor_id', mentorId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[MentorWorkspaceService] Error loading reviews:', error.message)
    return []
  }
  return data || []
}

/**
 * Aggregates live performance statistics for a mentor dashboard.
 * @param {string} mentorId
 * @returns {Promise<Object>}
 */
export async function getMentorDashboardStats(mentorId) {
  if (!mentorId) {
    return { activeMentees: 0, totalSessions: 0, pendingRequests: 0, totalEarnings: 0 }
  }

  const [bookingsRes, subsRes, txRes] = await Promise.all([
    supabase.from('mentor_bookings').select('id, status').eq('mentor_id', mentorId),
    supabase.from('mentor_subscriptions').select('id, status').eq('mentor_id', mentorId).eq('status', 'active'),
    supabase.from('mentor_payment_transactions').select('amount').eq('mentor_id', mentorId).eq('status', 'captured'),
  ])

  const bookings = bookingsRes?.data || []
  const activeSubs = subsRes?.data || []
  const transactions = txRes?.data || []

  const completedSessions = bookings.filter((b) => b.status === 'completed').length
  const pendingRequests = bookings.filter((b) => b.status === 'awaiting_acceptance').length
  const totalEarnings = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

  return {
    activeMentees: activeSubs.length,
    completedSessions,
    pendingRequests,
    totalEarnings,
  }
}

