/**
 * Collivra Mentor Profile Service
 * Client and API service layer for mentor profile management, expertise,
 * qualifications, portfolio projects, availability, and verification workflow.
 */

import { supabase } from './supabaseClient.js'

/**
 * Fetches the complete mentor profile for a given user ID,
 * including related expertise, qualifications, portfolio, availability, and verification documents.
 * @param {string} userId - Auth user ID
 * @returns {Promise<{ profile: Object|null, expertise: Object|null, qualifications: Array, portfolio: Array, availability: Object|null, verificationDocuments: Array }>}
 */
export async function getMentorProfile(userId) {
  if (!userId) return null

  // 1. Fetch core profile
  const { data: profile, error: profileErr } = await supabase
    .from('mentor_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (profileErr) {
    console.warn('[MentorProfileService] Error fetching profile:', profileErr.message)
    return null
  }

  if (!profile) return null

  // 2. Fetch related details in parallel
  const [expertiseRes, qualRes, portfolioRes, availRes, docsRes] = await Promise.all([
    supabase.from('mentor_expertise').select('*').eq('mentor_id', profile.id).maybeSingle(),
    supabase.from('mentor_qualifications').select('*').eq('mentor_id', profile.id).order('graduation_year', { ascending: false }),
    supabase.from('mentor_portfolio').select('*').eq('mentor_id', profile.id).order('created_at', { ascending: false }),
    supabase.from('mentor_availability').select('*').eq('mentor_id', profile.id).maybeSingle(),
    supabase.from('mentor_verification_documents').select('*').eq('mentor_id', profile.id).order('created_at', { ascending: false }),
  ])

  return {
    profile,
    expertise: expertiseRes?.data || null,
    qualifications: qualRes?.data || [],
    portfolio: portfolioRes?.data || [],
    availability: availRes?.data || null,
    verificationDocuments: docsRes?.data || [],
  }
}

/**
 * Creates a new mentor profile for an authenticated user.
 * @param {Object} data - Profile fields
 * @returns {Promise<Object>} Created profile
 */
export async function createMentorProfile(data) {
  const payload = {
    user_id: data.user_id,
    full_name: data.full_name?.trim() || 'Anonymous Mentor',
    headline: data.headline?.trim() || '',
    bio: data.bio?.trim() || '',
    photo_url: data.photo_url || null,
    location: data.location?.trim() || '',
    contact_email: data.contact_email?.trim() || '',
    contact_preferences: data.contact_preferences || { email: true, in_app: true },
    primary_category: data.primary_category || 'industry_expert',
    categories: Array.isArray(data.categories) && data.categories.length > 0 ? data.categories : [data.primary_category || 'industry_expert'],
    institution_name: data.institution_name?.trim() || null,
    department: data.department?.trim() || null,
    academic_designation: data.academic_designation?.trim() || null,
    company_name: data.company_name?.trim() || null,
    company_role: data.company_role?.trim() || null,
    years_of_experience: Number(data.years_of_experience) || 0,
    certifications: Array.isArray(data.certifications) ? data.certifications : [],
    achievements: Array.isArray(data.achievements) ? data.achievements : [],
    is_active: data.is_active !== false,
    verification_status: 'unverified', // strictly starts as unverified
    offered_tiers: ['basic'],
  }

  const { data: created, error } = await supabase
    .from('mentor_profiles')
    .insert(payload)
    .select()
    .single()

  if (error) throw error

  // Initialize companion expertise & availability records
  await Promise.all([
    supabase.from('mentor_expertise').insert({
      mentor_id: created.id,
      technical_skills: data.technical_skills || [],
      domain_expertise: data.domain_expertise || [],
      research_interests: data.research_interests || [],
      tech_stack: data.tech_stack || [],
      mentorship_topics: data.mentorship_topics || [],
    }),
    supabase.from('mentor_availability').insert({
      mentor_id: created.id,
      is_available: true,
      weekly_hours: Number(data.weekly_hours) || 5,
      timezone: data.timezone || 'UTC',
      max_active_mentees: Number(data.max_active_mentees) || 3,
    }),
  ])

  return created
}

/**
 * Updates permitted mentor profile information.
 * @param {string} mentorId - Mentor profile ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>}
 */
export async function updateMentorProfile(mentorId, updates) {
  // Prevent client from updating verification status directly through profile update
  const {
    id: _id,
    user_id: _uid,
    verification_status: _vs,
    verified_at: _va,
    verified_by: _vb,
    ...permitted
  } = updates

  const { data, error } = await supabase
    .from('mentor_profiles')
    .update(permitted)
    .eq('id', mentorId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Upserts mentor technical and domain expertise.
 * @param {string} mentorId
 * @param {Object} expertise
 * @returns {Promise<Object>}
 */
export async function saveMentorExpertise(mentorId, expertise) {
  const payload = {
    mentor_id: mentorId,
    technical_skills: Array.isArray(expertise.technical_skills) ? expertise.technical_skills : [],
    domain_expertise: Array.isArray(expertise.domain_expertise) ? expertise.domain_expertise : [],
    research_interests: Array.isArray(expertise.research_interests) ? expertise.research_interests : [],
    tech_stack: Array.isArray(expertise.tech_stack) ? expertise.tech_stack : [],
    industry_specializations: Array.isArray(expertise.industry_specializations) ? expertise.industry_specializations : [],
    mentorship_topics: Array.isArray(expertise.mentorship_topics) ? expertise.mentorship_topics : [],
  }

  // Check if expertise row exists
  const { data: existing } = await supabase
    .from('mentor_expertise')
    .select('id')
    .eq('mentor_id', mentorId)
    .maybeSingle()

  if (existing?.id) {
    const { data, error } = await supabase
      .from('mentor_expertise')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('mentor_expertise')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Updates mentor availability and scheduling constraints.
 * @param {string} mentorId
 * @param {Object} availability
 * @returns {Promise<Object>}
 */
export async function saveMentorAvailability(mentorId, availability) {
  const payload = {
    mentor_id: mentorId,
    is_available: availability.is_available !== false,
    weekly_hours: Math.max(1, Math.min(168, Number(availability.weekly_hours) || 5)),
    timezone: availability.timezone || 'UTC',
    preferred_days: availability.preferred_days || ['Monday', 'Wednesday', 'Friday'],
    preferred_time_slots: availability.preferred_time_slots || ['Evening (6 PM - 9 PM)'],
    max_active_mentees: Math.max(1, Math.min(50, Number(availability.max_active_mentees) || 3)),
  }

  const { data: existing } = await supabase
    .from('mentor_availability')
    .select('id')
    .eq('mentor_id', mentorId)
    .maybeSingle()

  if (existing?.id) {
    const { data, error } = await supabase
      .from('mentor_availability')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('mentor_availability')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Adds an academic qualification to the mentor profile.
 */
export async function addMentorQualification(mentorId, qualification) {
  const { data, error } = await supabase
    .from('mentor_qualifications')
    .insert({
      mentor_id: mentorId,
      degree: qualification.degree?.trim(),
      institution: qualification.institution?.trim(),
      field_of_study: qualification.field_of_study?.trim() || null,
      graduation_year: Number(qualification.graduation_year) || null,
      is_highest: Boolean(qualification.is_highest),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Deletes a qualification.
 */
export async function deleteMentorQualification(qualificationId) {
  const { error } = await supabase
    .from('mentor_qualifications')
    .delete()
    .eq('id', qualificationId)

  if (error) throw error
}

/**
 * Adds a portfolio project.
 */
export async function addMentorPortfolioProject(mentorId, project) {
  const { data, error } = await supabase
    .from('mentor_portfolio')
    .insert({
      mentor_id: mentorId,
      title: project.title?.trim(),
      description: project.description?.trim() || null,
      technologies: Array.isArray(project.technologies) ? project.technologies : [],
      project_url: project.project_url?.trim() || null,
      achievements: project.achievements?.trim() || null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Deletes a portfolio project.
 */
export async function deleteMentorPortfolioProject(portfolioId) {
  const { error } = await supabase
    .from('mentor_portfolio')
    .delete()
    .eq('id', portfolioId)

  if (error) throw error
}

/**
 * Submits verification document and moves mentor verification status to 'pending'.
 * @param {string} mentorId
 * @param {Object} documentInfo
 * @returns {Promise<{ document: Object, profile: Object }>}
 */
export async function submitMentorVerification(mentorId, documentInfo) {
  if (!documentInfo.document_name?.trim()) {
    throw new Error('Please provide a document or credential name.')
  }

  // 1. Insert verification document
  const { data: doc, error: docError } = await supabase
    .from('mentor_verification_documents')
    .insert({
      mentor_id: mentorId,
      document_type: documentInfo.document_type || 'institutional_id',
      document_url: documentInfo.document_url?.trim() || 'https://verified.collivra.local/credentials/doc-ref',
      document_name: documentInfo.document_name.trim(),
      notes: documentInfo.notes?.trim() || null,
      status: 'pending',
    })
    .select()
    .single()

  if (docError) throw docError

  // 2. Transition profile verification_status to 'pending'
  const { data: updatedProfile, error: profError } = await supabase
    .from('mentor_profiles')
    .update({
      verification_status: 'pending',
      rejection_reason: null,
    })
    .eq('id', mentorId)
    .select()
    .single()

  if (profError) throw profError

  return { document: doc, profile: updatedProfile }
}

/**
 * Administrative review function for verification (used by admin workflows or dev mode).
 * @param {string} mentorId
 * @param {{ approved: boolean, rejectionReason?: string, reviewerId?: string }} review
 */
export async function reviewMentorVerification(mentorId, { approved, rejectionReason, reviewerId }) {
  const status = approved ? 'verified' : 'rejected'
  const payload = {
    verification_status: status,
    rejection_reason: approved ? null : (rejectionReason || 'Verification document did not meet institutional standards.'),
    verified_at: approved ? new Date().toISOString() : null,
    verified_by: approved ? (reviewerId || null) : null,
  }

  const { data, error } = await supabase
    .from('mentor_profiles')
    .update(payload)
    .eq('id', mentorId)
    .select()
    .single()

  if (error) throw error

  // Update latest verification document status
  await supabase
    .from('mentor_verification_documents')
    .update({
      status: approved ? 'approved' : 'rejected',
      rejection_reason: payload.rejection_reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId || null,
    })
    .eq('mentor_id', mentorId)

  return data
}

