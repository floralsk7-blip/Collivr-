import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useSubscription } from '../hooks/useSubscription'
import { analyzeProject } from '../lib/gemini'
import { fetchMentorRequirements, deriveRequirementsForType } from '../lib/mentorService'
import { analyzeMentorRequirementsRuleBased } from '../lib/mentorRequirements'
import AppShell from '../components/AppShell'

const DOMAINS = [
  'AI/ML',
  'Web Development',
  'Mobile',
  'Data Science',
  'Cybersecurity',
  'IoT',
  'Sustainability',
  'HealthTech',
  'FinTech',
  'Other',
]

const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced']

const STEP_LABELS = [
  'Project Details',
  'Team Requirements',
  'AI Analysis',
  'Mentor Preference',
  'Review & Publish',
]

const MENTOR_PREFERENCE_OPTIONS = [
  {
    id: 'none',
    title: 'No mentor needed',
    description: 'I want to manage my project independently.',
    icon: '👤',
  },
  {
    id: 'professor',
    title: 'College Professor',
    description:
      'Get academic, research and technical guidance from college professors and faculty members.',
    icon: '🎓',
  },
  {
    id: 'industry',
    title: 'Industry Expert',
    description:
      'Get practical guidance from experienced developers, engineers, founders and industry professionals.',
    icon: '💼',
  },
  {
    id: 'ai',
    title: 'Let Collivra AI recommend',
    description:
      'Let AI analyze my project requirements and suggest the most suitable mentor type.',
    icon: '✨',
  },
]

const DRAFT_STORAGE_KEY = 'collivra_create_project_draft_v2'

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Ignore private browsing or quota issues
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    // Ignore
  }
}

function roleIcon(role) {
  const r = role.toLowerCase()

  if (r.includes('ml') || r.includes('ai')) return '🧠'
  if (r.includes('back')) return '🗄️'
  if (r.includes('front')) return '🎨'
  if (r.includes('research') || r.includes('domain')) return '📚'
  if (r.includes('mobile')) return '📱'
  if (r.includes('data')) return '📊'

  return '💡'
}

function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('')

  function addTag(e) {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()

      const newTag = input.trim()

      if (!tags.some((tag) => tag.toLowerCase() === newTag.toLowerCase())) {
        onChange([...tags, newTag])
      }

      setInput('')
    }
  }

  return (
    <div className="rounded-[9px] border border-border bg-surface px-3 py-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-md border border-border bg-surface2 px-2.5 py-1 text-xs font-medium text-primary"
          >
            {tag}

            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="text-primary/60 hover:text-primary"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={addTag}
          placeholder={placeholder}
          className="min-w-[120px] flex-1 bg-transparent py-1 text-sm text-text placeholder:text-muted focus:outline-none"
        />
      </div>
    </div>
  )
}

export default function CreateProject() {
  const { user } = useAuth()
  const { tier, loading: subscriptionLoading } = useSubscription()
  const navigate = useNavigate()
  const [showMentorUpgrade, setShowMentorUpgrade] = useState(false)

  const hasMentorPremium = tier === 'premium' || tier === 'college'

  const savedDraft = loadDraft()
  const [step, setStep] = useState(() => {
    const rawStep = Number(savedDraft?.step)
    return Number.isFinite(rawStep) && rawStep >= 1 && rawStep <= 5 ? rawStep : 1
  })

  const [form, setForm] = useState(
    savedDraft?.form || {
      name: '',
      description: '',
      domain: DOMAINS[0],
      deadline: '',
      team_size: 4,
      skills_required: [],
      experience_required: EXPERIENCE_LEVELS[1],
      mentor_preference: 'none',
      mentor_type_selection: '',
    }
  )

  const needsMentorUpgrade = (form.mentor_preference || 'none') !== 'none' && !hasMentorPremium

  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState(savedDraft?.analysis || null)
  const [project, setProject] = useState(savedDraft?.project || null)
  const [error, setError] = useState('')

  const [mentorAnalysis, setMentorAnalysis] = useState(savedDraft?.mentorAnalysis || null)
  const [analyzingMentor, setAnalyzingMentor] = useState(false)
  const [mentorAnalysisError, setMentorAnalysisError] = useState('')
  const [schemaNotice, setSchemaNotice] = useState('')

  useEffect(() => {
    saveDraft({ step, form, project, analysis, mentorAnalysis })
  }, [step, form, project, analysis, mentorAnalysis])

  function isMissingColumnError(err, columnName) {
    if (!err) return false
    const target = String(columnName).toLowerCase()
    const msg = String(err.message || '').toLowerCase()
    const details = String(err.details || '').toLowerCase()
    const hint = String(err.hint || '').toLowerCase()
    return (
      msg.includes(target) ||
      details.includes(target) ||
      hint.includes(target) ||
      err.code === 'PGRST204' ||
      err.code === '42703'
    )
  }

  function update(field, value) {
    setForm((f) => ({
      ...f,
      [field]: value,
    }))
  }

  async function runMentorAnalysis(overrideContext) {
    setAnalyzingMentor(true)
    setMentorAnalysisError('')
    try {
      const context = overrideContext || {
        projectId: project?.id,
        name: form.name,
        description: form.description,
        domain: form.domain,
        skills_required: form.skills_required,
        experience_required: form.experience_required,
        identified_roles: analysis?.identified_roles,
        skill_gaps: analysis?.skill_gaps,
        project_complexity: analysis?.project_complexity,
        reasoning: analysis?.reasoning,
      }
      const result = await fetchMentorRequirements(context)
      if (result) {
        setMentorAnalysis(result)
        if (!form.mentor_type_selection) {
          const recTypes = result.recommended_mentor_types || []
          let defaultChoice = 'both'
          if (recTypes.length === 1) {
            defaultChoice = recTypes[0].toLowerCase().includes('professor') ? 'professor' : 'industry'
          }
          update('mentor_type_selection', defaultChoice)
        }
      }
    } catch (err) {
      console.warn('Mentor requirement analysis error:', err)
      setMentorAnalysisError(
        err?.message || 'Could not complete AI mentor analysis. You can retry or use rule-based analysis.'
      )
    } finally {
      setAnalyzingMentor(false)
    }
  }

  function handleSelectMentorPreference(prefId) {
    if (prefId !== 'none' && (subscriptionLoading || !hasMentorPremium)) {
      setShowMentorUpgrade(true)
      return
    }
    setShowMentorUpgrade(false)
    update('mentor_preference', prefId)
    if (prefId === 'ai') {
      if (!mentorAnalysis) {
        runMentorAnalysis()
      }
    } else if (prefId === 'professor') {
      update('mentor_type_selection', 'professor')
    } else if (prefId === 'industry') {
      update('mentor_type_selection', 'industry')
    } else {
      update('mentor_type_selection', '')
    }
  }

  async function goToAnalysis() {
    if (!user?.id) {
      setError('Please sign in before creating a project.')
      return
    }

    setStep(3)
    setError('')
    setAnalysis(null)
    setSaving(true)

    const payload = {
      creator_id: user.id,
      name: form.name.trim(),
      description: form.description.trim(),
      domain: form.domain,
      deadline: form.deadline || null,
      team_size: Number(form.team_size),
      skills_required: form.skills_required,
      experience_required: form.experience_required,
      mentor_preference: form.mentor_preference || 'none',
    }

    let created = project
    let insertError = null

    if (!created?.id) {
      let res = await supabase
        .from('projects')
        .insert(payload)
        .select()
        .single()

      if (res.error && (res.error.message?.includes('mentor_preference') || isMissingColumnError(res.error, 'mentor_preference'))) {
        setSchemaNotice(
          "Remote Database Notice: The 'mentor_preference' column is not yet present in this Supabase database (migration pending). Your mentor preference has been preserved in your session."
        )
        const { mentor_preference: _removed, ...fallbackPayload } = payload
        res = await supabase
          .from('projects')
          .insert(fallbackPayload)
          .select()
          .single()
      }

      created = res.data ? { ...res.data, mentor_preference: form.mentor_preference || 'none' } : null
      insertError = res.error
    } else {
      let res = await supabase
        .from('projects')
        .update(payload)
        .eq('id', created.id)
        .eq('creator_id', user.id)
        .select()
        .single()

      if (res.error && (res.error.message?.includes('mentor_preference') || isMissingColumnError(res.error, 'mentor_preference'))) {
        setSchemaNotice(
          "Remote Database Notice: The 'mentor_preference' column is not yet present in this Supabase database (migration pending). Your mentor preference has been preserved in your session."
        )
        const { mentor_preference: _removed, ...fallbackPayload } = payload
        res = await supabase
          .from('projects')
          .update(fallbackPayload)
          .eq('id', created.id)
          .eq('creator_id', user.id)
          .select()
          .single()
      }

      if (res.data) created = { ...res.data, mentor_preference: form.mentor_preference || 'none' }
      insertError = res.error
    }

    setSaving(false)

    if (insertError || !created) {
      setError(insertError?.message || 'Could not create project.')
      setStep(2)
      return
    }

    setProject(created)
    setAnalyzing(true)

    try {
      const result = await analyzeProject({
        projectId: created.id,
      })

      if (!result) {
        throw new Error('The AI returned an empty response.')
      }

      setAnalysis(result)

      // use gemini-extracted skills while retaining any skills
      // the user already entered manually.
      const extractedSkills = Array.isArray(result.required_skills)
        ? result.required_skills
        : Array.isArray(result.analysis?.required_skills)
          ? result.analysis.required_skills
          : []

      const combinedSkills = [
        ...form.skills_required,
        ...extractedSkills,
      ]
        .map((skill) => String(skill).trim())
        .filter(Boolean)
        .filter(
          (skill, index, array) =>
            array.findIndex(
              (item) => item.toLowerCase() === skill.toLowerCase()
            ) === index
        )

      update('skills_required', combinedSkills)
    } catch (err) {
      console.warn('AI analysis unavailable:', err)
      setError(
        err?.message
          ? `AI Analysis Note: ${err.message}`
          : 'AI analysis could not complete. You can continue with your manual skills below.'
      )
    } finally {
      setAnalyzing(false)
    }
  }

  function canProceedStep1() {
    return form.name.trim().length > 0 &&
      form.description.trim().length >= 20
  }

  const selectedPreference =
    MENTOR_PREFERENCE_OPTIONS.find(
      (opt) => opt.id === (form.mentor_preference || 'none')
    ) || MENTOR_PREFERENCE_OPTIONS[0]

  const insights = (() => {
    if (!analysis) return []

    const notes = (analysis.sustainability_notes || '')
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .slice(0, 3)

    if (notes.length >= 3) return notes

    const gaps = (analysis.skill_gaps || []).map(
      (gap) => `Consider adding expertise in ${gap}.`
    )

    return [...notes, ...gaps].slice(0, 3)
  })()

  async function confirmAnalysis() {
    setSaving(true)
    setError('')

    try {
      const confirmedSkills = (form.skills_required || [])
        .map((skill) => skill.trim())
        .filter(Boolean)

      if (project?.id && user?.id) {
        const { error: updateError } = await supabase
          .from('projects')
          .update({
            skills_required: confirmedSkills,
          })
          .eq('id', project.id)
          .eq('creator_id', user.id)

        if (updateError) {
          console.warn('Skills database update warning:', updateError.message)
        }
      }

      setStep(4)
    } catch (err) {
      console.warn('Could not save confirmed skills:', err)
      setStep(4)
    } finally {
      setSaving(false)
    }
  }

  async function confirmMentorPreference() {
    if ((form.mentor_preference || 'none') !== 'none' && !hasMentorPremium) {
      setShowMentorUpgrade(true)
      return
    }
    setSaving(true)
    setError('')
    try {
      const chosenPreference =
        form.mentor_preference === 'ai'
          ? form.mentor_type_selection ||
            (mentorAnalysis?.recommended_mentor_types?.length > 1
              ? 'both'
              : mentorAnalysis?.recommended_mentor_types?.[0]?.toLowerCase()?.includes('professor')
                ? 'professor'
                : 'industry') ||
            'both'
          : form.mentor_preference || 'none'

      if (project) {
        setProject((p) => ({ ...p, mentor_preference: chosenPreference }))
      }

      if (project?.id && user?.id) {
        const payload = { mentor_preference: chosenPreference }
        let res = await supabase
          .from('projects')
          .update(payload)
          .eq('id', project.id)
          .eq('creator_id', user.id)

        if (res.error && (res.error.message?.includes('mentor_preference') || isMissingColumnError(res.error, 'mentor_preference'))) {
          setSchemaNotice(
            "Remote Database Notice: The 'mentor_preference' column is not yet present in this Supabase database (migration pending). Your mentor preference has been preserved in your project session."
          )
          // Fallback if database column constraint lacks 'both'
          if (chosenPreference === 'both') {
            await supabase
              .from('projects')
              .update({ mentor_preference: 'ai' })
              .eq('id', project.id)
              .eq('creator_id', user.id)
          }
        }

        if (mentorAnalysis) {
          try {
            await supabase
              .from('ai_analysis')
              .update({
                recommended_mentor_type: mentorAnalysis.recommended_mentor_types?.join(' & '),
                mentor_focus_areas: mentorAnalysis.required_expertise,
                mentor_guidance_notes: mentorAnalysis.analysis_summary,
              })
              .eq('project_id', project.id)
          } catch {
            // Non-blocking
          }
        }
      }
    } catch (err) {
      console.warn('Confirm mentor preference non-blocking error:', err)
    } finally {
      setSaving(false)
      setStep(5)
    }
  }

  function handlePublish() {
    if ((form.mentor_preference || 'none') !== 'none' && !hasMentorPremium) {
      setStep(4)
      setShowMentorUpgrade(true)
      return
    }
    clearDraft()
    navigate(project ? `/project/${project.id}` : '/discover')
  }

  return (
    <AppShell breadcrumb={<span>Create a New Project</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <div className="mb-8 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-lg text-muted hover:text-text"
          >
            ←
          </button>

          <h1 className="text-[19px] font-bold text-text">
            Create a New Project
          </h1>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        {schemaNotice && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-300">
            <p className="font-semibold">⚠️ Database Notice</p>
            <p className="mt-0.5 leading-relaxed">{schemaNotice}</p>
          </div>
        )}

        {saving && (
          <p className="mb-4 text-sm text-muted">
            Saving your project...
          </p>
        )}

        <div className="flex flex-col gap-8 md:flex-row">
          {/* step navigation */}

          <div className="flex shrink-0 flex-row flex-wrap gap-3 overflow-x-auto pb-2 md:w-[220px] md:flex-col md:flex-nowrap md:overflow-visible md:pb-0">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1
              const isDone = n < step
              const isActive = n === step

              return (
                <div
                  key={label}
                  className="flex items-start gap-3 md:items-stretch"
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isDone
                          ? 'bg-accent text-white'
                          : isActive
                            ? 'bg-primary text-white'
                            : 'border-[1.5px] border-border bg-surface text-muted'
                      }`}
                    >
                      {isDone ? '✓' : n}
                    </div>

                    {n < STEP_LABELS.length && (
                      <div
                        className={`mt-1 hidden w-px flex-1 md:block ${
                          isDone ? 'bg-accent' : 'bg-border'
                        }`}
                        style={{ minHeight: '24px' }}
                      />
                    )}
                  </div>

                  <p
                    className={`pt-1 text-[13px] ${
                      isActive
                        ? 'font-semibold text-text'
                        : isDone
                          ? 'text-text'
                          : 'text-muted'
                    }`}
                  >
                    {label}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="max-w-xl flex-1">
            {/* step 1: project details */}

            {step === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="mb-1 block text-xs text-muted">
                    Project Name
                  </label>

                  <input
                    required
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="Enter project name"
                    className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted">
                    Description
                  </label>

                  <textarea
                    required
                    value={form.description}
                    onChange={(e) => update('description', e.target.value)}
                    placeholder="Describe your project idea, goals, features, and expected impact..."
                    rows={6}
                    className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                  />

                  <p className="mt-1 text-xs text-muted">
                    provide enough detail so ai can understand your project
                    and identify relevant skills and roles.
                  </p>
                </div>

                <button
                  onClick={() => canProceedStep1() && setStep(2)}
                  disabled={!canProceedStep1()}
                  className="mt-2 self-end rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}

            {/* step 2: team requirements */}

            {step === 2 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="mb-1 block text-xs text-muted">
                    Domain
                  </label>

                  <select
                    value={form.domain}
                    onChange={(e) => update('domain', e.target.value)}
                    className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                  >
                    {DOMAINS.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-muted">
                      Expected Deadline
                    </label>

                    <input
                      type="date"
                      value={form.deadline}
                      onChange={(e) => update('deadline', e.target.value)}
                      className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-muted">
                      Team Size
                    </label>

                    <select
                      value={form.team_size}
                      onChange={(e) =>
                        update('team_size', Number(e.target.value))
                      }
                      className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                    >
                      {Array.from({ length: 9 }, (_, i) => i + 2).map(
                        (n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted">
                    Experience Required
                  </label>

                  <select
                    value={form.experience_required}
                    onChange={(e) =>
                      update('experience_required', e.target.value)
                    }
                    className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                  >
                    {EXPERIENCE_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted">
                    Skills Required
                    <span className="ml-2 font-normal text-muted">
                      (optional — ai will identify skills)
                    </span>
                  </label>

                  <TagInput
                    tags={form.skills_required}
                    onChange={(value) => update('skills_required', value)}
                    placeholder="Add skills manually, press Enter"
                  />
                </div>

                <div className="mt-2 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-[9px] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-primary hover:bg-surface2"
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={goToAnalysis}
                    disabled={saving || analyzing}
                    className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Analyze with AI'}
                  </button>
                </div>
              </div>
            )}

            {/* step 3: ai analysis */}

            {step === 3 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-[17px] font-bold text-text">
                    AI Project Analyzer ✨
                  </h3>

                  <p className="text-[13px] text-muted">
                    gemini analyzes your project description and recommends
                    skills and team roles.
                  </p>
                </div>

                {analyzing && (
                  <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-surface p-4">
                    <p className="text-sm font-medium text-text">
                      analyzing your project with ai...
                    </p>

                    <div className="skeleton h-4 w-full" />
                    <div className="skeleton h-4 w-5/6" />
                    <div className="skeleton h-4 w-2/3" />

                    <p className="text-xs text-muted">
                      identifying skills, roles, and project requirements.
                    </p>
                  </div>
                )}

                {!analyzing && analysis && (
                  <>
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted">
                        Recommended Roles
                      </p>

                      <div className="flex flex-col gap-2">
                        {(analysis.identified_roles || []).length > 0 ? (
                          analysis.identified_roles.map((role) => (
                            <div
                              key={role}
                              className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-2"
                            >
                              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface2 text-xs">
                                {roleIcon(role)}
                              </span>

                              <span className="text-[13px] font-medium text-text">
                                {role}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted">
                            no specific roles were identified. add more
                            project details and analyze again.
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium text-muted">
                        Skills Required — review and edit
                      </p>

                      <TagInput
                        tags={form.skills_required}
                        onChange={(value) =>
                          update('skills_required', value)
                        }
                        placeholder="Add another skill and press Enter"
                      />

                      <p className="mt-1 text-xs text-muted">
                        these skills were extracted from your project
                        description and combined with your manual entries.
                        remove anything irrelevant before continuing.
                      </p>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium text-muted">
                        Experience Level
                      </p>

                      <div className="rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text">
                        {form.experience_required}
                      </div>
                    </div>

                    {analysis.skill_gaps?.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted">
                          Potential Skill Gaps
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {analysis.skill_gaps.map((gap) => (
                            <span
                              key={gap}
                              className="rounded-md border border-border bg-surface2 px-3 py-1.5 text-xs text-text"
                            >
                              {gap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="mb-2 text-xs font-medium text-muted">
                        Project Insights
                      </p>

                      <div className="flex flex-col gap-1.5">
                        {insights.length > 0 ? (
                          insights.map((line, i) => (
                            <p
                              key={i}
                              className="m-0 flex gap-2 text-[13px] leading-relaxed text-textSecondary"
                            >
                              <span className="text-accent">✓</span>
                              {line}
                            </p>
                          ))
                        ) : (
                          <p className="text-sm text-muted">
                            no additional insights were returned.
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {!analyzing && !analysis && (
                  <div className="rounded-[10px] border border-border bg-surface p-4">
                    <p className="text-sm font-medium text-text">
                      Project details saved. AI requirement analysis did not complete (Edge Function unavailable on this database).
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      You can review and edit your required project skills manually below, then continue directly to Mentor Preference.
                    </p>

                    <div className="mt-4">
                      <p className="mb-2 text-xs font-medium text-muted">
                        Skills Required — review and edit
                      </p>

                      <TagInput
                        tags={form.skills_required}
                        onChange={(value) =>
                          update('skills_required', value)
                        }
                        placeholder="Add another skill and press Enter"
                      />
                    </div>

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={async () => {
                          setError('')
                          setAnalyzing(true)

                          try {
                            const result = await analyzeProject({
                              projectId: project?.id,
                            })

                            if (!result) {
                              throw new Error('The AI returned an empty response.')
                            }

                            setAnalysis(result)

                            const extractedSkills = Array.isArray(
                              result.required_skills
                            )
                              ? result.required_skills
                              : []

                            update(
                              'skills_required',
                              [
                                ...form.skills_required,
                                ...extractedSkills,
                              ].filter(
                                (skill, index, array) =>
                                  array.findIndex(
                                    (item) =>
                                      item.toLowerCase() ===
                                      skill.toLowerCase()
                                  ) === index
                              )
                            )
                          } catch (err) {
                            setError(
                              err?.message || 'AI analysis failed.'
                            )
                          } finally {
                            setAnalyzing(false)
                          }
                        }}
                        className="rounded-[9px] border border-border bg-surface px-4 py-2 text-xs font-semibold text-text hover:bg-surface2"
                      >
                        Retry AI Analysis
                      </button>
                    </div>
                  </div>
                )}

                {!analyzing && (
                  <div className="mt-2 flex justify-between">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="rounded-[9px] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-primary hover:bg-surface2"
                    >
                      Back
                    </button>

                    <button
                      type="button"
                      onClick={confirmAnalysis}
                      disabled={saving}
                      className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Confirm Skills & Continue →'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* step 4: mentor preference */}

            {step === 4 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-[17px] font-bold text-text">
                    Mentor Preference
                  </h3>

                  <p className="text-[13px] text-muted">
                    Choose whether you would like guidance from a mentor for this project.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {MENTOR_PREFERENCE_OPTIONS.map((option) => {
                    const isSelected =
                      (form.mentor_preference || 'none') === option.id

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleSelectMentorPreference(option.id)}
                        className={`flex flex-col rounded-[12px] border p-4 text-left transition ${
                          isSelected
                            ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                            : 'border-border bg-surface hover:border-borderStrong hover:bg-surface2'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="text-xl"
                              role="img"
                              aria-hidden="true"
                            >
                              {option.icon}
                            </span>

                            <h4 className="text-sm font-semibold text-text">
                              {option.title}
                            </h4>
                          </div>

                          <div
                            className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                              isSelected
                                ? 'border-primary bg-primary'
                                : 'border-border bg-surface'
                            }`}
                          >
                            {isSelected && (
                              <div className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </div>
                        </div>

                        <p className="mt-2 text-xs leading-relaxed text-textSecondary">
                          {option.description}
                        </p>
                      </button>
                    )
                  })}
                </div>

                {(showMentorUpgrade || needsMentorUpgrade) && !hasMentorPremium && !subscriptionLoading && (
                  <div className="flex flex-col gap-3 rounded-[12px] border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Mentorship is a Premium feature</p>
                      <p className="mt-1 text-xs leading-relaxed text-amber-800">
                        Upgrade to Premium to choose a college professor, industry expert, or AI-recommended mentor. You can still continue with “No mentor needed” on the Free plan.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/pricing', { state: { message: 'Upgrade to Premium to select a mentor for your project.' } })}
                      className="shrink-0 rounded-[9px] bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primaryHover"
                    >
                      See Premium Plans
                    </button>
                  </div>
                )}

                {/* 1. If No mentor needed */}
                {form.mentor_preference === 'none' && (
                  <div className="rounded-[10px] border border-border bg-surface p-4">
                    <p className="text-xs leading-relaxed text-textSecondary">
                      You are managing this project independently. You can request academic or industry mentorship at any time from your project settings later.
                    </p>
                  </div>
                )}

                {/* 2. If College Professor selected */}
                {form.mentor_preference === 'professor' && (
                  <div className="rounded-[12px] border border-border bg-surface p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🎓</span>
                      <h4 className="text-sm font-semibold text-text">
                        Academic & Research Guidance
                      </h4>
                    </div>
                    <p className="mt-1 text-xs text-textSecondary">
                      {deriveRequirementsForType('professor', { ...form, ...analysis })?.summary}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {deriveRequirementsForType('professor', { ...form, ...analysis })?.focusAreas.map((area) => (
                        <span
                          key={area}
                          className="rounded-md border border-border bg-surface2 px-2.5 py-1 text-[11px] font-medium text-text"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. If Industry Expert selected */}
                {form.mentor_preference === 'industry' && (
                  <div className="rounded-[12px] border border-border bg-surface p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-base">💼</span>
                      <h4 className="text-sm font-semibold text-text">
                        Industry & Production Guidance
                      </h4>
                    </div>
                    <p className="mt-1 text-xs text-textSecondary">
                      {deriveRequirementsForType('industry', { ...form, ...analysis })?.summary}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {deriveRequirementsForType('industry', { ...form, ...analysis })?.focusAreas.map((area) => (
                        <span
                          key={area}
                          className="rounded-md border border-border bg-surface2 px-2.5 py-1 text-[11px] font-medium text-text"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. If Let Collivra AI recommend selected */}
                {form.mentor_preference === 'ai' && (
                  <div className="flex flex-col gap-3">
                    {analyzingMentor && (
                      <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-surface p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base animate-pulse">✨</span>
                          <p className="text-sm font-medium text-text">
                            Analyzing project mentorship requirements with AI...
                          </p>
                        </div>
                        <div className="skeleton h-3 w-full" />
                        <div className="skeleton h-3 w-5/6" />
                        <div className="skeleton h-3 w-2/3" />
                      </div>
                    )}

                    {mentorAnalysisError && (
                      <div className="rounded-[10px] border border-warning/30 bg-warning/5 p-4 text-xs text-warning">
                        <p>{mentorAnalysisError}</p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => runMentorAnalysis()}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primaryHover"
                          >
                            Retry AI Analysis
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const fallback = analyzeMentorRequirementsRuleBased({ ...form, ...analysis })
                              setMentorAnalysis(fallback)
                              setMentorAnalysisError('')
                              if (!form.mentor_type_selection) {
                                update('mentor_type_selection', fallback.recommended_mentor_types.length > 1 ? 'both' : fallback.recommended_mentor_types[0]?.includes('Professor') ? 'professor' : 'industry')
                              }
                            }}
                            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface2"
                          >
                            Use Built-in Recommendation
                          </button>
                        </div>
                      </div>
                    )}

                    {!analyzingMentor && mentorAnalysis && (
                      <div className="flex flex-col gap-3 rounded-[12px] border border-primary/30 bg-primary/5 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">✨</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-primary">
                              Collivra AI Recommendation
                            </span>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {mentorAnalysis.analysis_source === 'AI' ? 'Gemini AI' : 'Deterministic Rules'}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-accent">
                            {Math.round(mentorAnalysis.confidence_score * 100)}% match
                          </span>
                        </div>

                        <div className="mt-1">
                          <h4 className="text-sm font-bold text-text">
                            {mentorAnalysis.recommended_mentor_types?.length > 1
                              ? 'Recommended: Academic & Industry Mentorship (Both)'
                              : mentorAnalysis.recommended_mentor_types?.[0]?.includes('Professor')
                                ? 'Recommended: College Professor'
                                : 'Recommended: Industry Expert'}
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-textSecondary">
                            {mentorAnalysis.analysis_summary}
                          </p>
                        </div>

                        {mentorAnalysis.recommendation_reasons?.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {mentorAnalysis.recommendation_reasons.map((reason, idx) => (
                              <p key={idx} className="m-0 flex items-start gap-1.5 text-xs text-textSecondary">
                                <span className="text-primary font-bold">✓</span>
                                <span>{reason}</span>
                              </p>
                            ))}
                          </div>
                        )}

                        {mentorAnalysis.mentorship_objectives?.length > 0 && (
                          <div className="mt-1">
                            <p className="mb-1 text-[11px] font-semibold uppercase text-muted">
                              Mentorship Objectives
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {mentorAnalysis.mentorship_objectives.map((obj, i) => (
                                <span
                                  key={i}
                                  className="rounded-md border border-border/80 bg-surface px-2.5 py-1 text-[11px] text-text"
                                >
                                  {obj}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {mentorAnalysis.required_expertise?.length > 0 && (
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase text-muted">
                              Key Expertise Focus
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {mentorAnalysis.required_expertise.map((exp, i) => (
                                <span
                                  key={i}
                                  className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] font-medium text-primary"
                                >
                                  {exp}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Student selection control */}
                        <div className="mt-2 border-t border-border pt-3">
                          <p className="mb-2 text-xs font-semibold text-text">
                            Confirm or customize your preferred guidance:
                          </p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {[
                              { id: 'professor', title: 'College Professor', icon: '🎓', sub: 'Research & Theory' },
                              { id: 'industry', title: 'Industry Expert', icon: '💼', sub: 'Production & Standards' },
                              { id: 'both', title: 'Both Categories', icon: '🌟', sub: 'Academic + Industry' },
                            ].map((choice) => {
                              const isChoiceSelected =
                                (form.mentor_type_selection ||
                                  (mentorAnalysis.recommended_mentor_types?.length > 1
                                    ? 'both'
                                    : mentorAnalysis.recommended_mentor_types?.[0]?.includes('Professor')
                                      ? 'professor'
                                      : 'industry')) === choice.id

                              return (
                                <button
                                  key={choice.id}
                                  type="button"
                                  onClick={() => update('mentor_type_selection', choice.id)}
                                  className={`flex flex-col items-start rounded-[10px] border p-2.5 text-left transition ${
                                    isChoiceSelected
                                      ? 'border-primary bg-surface shadow-sm ring-1 ring-primary'
                                      : 'border-border bg-surface/60 hover:bg-surface hover:border-borderStrong'
                                  }`}
                                >
                                  <div className="flex w-full items-center justify-between">
                                    <span className="text-base">{choice.icon}</span>
                                    <div
                                      className={`h-3 w-3 rounded-full border ${
                                        isChoiceSelected
                                          ? 'border-primary bg-primary'
                                          : 'border-border'
                                      }`}
                                    />
                                  </div>
                                  <span className="mt-1 text-xs font-semibold text-text">
                                    {choice.title}
                                  </span>
                                  <span className="text-[10px] text-muted">
                                    {choice.sub}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-2 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="rounded-[9px] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-primary hover:bg-surface2"
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={confirmMentorPreference}
                    disabled={saving}
                    className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Continue to Review'}
                  </button>
                </div>
              </div>
            )}

            {/* step 5: review and publish */}

            {step === 5 && (
              <div className="flex flex-col gap-4">
                <div className="rounded-[14px] border border-border bg-surface p-5">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-text">
                      {form.name}
                    </h3>

                    <span className="rounded-md bg-info/10 px-2.5 py-1 text-xs font-medium text-info">
                      {form.domain}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-textSecondary">
                    {form.description}
                  </p>

                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium text-muted">
                      confirmed skills
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {form.skills_required.length > 0 ? (
                        form.skills_required.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-md bg-surface2 px-2.5 py-1 text-xs font-medium text-primary"
                          >
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted">
                          no specific skills added
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium text-muted">
                      mentor preference
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-surface2 px-2.5 py-1 text-xs font-medium text-primary">
                          <span role="img" aria-hidden="true">
                            {selectedPreference?.icon}
                          </span>
                          <span>{selectedPreference?.title}</span>
                        </span>
                        {form.mentor_preference === 'ai' && form.mentor_type_selection && (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            Selected: {form.mentor_type_selection === 'both' ? 'Both (Academic & Industry)' : form.mentor_type_selection === 'professor' ? 'College Professor' : 'Industry Expert'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {form.mentor_preference === 'ai' && mentorAnalysis
                          ? mentorAnalysis.analysis_summary
                          : selectedPreference?.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-6 text-sm text-muted">
                    <span>Deadline: {form.deadline || 'None'}</span>
                    <span>Team size: {form.team_size}</span>
                    <span>Experience: {form.experience_required}</span>
                  </div>
                </div>

                <div className="mt-2 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="rounded-[9px] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-primary hover:bg-surface2"
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={saving}
                    className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                  >
                    Publish Project
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}