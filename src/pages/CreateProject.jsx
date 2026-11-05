import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { analyzeProject } from '../lib/gemini'
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
  'Review & Publish',
]

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
  const navigate = useNavigate()

  const [step, setStep] = useState(1)

  const [form, setForm] = useState({
    name: '',
    description: '',
    domain: DOMAINS[0],
    deadline: '',
    team_size: 4,
    skills_required: [],
    experience_required: EXPERIENCE_LEVELS[1],
  })

  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [project, setProject] = useState(null)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm((f) => ({
      ...f,
      [field]: value,
    }))
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

    const { data: created, error: insertError } = await supabase
      .from('projects')
      .insert({
        creator_id: user.id,
        name: form.name.trim(),
        description: form.description.trim(),
        domain: form.domain,
        deadline: form.deadline || null,
        team_size: Number(form.team_size),
        skills_required: form.skills_required,
        experience_required: form.experience_required,
      })
      .select()
      .single()

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
      setError(
        err?.message
          ? `AI analysis failed: ${err.message}`
          : 'AI analysis failed. Please try again.'
      )
    } finally {
      setAnalyzing(false)
    }
  }

  function canProceedStep1() {
    return form.name.trim().length > 0 &&
      form.description.trim().length >= 20
  }

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
    if (!project?.id) {
      setError('Project information is missing. Please try again.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const confirmedSkills = form.skills_required
        .map((skill) => skill.trim())
        .filter(Boolean)

      const { error: updateError } = await supabase
        .from('projects')
        .update({
          skills_required: confirmedSkills,
        })
        .eq('id', project.id)
        .eq('creator_id', user.id)

      if (updateError) {
        throw updateError
      }

      setStep(4)
    } catch (err) {
      setError(
        err?.message || 'Could not save the confirmed project skills.'
      )
    } finally {
      setSaving(false)
    }
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

        {saving && (
          <p className="mb-4 text-sm text-muted">
            Saving your project...
          </p>
        )}

        <div className="flex flex-col gap-8 md:flex-row">
          {/* step navigation */}

          <div className="flex shrink-0 flex-row gap-3 md:w-[220px] md:flex-col">
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

                    {n < 4 && (
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
                    onClick={() => setStep(1)}
                    className="rounded-[9px] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-primary hover:bg-surface2"
                  >
                    Back
                  </button>

                  <button
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
                    <p className="text-sm text-text">
                      the project has been saved, but ai analysis did not
                      complete.
                    </p>

                    <button
                      onClick={async () => {
                        setError('')
                        setAnalyzing(true)

                        try {
                          const result = await analyzeProject({
                            projectId: project.id,
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
                      className="mt-3 rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white"
                    >
                      Retry AI Analysis
                    </button>
                  </div>
                )}

                {!analyzing && (
                  <div className="mt-2 flex justify-between">
                    <button
                      onClick={() => setStep(2)}
                      className="rounded-[9px] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-primary hover:bg-surface2"
                    >
                      Back
                    </button>

                    <button
                      onClick={confirmAnalysis}
                      disabled={!analysis || saving}
                      className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Confirm Skills & Continue'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* step 4: review and publish */}

            {step === 4 && (
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

                  <div className="mt-4 flex flex-wrap gap-6 text-sm text-muted">
                    <span>Deadline: {form.deadline || 'None'}</span>
                    <span>Team size: {form.team_size}</span>
                    <span>Experience: {form.experience_required}</span>
                  </div>
                </div>

                <div className="mt-2 flex justify-between">
                  <button
                    onClick={() => setStep(3)}
                    className="rounded-[9px] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-primary hover:bg-surface2"
                  >
                    Back
                  </button>

                  <button
                    onClick={() =>
                      navigate(project ? `/project/${project.id}` : '/discover')
                    }
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