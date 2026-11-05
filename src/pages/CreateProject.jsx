import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { analyzeProject } from '../lib/gemini'
import AppShell from '../components/AppShell'

const DOMAINS = ['AI/ML', 'Web Development', 'Mobile', 'Data Science', 'Cybersecurity', 'IoT', 'Sustainability', 'HealthTech', 'FinTech', 'Other']
const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const STEP_LABELS = ['Project Details', 'Team Requirements', 'AI Analysis', 'Review & Publish']

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
      if (!tags.includes(input.trim())) onChange([...tags, input.trim()])
      setInput('')
    }
  }
  return (
    <div className="rounded-[9px] border border-border bg-surface px-3 py-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded-md border border-border bg-surface2 px-2.5 py-1 text-xs font-medium text-primary">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} className="text-primary/60 hover:text-primary">×</button>
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
    name: '', description: '', domain: DOMAINS[0], deadline: '', team_size: 4,
    skills_required: [], experience_required: EXPERIENCE_LEVELS[1],
  })
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [project, setProject] = useState(null)
  const [error, setError] = useState('')

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function goToAnalysis() {
    setStep(3)
    setError('')
    setSaving(true)
    const { data: created, error: insertError } = await supabase
      .from('projects')
      .insert({
        creator_id: user.id,
        name: form.name,
        description: form.description,
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
        name: form.name,
        description: form.description,
        domain: form.domain,
        skillsRequired: form.skills_required,
        experienceRequired: form.experience_required,
      })
      setAnalysis(result)
    } catch (err) {
      setError('AI analysis failed: ' + err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  function canProceedStep1() {
    return form.name.trim() && form.description.trim()
  }

  const insights = (() => {
    if (!analysis) return []
    const fromNotes = (analysis.sustainability_notes || '').split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3)
    if (fromNotes.length >= 3) return fromNotes
    const fromGaps = (analysis.skill_gaps || []).map((g) => `Consider adding a ${g} specialist.`)
    return [...fromNotes, ...fromGaps].slice(0, 3)
  })()

  return (
    <AppShell breadcrumb={<span>Create a New Project</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <div className="mb-8 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-lg text-muted hover:text-text">←</button>
          <h1 className="text-[19px] font-bold text-text">Create a New Project</h1>
        </div>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="flex flex-col gap-8 md:flex-row">
          <div className="flex shrink-0 flex-row gap-3 md:w-[220px] md:flex-col">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1
              const isDone = n < step
              const isActive = n === step
              return (
                <div key={label} className="flex items-start gap-3 md:items-stretch">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isDone ? 'bg-accent text-white' : isActive ? 'bg-primary text-white' : 'border-[1.5px] border-border bg-surface text-muted'
                      }`}
                    >
                      {isDone ? '✓' : n}
                    </div>
                    {n < 4 && <div className={`mt-1 hidden w-px flex-1 md:block ${isDone ? 'bg-accent' : 'bg-border'}`} style={{ minHeight: '24px' }} />}
                  </div>
                  <p className={`pt-1 text-[13px] ${isActive ? 'font-semibold text-text' : isDone ? 'text-text' : 'text-muted'}`}>{label}</p>
                </div>
              )
            })}
          </div>

          <div className="max-w-xl flex-1">
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="mb-1 block text-xs text-muted">Project Name</label>
                  <input
                    required value={form.name} onChange={(e) => update('name', e.target.value)}
                    placeholder="Enter project name"
                    className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Description</label>
                  <textarea
                    required value={form.description} onChange={(e) => update('description', e.target.value)}
                    placeholder="Tell us about your idea, goals, and impact…" rows={6}
                    className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                  />
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

            {step === 2 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="mb-1 block text-xs text-muted">Domain</label>
                  <select value={form.domain} onChange={(e) => update('domain', e.target.value)} className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none">
                    {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-muted">Expected Deadline</label>
                    <input type="date" value={form.deadline} onChange={(e) => update('deadline', e.target.value)} className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Team Size</label>
                    <select value={form.team_size} onChange={(e) => update('team_size', Number(e.target.value))} className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none">
                      {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Experience Required</label>
                  <select value={form.experience_required} onChange={(e) => update('experience_required', e.target.value)} className="w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none">
                    {EXPERIENCE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Skills Required</label>
                  <TagInput tags={form.skills_required} onChange={(v) => update('skills_required', v)} placeholder="e.g. React, press Enter" />
                </div>
                <div className="mt-2 flex justify-between">
                  <button onClick={() => setStep(1)} className="rounded-[9px] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-primary hover:bg-surface2">Back</button>
                  <button onClick={goToAnalysis} className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover">Next</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-[17px] font-bold text-text">AI Project Analyzer ✨</h3>
                  <p className="text-[13px] text-muted">We've analyzed your project and identified the following:</p>
                </div>

                {analyzing && (
                  <div className="flex flex-col gap-2">
                    <div className="skeleton h-4 w-full" />
                    <div className="skeleton h-4 w-5/6" />
                    <div className="skeleton h-4 w-2/3" />
                  </div>
                )}

                {!analyzing && analysis && (
                  <>
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted">Recommended Roles</p>
                      <div className="flex flex-col gap-2">
                        {analysis.identified_roles?.map((role) => (
                          <div key={role} className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface2 text-xs">{roleIcon(role)}</span>
                            <span className="text-[13px] font-medium text-text">{role}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium text-muted">Key Skills Required</p>
                      <div className="flex flex-wrap gap-2">
                        {form.skills_required.map((s) => (
                          <span key={s} className="rounded-md border border-border bg-surface2 px-3.5 py-1.5 text-xs font-medium text-primary">{s}</span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium text-muted">Experience Level</p>
                      <div className="rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text">{form.experience_required}</div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium text-muted">Project Insights</p>
                      <div className="flex flex-col gap-1.5">
                        {insights.map((line, i) => (
                          <p key={i} className="m-0 flex gap-2 text-[13px] leading-relaxed text-textSecondary">
                            <span className="text-accent">✓</span>{line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {!analyzing && (
                  <div className="mt-2 flex justify-between">
                    <button onClick={() => setStep(2)} className="rounded-[9px] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-primary hover:bg-surface2">Back</button>
                    <button onClick={() => setStep(4)} className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover">Next →</button>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-4">
                <div className="rounded-[14px] border border-border bg-surface p-5">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-text">{form.name}</h3>
                    <span className="rounded-md bg-info/10 px-2.5 py-1 text-xs font-medium text-info">{form.domain}</span>
                  </div>
                  <p className="mt-2 text-sm text-textSecondary">{form.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {form.skills_required.map((s) => (
                      <span key={s} className="rounded-md bg-surface2 px-2.5 py-1 text-xs font-medium text-primary">{s}</span>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-6 text-sm text-muted">
                    <span>Deadline: {form.deadline || 'None'}</span>
                    <span>Team size: {form.team_size}</span>
                    <span>Experience: {form.experience_required}</span>
                  </div>
                </div>

                <div className="mt-2 flex justify-between">
                  <button onClick={() => setStep(3)} className="rounded-[9px] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-primary hover:bg-surface2">Back</button>
                  <button
                    onClick={() => navigate(project ? `/project/${project.id}` : '/discover')}
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
