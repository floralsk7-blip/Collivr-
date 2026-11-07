/**
 * Collivra Mentor Matching Service
 * Client discovery service querying normalized mentor records and executing
 * the deterministic matching engine with optional Gemini AI explanation refinement.
 */

import { supabase } from './supabaseClient.js'
import { rankMentorsForProject } from './mentorMatchingEngine.js'

/**
 * Discovers and ranks eligible College Professors and Industry Experts for a project.
 * @param {string|Object} projectOrId - Project UUID or project object
 * @param {Object} options - Filters and pagination options
 * @returns {Promise<{ all_matches: Array, college_professors: Array, industry_experts: Array, project: Object }>}
 */
export async function discoverMentorsForProject(projectOrId, options = {}) {
  let project = null

  if (typeof projectOrId === 'string') {
    const { data: proj, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectOrId)
      .maybeSingle()

    if (projErr) throw projErr
    project = proj
  } else if (projectOrId && typeof projectOrId === 'object') {
    project = projectOrId
  }

  if (!project) {
    throw new Error('Project information is required to discover matching mentors.')
  }

  // Fetch companion AI analysis if available
  if (project.id) {
    const { data: analysis } = await supabase
      .from('ai_analysis')
      .select('*')
      .eq('project_id', project.id)
      .maybeSingle()

    if (analysis) {
      project = {
        ...project,
        required_expertise: analysis.mentor_focus_areas || analysis.identified_roles || [],
        skill_gaps: analysis.skill_gaps || [],
        project_complexity: project.experience_required,
        ai_guidance_notes: analysis.mentor_guidance_notes || null,
      }
    }
  }

  // 1. Fetch active mentor profiles from normalized mentor_profiles table
  const { data: rawMentors, error: mentorErr } = await supabase
    .from('mentor_profiles')
    .select('*')
    .eq('is_active', true)
    .limit(options.limit || 100)

  if (mentorErr) {
    console.warn('[MentorMatchingService] Error loading mentor_profiles:', mentorErr.message)
    return { all_matches: [], college_professors: [], industry_experts: [], project }
  }

  const mentorList = rawMentors || []
  if (mentorList.length === 0) {
    return { all_matches: [], college_professors: [], industry_experts: [], project }
  }

  // 2. Fetch companion data (expertise, availability, portfolio, qualifications, packages)
  const mentorIds = mentorList.map((m) => m.id)

  const [expRes, availRes, portRes, qualRes, pkgRes] = await Promise.all([
    supabase.from('mentor_expertise').select('*').in('mentor_id', mentorIds),
    supabase.from('mentor_availability').select('*').in('mentor_id', mentorIds),
    supabase.from('mentor_portfolio').select('*').in('mentor_id', mentorIds),
    supabase.from('mentor_qualifications').select('*').in('mentor_id', mentorIds),
    supabase.from('mentor_packages').select('*').in('mentor_id', mentorIds).eq('is_active', true),
  ])

  const expByMentor = new Map((expRes?.data || []).map((e) => [e.mentor_id, e]))
  const availByMentor = new Map((availRes?.data || []).map((a) => [a.mentor_id, a]))
  const portByMentor = new Map()
  for (const p of portRes?.data || []) {
    if (!portByMentor.has(p.mentor_id)) portByMentor.set(p.mentor_id, [])
    portByMentor.get(p.mentor_id).push(p)
  }
  const qualByMentor = new Map()
  for (const q of qualRes?.data || []) {
    if (!qualByMentor.has(q.mentor_id)) qualByMentor.set(q.mentor_id, [])
    qualByMentor.get(q.mentor_id).push(q)
  }
  const pkgByMentor = new Map()
  for (const pkg of pkgRes?.data || []) {
    if (!pkgByMentor.has(pkg.mentor_id)) pkgByMentor.set(pkg.mentor_id, [])
    pkgByMentor.get(pkg.mentor_id).push(pkg)
  }

  // 3. Assemble full mentor domain models
  const enrichedMentors = mentorList.map((m) => ({
    ...m,
    expertise: expByMentor.get(m.id) || null,
    availability: availByMentor.get(m.id) || null,
    portfolio: portByMentor.get(m.id) || [],
    qualifications: qualByMentor.get(m.id) || [],
    packages: pkgByMentor.get(m.id) || [],
  }))

  // 4. Run deterministic multi-factor ranking engine
  const rankedResults = rankMentorsForProject(project, enrichedMentors, {
    categoryFilter: options.categoryFilter,
    student_budget: options.student_budget,
    currentUserId: options.currentUserId,
  })

  return {
    ...rankedResults,
    project,
  }
}

