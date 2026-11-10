import { visibleMatches } from '../lib/matching'
import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { suggestTeam } from '../lib/gemini'
import { discoverMentorsForProject } from '../lib/mentorMatchingService'
import { useSubscription } from '../hooks/useSubscription'
import AppShell from '../components/AppShell'
import ConnectButton from '../components/ConnectButton'
import MentorBookingModal from '../components/MentorBookingModal'
import Icon from '../components/Icon'

export default function TeamRecommendation() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { tier: subscriptionTier, loading: subscriptionLoading } = useSubscription()
  const isPremium = subscriptionTier === 'premium'

  const [project, setProject] = useState(null)
  const [matches, setMatches] = useState([])
  const [suggestion, setSuggestion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const [createError, setCreateError] = useState('')

  // Alternative team selection state
  const [selectedAltIndex, setSelectedAltIndex] = useState(0)
  const [showCandidatePanel, setShowCandidatePanel] = useState(false)

  // Mentorship state (Phase 3)
  const [mentors, setMentors] = useState([])
  const [loadingMentors, setLoadingMentors] = useState(false)
  const [mentorCategoryFilter, setMentorCategoryFilter] = useState('all')
  const [bookingMentor, setBookingMentor] = useState(null)
  const [mentorNotice, setMentorNotice] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setSuggestError('')

      try {
        const { data: proj, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .maybeSingle()

        if (projectError) throw projectError
        if (!proj) throw new Error('Project not found.')

        if (cancelled) return
        setProject(proj)

        // Set initial mentor filter if project has a preference
        if (proj.mentor_preference && proj.mentor_preference !== 'none') {
          if (['college_professor', 'industry_expert'].includes(proj.mentor_preference)) {
            setMentorCategoryFilter(proj.mentor_preference)
          }
        }

        const { data: matchData, error: matchError } = await supabase
          .from('match_scores')
          .select('*, student_profiles(*)')
          .eq('project_id', projectId)
          .order('score_percent', { ascending: false })

        if (matchError) throw matchError

        const validMatches = visibleMatches(matchData)

        if (cancelled) return
        setMatches(validMatches)

        if (!validMatches.length) {
          setSuggestError(
            'No matched students found. Please run student matching first.'
          )
          return
        }

        if (!(proj.skills_required || []).length) {
          setSuggestError(
            'This project has no confirmed required skills. Update the project skills before generating a team.'
          )
          return
        }

        const result = await suggestTeam({
          projectId: proj.id,
          matchedStudents: validMatches.map((match) => ({
            student_id: match.student_id,
            name: match.student_profiles?.name,
            score_percent: match.score_percent,
            skill_overlap: match.skill_overlap,
          })),
          teamSize: proj.team_size,
        })

        if (cancelled) return

        if (!result?.recommended_team?.length && !result?.alternatives?.length) {
          throw new Error('AI did not return any recommended team combinations.')
        }

        setSuggestion(result)
      } catch (err) {
        if (!cancelled) {
          setSuggestError(
            err?.message || 'Could not generate team recommendations.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [projectId])

  // Load mentors alongside team comparison (Phase 3)
  useEffect(() => {
    let active = true

    async function loadMentors() {
      if (!projectId) return
      setLoadingMentors(true)
      try {
        const filter = mentorCategoryFilter === 'all' ? undefined : mentorCategoryFilter
        const res = await discoverMentorsForProject(projectId, { categoryFilter: filter, limit: 6 })
        if (active) {
          setMentors(res.all_matches || [])
        }
      } catch (err) {
        if (active) {
          console.warn('[TeamRecommendation] Could not load mentors:', err?.message)
        }
      } finally {
        if (active) setLoadingMentors(false)
      }
    }

    loadMentors()

    return () => {
      active = false
    }
  }, [projectId, mentorCategoryFilter])

  // Normalize alternatives array
  const alternatives = useMemo(() => {
    if (suggestion?.alternatives && suggestion.alternatives.length > 0) {
      return suggestion.alternatives
    }
    if (suggestion?.recommended_team?.length) {
      return [
        {
          id: 'team_a',
          label: 'Team A',
          badge: 'Top Overall Match',
          score: Math.round(suggestion.team_score || 0),
          team_score: Math.round(suggestion.team_score || 0),
          breakdown: suggestion.breakdown || null,
          missing_skills: suggestion.missing_skills || [],
          redundant_skills: suggestion.redundant_skills || [],
          recommended_team: suggestion.recommended_team,
          roles: suggestion.roles || {},
          reasoning: suggestion.reasoning || '',
          coaching_notes: suggestion.coaching_notes || '',
        },
      ]
    }
    return []
  }, [suggestion])

  const activeAlternative = alternatives[selectedAltIndex] || alternatives[0]

  const recommendedMembers = useMemo(() => {
    if (!activeAlternative) return []
    const memberIds = activeAlternative.recommended_team || []
    const roles = activeAlternative.roles || {}

    return matches
      .filter((match) => memberIds.includes(match.student_id))
      .map((match) => ({
        ...match.student_profiles,
        studentId: match.student_id,
        role: roles[match.student_id] || 'Team Member',
        skillMatch: Math.round(Number(match.score_percent) || 0),
        skillOverlap: match.skill_overlap || [],
      }))
  }, [activeAlternative, matches])

  // Candidate-level transparency: for every matched student, determine which
  // alternatives they appear in and explain why they may be excluded from others.
  const candidateBreakdown = useMemo(() => {
    if (!alternatives.length || !matches.length) return []

    return matches.map((match) => {
      const student = match.student_profiles || {}
      const studentId = match.student_id
      const individualScore = Math.round(Number(match.score_percent) || 0)
      const skillOverlap = match.skill_overlap || []

      const membershipByTeam = alternatives.map((alt) => {
        const teamIds = alt.recommended_team || []
        return teamIds.includes(studentId)
      })

      const appearsInCount = membershipByTeam.filter(Boolean).length
      const teamLabels = alternatives
        .filter((_, idx) => membershipByTeam[idx])
        .map((alt) => alt.label || `Team ${String.fromCharCode(65 + alternatives.indexOf(alt))}`)

      // Build per-team exclusion reason for teams this candidate is NOT in
      const exclusionReasons = alternatives.map((alt, idx) => {
        if (membershipByTeam[idx]) return null // they are IN this team

        const teamIds = new Set(alt.recommended_team || [])
        // Look for redundant skills: skills this candidate shares with an already-selected member
        const teamMatches = matches.filter((m) => teamIds.has(m.student_id))
        const teamSkills = new Set(
          teamMatches.flatMap((m) => (m.skill_overlap || []).map((s) => s.toLowerCase())),
        )
        const candidateSkills = skillOverlap.map((s) => s.toLowerCase())
        const overlapping = candidateSkills.filter((s) => teamSkills.has(s))

        const reasons = []
        if (overlapping.length > 0) {
          reasons.push(
            `Skill overlap with an already-selected member (${overlapping.slice(0, 2).join(', ')}).`,
          )
        }

        // Check if the team has complementary coverage without this candidate
        const projectSkillCount = (project?.skills_required || []).length
        const missingInThisAlt = alt.missing_skills || []
        const candidateCovers = skillOverlap.filter(
          (s) => missingInThisAlt.map((m) => m.toLowerCase()).includes(s.toLowerCase()),
        )
        if (candidateCovers.length === 0 && projectSkillCount > 0 && overlapping.length === 0) {
          reasons.push('Does not cover any additional required project skills beyond the selected members.')
        }

        const altLabel = alt.label || `Team ${String.fromCharCode(65 + idx)}`
        return reasons.length > 0
          ? `Excluded from ${altLabel}: ${reasons.join(' ')}`
          : `Not selected for ${altLabel} because a different combination achieved a higher overall compatibility score.`
      }).filter(Boolean)

      return {
        studentId,
        name: student.name || 'Student',
        branch: student.branch || student.department || null,
        college: student.college || null,
        individualScore,
        skillOverlap,
        membershipByTeam,
        appearsInCount,
        teamLabels,
        exclusionReasons,
      }
    }).sort((a, b) => b.individualScore - a.individualScore)
  }, [alternatives, matches, project])

  async function createTeam() {
    if (!project || !activeAlternative || !recommendedMembers.length) return

    setCreating(true)
    setCreateError('')

    try {
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
          project_id: project.id,
          overall_match_score: activeAlternative.score || activeAlternative.team_score || 0,
          coaching_notes: activeAlternative.coaching_notes || '',
        })
        .select()
        .single()

      if (teamError) throw teamError
      if (!team) throw new Error('Could not create the team.')

      const members = recommendedMembers.map((member) => ({
        team_id: team.id,
        student_id: member.studentId,
        role: member.role,
      }))

      const { error: membersError } = await supabase
        .from('team_members')
        .insert(members)

      if (membersError) {
        // avoid leaving an empty team if member insertion fails
        await supabase.from('teams').delete().eq('id', team.id)
        throw membersError
      }

      const { error: projectError } = await supabase
        .from('projects')
        .update({ status: 'active' })
        .eq('id', project.id)

      if (projectError) {
        throw projectError
      }

      navigate(`/team/${team.id}`)
    } catch (err) {
      setCreateError(
        err?.message || 'Could not create the recommended team.'
      )
    } finally {
      setCreating(false)
    }
  }

  function handleBookMentor(mentorMatch) {
    if (subscriptionLoading) return
    if (!isPremium) {
      setMentorNotice('Mentorship booking and sessions are included with Student Premium. Upgrade to connect directly with mentors.')
      return
    }
    setBookingMentor(mentorMatch)
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-content px-6 py-7">
          <div className="skeleton mb-4 h-8 w-1/3" />
          <div className="skeleton mb-3 h-20 w-full" />
          <div className="skeleton h-40 w-full" />
          <p className="mt-4 text-sm text-muted">
            Analyzing student profiles and generating alternative team combinations...
          </p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      breadcrumb={
        <span>
          My Projects <span className="mx-1">›</span>
          {project?.name} <span className="mx-1">›</span>
          Team Comparison
        </span>
      }
    >
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text">
                Team Comparison & Recommendations
              </h1>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {alternatives.length} {alternatives.length === 1 ? 'Option' : 'Options'}
              </span>
            </div>

            <p className="mt-1 text-sm text-muted">
              Project: <span className="font-medium text-text">{project?.name}</span>
              {project?.domain && ` • Domain: ${project.domain}`}
              {project?.team_size && ` • Target Size: ${project.team_size} members`}
            </p>
          </div>

          {activeAlternative && (
            <div className="flex items-center gap-3">
              <div className="flex h-[60px] w-[60px] flex-col items-center justify-center rounded-2xl border-2 border-accent bg-accent/10">
                <span className="text-lg font-black text-accent">
                  {Math.round(activeAlternative.score || activeAlternative.team_score || 0)}%
                </span>
              </div>

              <div>
                <p className="text-xs font-semibold text-text">
                  Selected Score
                </p>
                <p className="text-[11px] text-muted">
                  {activeAlternative.badge || 'Compatibility Score'}
                </p>
              </div>
            </div>
          )}
        </div>

        {!suggestion || alternatives.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6">
            <p className="text-sm text-text">
              {suggestError || 'No team recommendation alternatives are available.'}
            </p>

            <button
              onClick={() => navigate(`/project/${projectId}`)}
              className="mt-4 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
            >
              Back to Project
            </button>
          </div>
        ) : (
          <>
            {suggestion.notice && (
              <div className="mb-5 rounded-lg border border-border bg-surface2 px-4 py-2.5 text-xs text-textSecondary">
                {suggestion.notice}
              </div>
            )}

            {/* PHASE 2: Alternative Team Switcher Cards */}
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
                  Compare Alternative Combinations
                </h2>
                <span className="text-xs text-muted">
                  Select a team to inspect and form
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {alternatives.map((alt, idx) => {
                  const isSelected = idx === selectedAltIndex
                  const teamScore = Math.round(alt.score || alt.team_score || 0)
                  const missingCount = (alt.missing_skills || []).length
                  const coveredCount = Math.max(0, (project?.skills_required || []).length - missingCount)

                  return (
                    <button
                      key={alt.id || idx}
                      type="button"
                      onClick={() => setSelectedAltIndex(idx)}
                      className={`relative flex flex-col justify-between rounded-2xl border p-5 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/[0.03] shadow-card ring-2 ring-primary/20'
                          : 'border-border bg-surface hover:border-borderStrong hover:bg-surface2/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-bold text-text">
                            {alt.label || `Team ${String.fromCharCode(65 + idx)}`}
                          </span>

                          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                            {teamScore}%
                          </span>
                        </div>

                        <div className="mt-2">
                          <span className="inline-block rounded-md bg-surface2 px-2 py-0.5 text-[11px] font-semibold text-textSecondary">
                            {alt.badge || 'Alternative'}
                          </span>
                        </div>

                        <p className="mt-3 text-xs leading-relaxed text-textSecondary line-clamp-2">
                          {alt.reasoning}
                        </p>
                      </div>

                      <div className="mt-4 border-t border-border pt-3">
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span>
                            {(alt.recommended_team || []).length} members
                          </span>
                          <span>
                            {coveredCount}/{(project?.skills_required || []).length} skills covered
                          </span>
                        </div>

                        {isSelected && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-primary">
                            <span>✓</span>
                            <span>Selected for Formation</span>
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Comparison Summary Matrix */}
            {alternatives.length > 1 && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                <div className="border-b border-border bg-surface2 px-5 py-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                    At-A-Glance Metric Comparison
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        <th className="px-4 py-2.5 font-semibold text-muted">Alternative</th>
                        <th className="px-4 py-2.5 font-semibold text-muted">Core Badge</th>
                        <th className="px-4 py-2.5 font-semibold text-muted">Compatibility</th>
                        <th className="px-4 py-2.5 font-semibold text-muted">Skill Coverage</th>
                        <th className="px-4 py-2.5 font-semibold text-muted">Availability Fit</th>
                        <th className="px-4 py-2.5 font-semibold text-muted">Missing Skills</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alternatives.map((alt, idx) => (
                        <tr
                          key={alt.id || idx}
                          onClick={() => setSelectedAltIndex(idx)}
                          className={`cursor-pointer border-b border-border transition-colors last:border-0 ${
                            idx === selectedAltIndex ? 'bg-primary/5 font-medium' : 'hover:bg-surface2'
                          }`}
                        >
                          <td className="px-4 py-3 font-bold text-text">
                            {alt.label || `Team ${String.fromCharCode(65 + idx)}`}
                            {idx === selectedAltIndex && (
                              <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] text-white">Active</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-textSecondary">{alt.badge}</td>
                          <td className="px-4 py-3 font-bold text-accent">{Math.round(alt.score || alt.team_score || 0)}%</td>
                          <td className="px-4 py-3 text-text">
                            {alt.breakdown?.skill != null ? `${Math.round(alt.breakdown.skill)}%` : 'Evaluated'}
                          </td>
                          <td className="px-4 py-3 text-text">
                            {alt.breakdown?.availability != null ? `${Math.round(alt.breakdown.availability)}%` : 'Evaluated'}
                          </td>
                          <td className="px-4 py-3">
                            {(alt.missing_skills || []).length > 0 ? (
                              <span className="text-warning">
                                {alt.missing_skills.join(', ')}
                              </span>
                            ) : (
                              <span className="font-semibold text-accent">Full coverage</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Selected Alternative Details */}
            <div className="mb-6 rounded-2xl border border-border bg-surface p-5 shadow-card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-text">
                    Why {activeAlternative.label || 'this team'}?
                  </h2>
                  <p className="text-xs text-muted">
                    {activeAlternative.badge}
                  </p>
                </div>

                <span className="rounded-md bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
                  {suggestion.source === 'ai' ? 'Gemini AI Verified' : 'Deterministic Algorithm Evaluated'}
                </span>
              </div>

              <p className="m-0 text-sm leading-relaxed text-textSecondary">
                {activeAlternative.reasoning ||
                  'The recommendation was generated using verified student profile evidence and confirmed project requirements.'}
              </p>
            </div>

            {/* Selected Team Members Table */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-text">
                {activeAlternative.label || 'Selected Team'} Members
              </h2>

              <span className="text-xs text-muted">
                {recommendedMembers.length} students selected
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-surface2">
                    <th className="px-4 py-3 text-xs font-semibold text-muted">Student</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted">Assigned Role</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted">Skills</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted">Match</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted">Connect</th>
                  </tr>
                </thead>

                <tbody>
                  {recommendedMembers.map((member) => (
                    <tr
                      key={member.studentId}
                      className="border-b border-border last:border-0 hover:bg-surface2/40"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary">
                            {member.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>

                          <div>
                            <p className="m-0 text-sm font-semibold text-text">
                              {member.name || 'Student'}
                            </p>

                            <p className="m-0 text-[11px] text-muted">
                              {[member.branch || member.department, member.college].filter(Boolean).join(' • ') || 'Profile completed'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="inline-block rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                          {member.role}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {(member.skillOverlap || []).slice(0, 3).map((sk) => (
                            <span key={sk} className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-textSecondary">
                              {sk}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="text-sm font-bold text-accent">
                          {member.skillMatch}%
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="w-[120px]">
                          <ConnectButton studentId={member.studentId} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Candidate Transparency Panel — Why was each candidate selected or excluded? */}
            {candidateBreakdown.length > 0 && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                <button
                  type="button"
                  onClick={() => setShowCandidatePanel((v) => !v)}
                  className="flex w-full items-center justify-between border-b border-border bg-surface2 px-5 py-3 text-left"
                >
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                      Why Each Candidate Was Selected or Excluded
                    </h3>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Understand why a higher individual score may not lead to team selection (e.g. skill overlap, availability mismatch, better combination found).
                    </p>
                  </div>
                  <span className="ml-4 shrink-0 text-xs font-semibold text-primary">
                    {showCandidatePanel ? '▲ Hide' : '▼ Show All Candidates'}
                  </span>
                </button>

                {showCandidatePanel && (
                  <div className="divide-y divide-border">
                    {candidateBreakdown.map((c) => {
                      const isInActive = c.membershipByTeam[selectedAltIndex] ?? false
                      return (
                        <div
                          key={c.studentId}
                          className={`px-5 py-4 ${isInActive ? 'bg-primary/[0.025]' : ''}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary text-sm">
                                {c.name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-text">{c.name}</p>
                                <p className="text-[11px] text-muted">
                                  {[c.branch, c.college].filter(Boolean).join(' • ') || 'Profile completed'}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {/* Individual match score badge */}
                              <span className="rounded-md bg-surface2 px-2.5 py-1 text-xs font-bold text-textSecondary">
                                Individual score: {c.individualScore}%
                              </span>

                              {/* Team membership chips */}
                              {alternatives.map((alt, idx) => (
                                <span
                                  key={alt.id || idx}
                                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                    c.membershipByTeam[idx]
                                      ? 'bg-accent/15 text-accent'
                                      : 'bg-surface2 text-muted line-through opacity-60'
                                  }`}
                                >
                                  {alt.label || `Team ${String.fromCharCode(65 + idx)}`}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Matching skills */}
                          {c.skillOverlap.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {c.skillOverlap.slice(0, 5).map((sk) => (
                                <span key={sk} className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-textSecondary">
                                  {sk}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Exclusion explanations */}
                          {c.exclusionReasons.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {c.exclusionReasons.map((reason, ri) => (
                                <p key={ri} className="text-[11px] leading-relaxed text-warning">
                                  ⚠ {reason}
                                </p>
                              ))}
                            </div>
                          )}

                          {c.exclusionReasons.length === 0 && c.teamLabels.length > 0 && (
                            <p className="mt-2 text-[11px] text-accent">
                              ✓ Selected for {c.teamLabels.join(' and ')} based on overall team compatibility.
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Analysis Breakdown Bars */}
            {activeAlternative.breakdown && (
              <div className="my-6 rounded-2xl border border-border bg-surface p-5 shadow-card">
                <h3 className="mb-4 text-sm font-bold text-text">
                  Compatibility Breakdown for {activeAlternative.label}
                </h3>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(activeAlternative.breakdown).map(([key, value]) => (
                    <div key={key} className="rounded-xl bg-surface2 p-3">
                      <div className="mb-1.5 flex justify-between gap-3 text-xs">
                        <span className="capitalize text-muted">
                          {key.replaceAll('_', ' ')}
                        </span>
                        <span className="font-bold text-text">
                          {Math.round(Number(value) || 0)}%
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${Math.max(0, Math.min(100, Number(value) || 0))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing and Redundant Skills */}
            <div className="my-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
                <h3 className="mb-1 text-sm font-bold text-text">
                  Skills Not Fully Covered
                </h3>
                <p className="mb-3 text-xs text-muted">
                  Project requirements where additional learning or mentorship is advised.
                </p>

                {(activeAlternative.missing_skills || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {activeAlternative.missing_skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-accent">
                    ✓ All required project skills are covered by this team.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
                <h3 className="mb-1 text-sm font-bold text-text">
                  Reinforced & Redundant Skills
                </h3>
                <p className="mb-3 text-xs text-muted">
                  Skills where multiple members have intermediate or advanced depth.
                </p>

                {(activeAlternative.redundant_skills || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {activeAlternative.redundant_skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-lg border border-info/30 bg-info/10 px-2.5 py-1 text-xs font-medium text-info"
                      >
                        {skill} (2+ members)
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    Balanced skill distribution without duplicate heavy specializations.
                  </p>
                )}
              </div>
            </div>

            {/* AI Coaching Guidance */}
            {activeAlternative.coaching_notes && (
              <div className="my-5 rounded-2xl border border-border bg-surface p-5 shadow-card">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-base">💡</span>
                  <h3 className="text-sm font-bold text-text">
                    Team Working & Coordination Guidance
                  </h3>
                </div>

                <p className="m-0 text-sm leading-relaxed text-textSecondary">
                  {activeAlternative.coaching_notes}
                </p>
              </div>
            )}

            {/* Team Creation Actions */}
            {createError && (
              <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                {createError}
              </p>
            )}

            <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-text">
                  Ready to form {activeAlternative.label || 'this team'}?
                </p>
                <p className="text-xs text-muted">
                  This will create the team workspace, invite selected members, and activate project collaboration.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/project/${projectId}`)}
                  className="rounded-xl border border-border px-4 py-3 text-sm font-medium text-text hover:bg-surface2"
                >
                  View All Candidates
                </button>

                <button
                  type="button"
                  onClick={createTeam}
                  disabled={creating || !recommendedMembers.length}
                  className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                >
                  {creating ? 'Creating Team...' : `Confirm & Form ${activeAlternative.label || 'Team'} →`}
                </button>
              </div>
            </div>

            {/* PHASE 3: Mentor Recommendations Alongside Team Comparison */}
            <div className="mt-12 border-t border-border pt-8">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🎓</span>
                    <h2 className="text-xl font-bold text-text">
                      Recommended Mentors for this Project
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Complement your team with guidance from verified College Professors and Industry Experts.
                  </p>
                </div>

                <div className="flex rounded-lg bg-surface2 p-1 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setMentorCategoryFilter('all')}
                    className={`rounded-md px-3 py-1.5 transition-all ${
                      mentorCategoryFilter === 'all'
                        ? 'bg-surface text-text shadow-sm font-semibold'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    All Mentors
                  </button>
                  <button
                    type="button"
                    onClick={() => setMentorCategoryFilter('college_professor')}
                    className={`rounded-md px-3 py-1.5 transition-all ${
                      mentorCategoryFilter === 'college_professor'
                        ? 'bg-surface text-text shadow-sm font-semibold'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    College Professors
                  </button>
                  <button
                    type="button"
                    onClick={() => setMentorCategoryFilter('industry_expert')}
                    className={`rounded-md px-3 py-1.5 transition-all ${
                      mentorCategoryFilter === 'industry_expert'
                        ? 'bg-surface text-text shadow-sm font-semibold'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    Industry Experts
                  </button>
                </div>
              </div>

              {mentorNotice && (
                <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-xs text-warning">
                  <span>{mentorNotice}</span>
                  <button
                    type="button"
                    onClick={() => navigate('/pricing')}
                    className="shrink-0 rounded-lg bg-warning px-3 py-1.5 font-bold text-white hover:bg-warning/90"
                  >
                    View Plans
                  </button>
                </div>
              )}

              {loadingMentors ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="skeleton h-48 rounded-2xl" />
                  ))}
                </div>
              ) : mentors.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-muted">
                    No mentors currently matching this project's requirements.
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Mentors registered with expertise in {project?.domain || 'this domain'} will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {mentors.map((m) => {
                    const prof = m.mentor || {}
                    const isProf = prof.primary_category === 'college_professor'
                    const org = prof.institution_name || prof.company_name || prof.department || 'Verified Expert'
                    const roleTitle = prof.academic_designation || prof.company_role || prof.headline || (isProf ? 'Professor' : 'Industry Expert')
                    const matchPercent = Math.round(m.score || m.score_percent || 0)

                    return (
                      <div
                        key={prof.id || m.student_id}
                        className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-card"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {prof.photo_url ? (
                                <img
                                  src={prof.photo_url}
                                  alt={prof.full_name}
                                  className="h-11 w-11 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                                  {prof.full_name?.charAt(0)?.toUpperCase() || 'M'}
                                </div>
                              )}

                              <div>
                                <p className="text-sm font-bold text-text">
                                  {prof.full_name}
                                </p>
                                <p className="text-xs text-muted">
                                  {roleTitle} • {org}
                                </p>
                              </div>
                            </div>

                            <span className="shrink-0 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                              {matchPercent}%
                            </span>
                          </div>

                          <div className="mt-3">
                            <span className="rounded bg-surface2 px-2 py-0.5 text-[10px] font-semibold text-textSecondary">
                              {isProf ? 'College Professor' : 'Industry Expert'}
                            </span>
                          </div>

                          {m.match_reasons?.length > 0 && (
                            <p className="mt-3 text-xs leading-relaxed text-textSecondary">
                              {m.match_reasons[0]}
                            </p>
                          )}

                          {prof.expertise?.technical_skills?.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1">
                              {prof.expertise.technical_skills.slice(0, 3).map((sk) => (
                                <span
                                  key={sk}
                                  className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-muted"
                                >
                                  {sk}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 border-t border-border pt-3">
                          <button
                            type="button"
                            onClick={() => handleBookMentor(m)}
                            className="w-full rounded-xl border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
                          >
                            Book Mentorship Session
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Mentor Booking Modal */}
            {bookingMentor && (
              <MentorBookingModal
                mentor={bookingMentor.mentor}
                project={project}
                packages={bookingMentor.mentor?.packages || []}
                isOpen={Boolean(bookingMentor)}
                onClose={() => setBookingMentor(null)}
                onBookingSuccess={() => {
                  setBookingMentor(null)
                  setMentorNotice('Mentorship session request successfully submitted!')
                }}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
