
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const DOMAIN_COLORS = {
  'AI/ML': 'text-accent bg-primary/10',
  'Web Dev': 'text-accent bg-accent/10',
  'Web Development': 'text-accent bg-accent/10',
  'Mobile': 'text-warning bg-warning/10',
  'Data Science': 'text-accent bg-primary/10',
  'Cybersecurity': 'text-danger bg-danger/10',
  'IoT': 'text-accent bg-accent/10',
}

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

export default function ProjectCard({ project, userId, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const isOwner = Boolean(userId && project.creator_id === userId)

  const [form, setForm] = useState({
    name: project.name || '',
    description: project.description || '',
    domain: project.domain || 'AI/ML',
    deadline: project.deadline
      ? project.deadline.slice(0, 10)
      : '',
    team_size: project.team_size || 4,
    skills_required: project.skills_required || [],
    experience_required: project.experience_required || 'Intermediate',
  })

  const [skillInput, setSkillInput] = useState('')

  const domainClass =
    DOMAIN_COLORS[project.domain] || 'text-muted bg-border'

  const deadline = project.deadline
    ? new Date(project.deadline).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : 'No deadline'

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function addSkill(e) {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault()

      const skill = skillInput.trim()

      if (!form.skills_required.includes(skill)) {
        update('skills_required', [...form.skills_required, skill])
      }

      setSkillInput('')
    }
  }

  async function saveProject(e) {
    e.preventDefault()
    setError('')

    if (!isOwner) {
      setError('You cannot edit another student’s project.')
      return
    }

    if (!form.name.trim() || !form.description.trim()) {
      setError('Project name and description are required.')
      return
    }

    setSaving(true)

    const { error: updateError } = await supabase
      .from('projects')
      .update({
        name: form.name.trim(),
        description: form.description.trim(),
        domain: form.domain,
        deadline: form.deadline || null,
        team_size: Number(form.team_size),
        skills_required: form.skills_required,
        experience_required: form.experience_required,
      })
      .eq('id', project.id)
      .eq('creator_id', userId)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setEditing(false)
    onChanged?.()
  }

  async function deleteProject() {
    if (!isOwner) {
      setError('You cannot delete another student’s project.')
      return
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${project.name}"? This action cannot be undone.`
    )

    if (!confirmed) return

    setDeleting(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', project.id)
      .eq('creator_id', userId)

    setDeleting(false)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    onChanged?.()
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary">

      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-text">{project.name}</h3>

        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${domainClass}`}>
          {project.domain}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-muted">
        {project.description}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(project.skills_required || []).slice(0, 3).map((skill) => (
          <span
            key={skill}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text"
          >
            {skill}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>Deadline: {deadline}</span>
        <span>Team of {project.team_size}</span>
      </div>

      <Link
        to={`/project/${project.id}`}
        className="mt-4 rounded-lg border border-border px-3 py-2 text-center text-sm font-medium text-text transition-colors hover:border-primary"
      >
        View Project
      </Link>

      {isOwner && !editing && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setForm({
                name: project.name || '',
                description: project.description || '',
                domain: project.domain || 'AI/ML',
                deadline: project.deadline
                  ? project.deadline.slice(0, 10)
                  : '',
                team_size: project.team_size || 4,
                skills_required: project.skills_required || [],
                experience_required:
                  project.experience_required || 'Intermediate',
              })
              setError('')
              setEditing(true)
            }}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary hover:border-primary"
          >
            ✏️ Edit
          </button>

          <button
            type="button"
            onClick={deleteProject}
            disabled={deleting}
            className="flex-1 rounded-lg border border-danger/30 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : '🗑 Delete'}
          </button>
        </div>
      )}

      {editing && (
        <form onSubmit={saveProject} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">

          <h4 className="font-semibold text-text">Edit Project</h4>

          <label className="text-xs text-muted">
            Project Name
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
            />
          </label>

          <label className="text-xs text-muted">
            Description
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              required
              rows={4}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
            />
          </label>

          <label className="text-xs text-muted">
            Domain
            <select
              value={form.domain}
              onChange={(e) => update('domain', e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
            >
              {DOMAINS.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">
              Deadline
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => update('deadline', e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text"
              />
            </label>

            <label className="text-xs text-muted">
              Team Size
              <select
                value={form.team_size}
                onChange={(e) => update('team_size', Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text"
              >
                {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="text-xs text-muted">
            Experience Required
            <select
              value={form.experience_required}
              onChange={(e) => update('experience_required', e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
            >
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-muted">
            Skills Required
            <div className="mt-1 rounded-lg border border-border p-2">
              <div className="flex flex-wrap gap-2">
                {form.skills_required.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-md bg-surface2 px-2 py-1 text-xs text-primary"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() =>
                        update(
                          'skills_required',
                          form.skills_required.filter((s) => s !== skill)
                        )
                      }
                      className="ml-2"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={addSkill}
                placeholder="Type a skill and press Enter"
                className="mt-2 w-full bg-transparent px-1 py-1 text-sm text-text outline-none"
              />
            </div>
          </label>

          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setError('')
              }}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && !editing && (
        <p className="mt-2 text-sm text-danger">{error}</p>
      )}

    </div>
  )
}
