/**
 * Collivra Mentor Package and Subscription Service
 * Pure ES module handling mentor package management, student subscriptions,
 * and lifecycle audit logging.
 */

import { supabase } from './supabaseClient.js'

export const PACKAGE_TIERS = {
  basic: {
    label: 'Basic Tier',
    description: 'Essential guidance, asynchronous reviews, and monthly check-ins.',
    defaultSessions: 1,
    defaultDurationWeeks: 4,
  },
  standard: {
    label: 'Standard Tier',
    description: 'Bi-weekly 1:1 sessions, milestone tracking, and code reviews.',
    defaultSessions: 2,
    defaultDurationWeeks: 4,
  },
  premium: {
    label: 'Premium Tier',
    description: 'Weekly 1:1 sessions, deep architecture guidance, priority support.',
    defaultSessions: 4,
    defaultDurationWeeks: 4,
  },
  custom: {
    label: 'Custom Tier',
    description: 'Tailored mentorship scope for specialized projects or capstones.',
    defaultSessions: 3,
    defaultDurationWeeks: 6,
  },
}

/**
 * Validates a package payload prior to submission.
 * @param {Object} pkg
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePackagePayload(pkg = {}) {
  if (!pkg.tier || !['basic', 'standard', 'premium', 'custom'].includes(pkg.tier)) {
    return { valid: false, error: 'Invalid package tier. Must be basic, standard, premium, or custom.' }
  }
  if (!pkg.name || typeof pkg.name !== 'string' || pkg.name.trim().length < 2) {
    return { valid: false, error: 'Package title must be at least 2 characters long.' }
  }
  const price = Number(pkg.price_usd)
  if (isNaN(price) || price < 0) {
    return { valid: false, error: 'Package price must be a valid non-negative number.' }
  }
  const duration = Number(pkg.duration_weeks)
  if (isNaN(duration) || duration < 1 || duration > 52) {
    return { valid: false, error: 'Duration must be between 1 and 52 weeks.' }
  }
  const sessions = Number(pkg.sessions_count)
  if (isNaN(sessions) || sessions < 1 || sessions > 50) {
    return { valid: false, error: 'Sessions count must be between 1 and 50.' }
  }
  return { valid: true }
}

/**
 * Fetch packages offered by a mentor.
 * @param {string} mentorId
 * @param {Object} options
 * @returns {Promise<Array>}
 */
export async function getMentorPackages(mentorId, options = {}) {
  if (!mentorId) return []

  let query = supabase
    .from('mentor_packages')
    .select('*')
    .eq('mentor_id', mentorId)
    .order('price_usd', { ascending: true })

  if (options.onlyActive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    console.warn('[MentorPackageService] Error fetching mentor packages:', error.message)
    return []
  }
  return data || []
}

/**
 * Fetch a single package by its UUID.
 * @param {string} packageId
 * @returns {Promise<Object|null>}
 */
export async function getMentorPackageById(packageId) {
  if (!packageId) return null

  const { data, error } = await supabase
    .from('mentor_packages')
    .select('*, mentor_profiles(*)')
    .eq('id', packageId)
    .maybeSingle()

  if (error) throw error
  return data || null
}

/**
 * Create or update a mentor package (one per tier per mentor).
 * @param {string} mentorId
 * @param {Object} packageData
 * @returns {Promise<Object>}
 */
export async function saveMentorPackage(mentorId, packageData = {}) {
  if (!mentorId) throw new Error('Mentor ID is required.')

  const validation = validatePackagePayload(packageData)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const payload = {
    mentor_id: mentorId,
    tier: packageData.tier,
    name: packageData.name.trim(),
    description: packageData.description ? packageData.description.trim() : null,
    price_usd: Number(packageData.price_usd),
    currency: packageData.currency || 'USD',
    billing_interval: packageData.billing_interval || 'monthly',
    duration_weeks: Number(packageData.duration_weeks) || 4,
    sessions_count: Number(packageData.sessions_count) || 1,
    chat_support: packageData.chat_support !== false,
    code_review: Boolean(packageData.code_review),
    project_review: Boolean(packageData.project_review),
    priority_support: Boolean(packageData.priority_support),
    benefits: Array.isArray(packageData.benefits) ? packageData.benefits.filter(Boolean) : [],
    limitations: Array.isArray(packageData.limitations) ? packageData.limitations.filter(Boolean) : [],
    is_active: packageData.is_active !== false,
  }

  // Check if existing package exists for this mentor & tier
  const { data: existing } = await supabase
    .from('mentor_packages')
    .select('id')
    .eq('mentor_id', mentorId)
    .eq('tier', packageData.tier)
    .maybeSingle()

  if (existing?.id) {
    const { data, error } = await supabase
      .from('mentor_packages')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase
      .from('mentor_packages')
      .insert([payload])
      .select()
      .single()

    if (error) throw error
    return data
  }
}

/**
 * Toggle a package's active status.
 * @param {string} packageId
 * @param {boolean} isActive
 * @returns {Promise<Object>}
 */
export async function togglePackageActive(packageId, isActive) {
  if (!packageId) throw new Error('Package ID is required.')

  const { data, error } = await supabase
    .from('mentor_packages')
    .update({ is_active: Boolean(isActive) })
    .eq('id', packageId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Delete a package.
 * @param {string} packageId
 * @returns {Promise<boolean>}
 */
export async function deleteMentorPackage(packageId) {
  if (!packageId) throw new Error('Package ID is required.')

  const { error } = await supabase
    .from('mentor_packages')
    .delete()
    .eq('id', packageId)

  if (error) throw error
  return true
}

/**
 * Fetch all subscriptions for a student.
 * @param {string} studentId
 * @returns {Promise<Array>}
 */
export async function getStudentSubscriptions(studentId) {
  if (!studentId) return []

  const { data, error } = await supabase
    .from('mentor_subscriptions')
    .select('*, mentor_packages(*), mentor_profiles(*), projects(id, name, domain)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[MentorPackageService] Error loading student subscriptions:', error.message)
    return []
  }
  return data || []
}

/**
 * Fetch subscriptions for a mentor's services.
 * @param {string} mentorId
 * @returns {Promise<Array>}
 */
export async function getMentorActiveSubscriptions(mentorId) {
  if (!mentorId) return []

  const { data, error } = await supabase
    .from('mentor_subscriptions')
    .select('*, mentor_packages(*), student_profiles(*), projects(id, name, domain)')
    .eq('mentor_id', mentorId)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[MentorPackageService] Error loading mentor subscriptions:', error.message)
    return []
  }
  return data || []
}

/**
 * Request cancellation of a student subscription at period end.
 * @param {string} subscriptionId
 * @param {string} reason
 * @returns {Promise<Object>}
 */
export async function cancelMentorSubscription(subscriptionId, reason = '') {
  if (!subscriptionId) throw new Error('Subscription ID is required.')

  const { data: sub, error: subErr } = await supabase
    .from('mentor_subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .single()

  if (subErr || !sub) throw new Error('Subscription not found.')

  const { data, error } = await supabase
    .from('mentor_subscriptions')
    .update({
      cancel_at_period_end: true,
      cancellation_reason: reason || 'Cancelled by student',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId)
    .select()
    .single()

  if (error) throw error

  // Log in subscription history
  await supabase.from('mentor_subscription_history').insert([
    {
      subscription_id: subscriptionId,
      action: 'cancellation_requested',
      from_status: sub.status,
      to_status: sub.status,
      notes: reason || 'Student scheduled cancellation at period end',
    },
  ])

  return data
}

/**
 * Retrieve audit history for a subscription.
 * @param {string} subscriptionId
 * @returns {Promise<Array>}
 */
export async function getSubscriptionHistory(subscriptionId) {
  if (!subscriptionId) return []

  const { data, error } = await supabase
    .from('mentor_subscription_history')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false })

  if (error) {
    console.warn('[MentorPackageService] Error loading history:', error.message)
    return []
  }
  return data || []
}

