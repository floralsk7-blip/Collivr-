import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useConnections } from '../hooks/useConnections'
import AppShell from '../components/AppShell'
import EditableField from '../components/EditableField'
import ConnectButton from '../components/ConnectButton'

const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const SKILL_LEVEL_STYLE = {
  Advanced: 'bg-accent/10 text-accent',
  Intermediate: 'bg-warning/10 text-warning',
  Beginner: 'bg-danger/10 text-danger',
}
const BRANCHES = [
  'Computer Science Engineering',
  'Information Technology',
  'Electronics & Communication',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Biotechnology',
  'Data Science',
  'Artificial Intelligence & ML',
  'Other',
]

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
    <div className="rounded-[9px] border border-border bg-bg px-3 py-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded-md bg-surface2 px-2.5 py-1 text-xs font-medium text-primary">
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

function BranchSelect({ value, onChange }) {
  const isCustom = value && !BRANCHES.slice(0, -1).includes(value)
  const [customMode, setCustomMode] = useState(isCustom)

  function handleSelect(v) {
    if (v === 'Other') {
      setCustomMode(true)
      onChange('')
    } else {
      setCustomMode(false)
      onChange(v)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <select
        value={customMode ? 'Other' : value}
        onChange={(e) => handleSelect(e.target.value)}
        className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
      >
        <option value="" disabled>Select branch</option>
        {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      {customMode && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter your branch"
          className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
        />
      )}
    </div>
  )
}

function BranchEditableField({ value, onSave, editMode = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value ?? ''); setEditing(true) }}
        title="Click to edit"
        className={`-ml-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-1.5 py-0.5 transition-colors hover:border-[#95D5B2] hover:bg-surface2 ${
          editMode ? 'border-borderStrong bg-[#F8FCFA]' : 'border-transparent'
        }`}
      >
        {value || <span className="italic text-muted">Add your branch</span>}
        <span className={`text-[11px] text-muted transition-opacity ${editMode ? 'opacity-100' : 'opacity-0'}`}>✏️</span>
      </span>
    )
  }

  async function commit() {
    if (!draft.trim()) return
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <BranchSelect value={draft} onChange={setDraft} />
      <button onClick={commit} disabled={saving} className="rounded-[6px] bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primaryHover disabled:opacity-50">
        {saving ? '…' : '✓'}
      </button>
      <button onClick={() => setEditing(false)} className="rounded-[6px] border border-border bg-surface px-2.5 py-1 text-xs text-muted hover:bg-surface2">✕</button>
    </span>
  )
}

function SetupForm({ userId, accountType, initialProfile, onComplete, onCancel }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(() => ({
    name: initialProfile?.name || '',
    college: initialProfile?.college || '',
    year: initialProfile?.year ?? '',
    branch: initialProfile?.branch || initialProfile?.department || '',
    cgpa: initialProfile?.cgpa ?? '',
    skills: initialProfile?.skills || [],
    experience: initialProfile?.experience || 'Intermediate',
    previous_projects: initialProfile?.previous_projects || [],
    github_url: initialProfile?.github_url || '',
    linkedin_url: initialProfile?.linkedin_url || '',
    photo_url: initialProfile?.photo_url || '',
    account_type: ['organiser', 'institution', 'organisation'].includes(initialProfile?.account_type || accountType) ? 'organiser' : 'student',
    organisation_name: initialProfile?.organisation_name || '',
    official_email: initialProfile?.official_email || '',
    organisation_type: initialProfile?.organisation_type || 'company',
    designation: initialProfile?.designation || '',
    website_url: initialProfile?.website_url || '',
    location: initialProfile?.location || '',
    organisation_about: initialProfile?.organisation_about || '',
    contact_phone: initialProfile?.contact_phone || '',
    organisation_logo_url: initialProfile?.organisation_logo_url || '',
  }))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSaveError('')
    if (file.size > 2 * 1024 * 1024) {
      setSaveError('Choose a profile photo smaller than 2 MB.')
      e.target.value = ''
      return
    }
    const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) {
      setSaveError(`Photo upload failed: ${error.message}. You can still finish without a photo.`)
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    update('photo_url', data.publicUrl)
  }

  async function handleSubmit() {
    setSaveError('')
    if (!form.name.trim()) { setStep(1); setSaveError('Please enter your full name before finishing.'); return }
    if (form.account_type !== 'student' && form.organisation_type !== 'individual' && form.organisation_name.trim().length < 2) {
      setStep(1); setSaveError('Enter your institution or organisation name.'); return
    }
    if (form.year && (Number(form.year) < 1 || Number(form.year) > 8)) { setStep(1); setSaveError('Enter a valid study year between 1 and 8.'); return }
    if (form.cgpa && (Number(form.cgpa) < 0 || Number(form.cgpa) > 10)) { setStep(1); setSaveError('CGPA must be between 0 and 10.'); return }
    setSaving(true)
    try {
      // Keep this payload aligned with the base schema. `branch` is stored in `department`;
      // optional richer profile fields are added by the migration shipped with this project.
      const { error } = await supabase.from('student_profiles').upsert({
        id: userId,
        name: form.name.trim(),
        account_type: form.account_type === 'student' ? 'student' : 'organiser',
        organisation_name: form.organisation_name.trim() || null,
        official_email: form.official_email.trim() || null,
        organisation_type: form.account_type === 'student' ? null : form.organisation_type,
        designation: form.account_type === 'student' ? null : (form.designation.trim() || null),
        website_url: form.account_type === 'student' ? null : (form.website_url.trim() || null),
        location: form.account_type === 'student' ? null : (form.location.trim() || null),
        organisation_about: form.account_type === 'student' ? null : (form.organisation_about.trim() || null),
        contact_phone: form.account_type === 'student' ? null : (form.contact_phone.trim() || null),
        organisation_logo_url: form.account_type === 'student' ? null : (form.organisation_logo_url.trim() || null),
        college: form.account_type === 'student' ? (form.college.trim() || null) : form.organisation_name.trim(),
        year: form.year ? Number(form.year) : null,
        department: form.branch || null,
        branch: form.branch || null,
        cgpa: form.cgpa ? Number(form.cgpa) : null,
        skills: form.skills,
        skills_detailed: form.skills.map((name) => ({ name, level: 'Intermediate' })),
        experience: form.experience,
        previous_projects: form.previous_projects,
        github_url: form.github_url.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        photo_url: form.photo_url || null,
      }, { onConflict: 'id' })
      if (error) throw error

      onComplete()
    } catch (error) {
      console.error('Profile save failed:', error)
      setSaveError(error?.message || 'Could not save your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      {onCancel && (
        <button type="button" onClick={onCancel} className="mb-4 rounded-[9px] border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface2">
          ← Back to Profile
        </button>
      )}
      <div className="mb-8 flex items-center gap-2">
        {(form.account_type === 'student' ? [1, 2, 3] : [1]).map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-border'}`} />
        ))}
      </div>
      <p className="mb-6 text-sm font-medium text-muted">Step {step} of {form.account_type === 'student' ? 3 : 1}</p>

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text">Personal Info</h2>
          <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Your full name" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
          <div className="rounded-lg bg-surface2 px-3 py-2 text-sm text-textSecondary">Account type: <strong className="text-text">{form.account_type === 'student' ? 'Student' : 'Event Organiser'}</strong></div>
          {form.account_type !== 'student' ? (
            <>
              <label className="text-xs font-medium text-muted">Organiser type</label>
              <select value={form.organisation_type} onChange={(e) => update('organisation_type', e.target.value)} className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text">
                <option value="company">Company</option><option value="college">College / University</option><option value="ngo">NGO</option><option value="community">Community</option><option value="individual">Individual organiser</option>
              </select>
              {form.organisation_type !== 'individual' && <input value={form.organisation_name} onChange={(e) => update('organisation_name', e.target.value)} placeholder="Company / institution / organisation name" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />}
              <input value={form.designation} onChange={(e) => update('designation', e.target.value)} placeholder="Your designation (e.g. Founder, Professor, Coordinator)" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text" />
              <input type="email" value={form.official_email} onChange={(e) => update('official_email', e.target.value)} placeholder="Official contact email" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
              <input value={form.contact_phone} onChange={(e) => update('contact_phone', e.target.value)} placeholder="Contact number (optional)" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text" />
              <input type="url" value={form.website_url} onChange={(e) => update('website_url', e.target.value)} placeholder="Website URL (optional)" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text" />
              <input value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="City, State, Country" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text" />
              <input type="url" value={form.organisation_logo_url} onChange={(e) => update('organisation_logo_url', e.target.value)} placeholder="Organisation logo URL (optional)" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text" />
              <textarea value={form.organisation_about} onChange={(e) => update('organisation_about', e.target.value)} placeholder="About your organisation / events (optional)" rows={3} className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text" />
              <p className="text-xs text-muted">Individual organisers can leave the organisation name blank. Verification status is managed by COLLIVRA.</p>
            </>
          ) : (
          <input value={form.college} onChange={(e) => update('college', e.target.value)} placeholder="College" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
          )}
          {form.account_type === 'student' && <>
          <div className="grid grid-cols-2 gap-4">
            <input type="number" value={form.year} onChange={(e) => update('year', e.target.value)} placeholder="Year (1-5)" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
            <input type="number" step="0.01" value={form.cgpa} onChange={(e) => update('cgpa', e.target.value)} placeholder="CGPA" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Branch</label>
            <BranchSelect value={form.branch} onChange={(v) => update('branch', v)} />
          </div>
          </>}
        </div>
      )}

      {form.account_type === 'student' && step === 2 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text">Skills & Experience</h2>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Skills</label>
            <TagInput tags={form.skills} onChange={(v) => update('skills', v)} placeholder="e.g. Python, press Enter" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Experience Level</label>
            <select value={form.experience} onChange={(e) => update('experience', e.target.value)} className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none">
              {EXPERIENCE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Previous Projects</label>
            <TagInput tags={form.previous_projects} onChange={(v) => update('previous_projects', v)} placeholder="Project name, press Enter" />
          </div>
        </div>
      )}

      {form.account_type === 'student' && step === 3 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text">Links</h2>
          <input type="url" value={form.github_url} onChange={(e) => update('github_url', e.target.value)} placeholder="GitHub URL (https://github.com/username)" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
          <input type="url" value={form.linkedin_url} onChange={(e) => update('linkedin_url', e.target.value)} placeholder="LinkedIn URL (https://linkedin.com/in/username)" className="rounded-[9px] border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none" />
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Profile Photo</label>
            <input type="file" accept="image/*" onChange={handlePhotoUpload} className="text-sm text-muted" />
          </div>
        </div>
      )}

      {saveError && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{saveError}</div>}

      <div className="mt-8 flex justify-between">
        <button
          disabled={step === 1}
          onClick={() => setStep((s) => s - 1)}
          className="rounded-[9px] border border-border px-4 py-2 text-sm font-medium text-text disabled:opacity-30"
        >
          Back
        </button>
        {step < (form.account_type === 'student' ? 3 : 1) ? (
          <button onClick={() => setStep((s) => s + 1)} className="rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover">
            Next
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving} className="rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50">
            {saving ? 'Saving...' : 'Finish'}
          </button>
        )}
      </div>
    </div>
  )
}

function AddSkillForm({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [level, setLevel] = useState('Intermediate')

  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim(), level)
    setName('')
    setOpen(false)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="rounded-[8px] border border-borderStrong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-surface2">
      + Add Skill
    </button>
  )

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill name" className="rounded-[9px] border border-border bg-bg px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none" />
      <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded-[9px] border border-border bg-bg px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none">
        {EXPERIENCE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
      </select>
      <button type="submit" className="rounded-[9px] bg-primary px-3 py-1.5 text-xs font-semibold text-white">Add</button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-[9px] border border-border bg-surface px-3 py-1.5 text-xs text-muted">Cancel</button>
    </form>
  )
}

function SkillPill({ skill, isOwn, editMode, onChangeLevel, onRemove }) {
  const [editingLevel, setEditingLevel] = useState(false)

  return (
    <div className="group flex items-center gap-1.5 rounded-full border border-border bg-bg py-1 pl-3 pr-1.5">
      <span className="text-[12.5px] font-medium text-text">{skill.name}</span>
      {editingLevel ? (
        <select
          autoFocus
          value={skill.level}
          onChange={(e) => { onChangeLevel(e.target.value); setEditingLevel(false) }}
          onBlur={() => setEditingLevel(false)}
          className="rounded-full border border-primary bg-surface px-1.5 py-0.5 text-[10.5px]"
        >
          {EXPERIENCE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
        </select>
      ) : (
        <span
          onClick={() => isOwn && setEditingLevel(true)}
          className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${SKILL_LEVEL_STYLE[skill.level] || SKILL_LEVEL_STYLE.Intermediate} ${isOwn ? 'cursor-pointer' : ''}`}
          title={isOwn ? 'Click to change level' : undefined}
        >
          {skill.level}
        </span>
      )}
      {isOwn && (
        <button
          onClick={onRemove}
          className={`ml-0.5 h-4 w-4 items-center justify-center rounded-full text-[11px] text-muted hover:bg-danger/10 hover:text-danger group-hover:flex ${
            editMode ? 'flex' : 'hidden'
          }`}
          title="Remove skill"
        >
          ✕
        </button>
      )}
    </div>
  )
}

const INTEREST_SUGGESTIONS = [
  'AI / Machine Learning', 'Web Development', 'Mobile Development',
  'Sustainability', 'Healthcare', 'FinTech', 'Education',
  'Cybersecurity', 'IoT', 'Data Science', 'AR / VR', 'Robotics',
]

function AddInterestForm({ onAdd, label = '+ Add Interest' }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim())
    setName('')
    setOpen(false)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="rounded-[8px] border border-borderStrong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-surface2">
      {label}
    </button>
  )

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        autoFocus
        list="interest-suggestions"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Interest"
        className="rounded-[9px] border border-border bg-bg px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none"
      />
      <datalist id="interest-suggestions">
        {INTEREST_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
      </datalist>
      <button type="submit" className="rounded-[9px] bg-primary px-3 py-1.5 text-xs font-semibold text-white">Add</button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-[9px] border border-border bg-surface px-3 py-1.5 text-xs text-muted">Cancel</button>
    </form>
  )
}

function ViewProfile({ student, isOwn, onUpdate }) {
  const navigate = useNavigate()
  const { connectedIds } = useConnections()
  const [editMode, setEditMode] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState('')
  const initial = student.name?.charAt(0)?.toUpperCase() || '?'
  const idTag = `CLV-${(student.id || '').replace(/-/g, '').slice(0, 6).toUpperCase()}`
  const branchValue = student.branch || student.department || ''
  const skillsDetailed = student.skills_detailed?.length
    ? student.skills_detailed
    : (student.skills || []).map((name) => ({ name, level: 'Intermediate' }))
  const interests = student.project_interests || []

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const saveField = (field) => async (value) => {
    let stored = value
    if (field === 'year' || field === 'cgpa') {
      stored = value === '' || value === null || value === undefined ? null : Number(value)
    }
    const patch = { [field]: stored }
    if (field === 'branch') patch.department = stored
    const { error } = await supabase.from('student_profiles').update(patch).eq('id', student.id)
    if (!error) {
      onUpdate?.()
      setToast('Saved')
    }
  }

  async function saveSkills(list) {
    await supabase.from('student_profiles').update({
      skills_detailed: list,
      skills: list.map((s) => s.name),
    }).eq('id', student.id)
    onUpdate?.()
    setToast('Saved')
  }

  function addSkill(name, level) {
    saveSkills([...skillsDetailed, { name, level }])
  }

  function changeSkillLevel(name, level) {
    saveSkills(skillsDetailed.map((s) => (s.name === name ? { ...s, level } : s)))
  }

  function removeSkill(name) {
    saveSkills(skillsDetailed.filter((s) => s.name !== name))
  }

  async function saveInterests(list) {
    await supabase.from('student_profiles').update({ project_interests: list }).eq('id', student.id)
    onUpdate?.()
    setToast('Saved')
  }

  function addInterest(name) {
    saveInterests([...interests, name])
  }

  function removeInterest(name) {
    saveInterests(interests.filter((i) => i !== name))
  }

  async function toggleCollaborate() {
    await supabase.from('student_profiles').update({ open_to_collaborate: !student.open_to_collaborate }).eq('id', student.id)
    onUpdate?.()
    setToast('Saved')
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      alert('Please choose an image under 2MB.')
      return
    }

    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${student.id}/avatar.${ext}`

    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) {
      alert('Upload failed: ' + upErr.message)
      setUploading(false)
      return
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const photoUrl = `${pub.publicUrl}?t=${Date.now()}`

    await supabase.from('student_profiles').update({ photo_url: photoUrl }).eq('id', student.id)
    onUpdate?.()
    setToast('Photo updated')
    setUploading(false)
  }

  return (
    <div className="mx-auto max-w-2xl">
      {isOwn && editMode && (
        <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-borderStrong bg-surface2 px-4 py-2.5 text-[13px] text-primary">
          <span>✏️</span>
          <span>Edit mode is on — click any field with a dashed outline to change it. Changes save automatically.</span>
        </div>
      )}

      <div className="rounded-[14px] border border-border bg-surface p-6">
        <div className="flex items-start gap-5">
          <div className="relative h-[88px] w-[88px] shrink-0">
            {student.photo_url ? (
              <img src={student.photo_url} alt={student.name} className="h-[88px] w-[88px] rounded-full object-cover" />
            ) : (
              <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-surface2 text-3xl font-bold text-primary">{initial}</div>
            )}
            {isOwn && (
              <>
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </div>
                )}
                <label
                  htmlFor="avatar-upload"
                  title="Change photo"
                  className="absolute bottom-0 right-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-surface bg-primary text-[13px] shadow-sm hover:bg-primaryHover"
                >
                  📷
                </label>
                <input id="avatar-upload" type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-[21px] font-bold text-text">
                {isOwn ? <EditableField value={student.name} onSave={saveField('name')} editMode={editMode} /> : student.name}
              </h1>
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent">Student</span>
              <span className="text-[11px] text-muted">ID: {idTag}</span>
              {!isOwn && (
                <div className="ml-auto w-40">
                  <ConnectButton studentId={student.id} />
                </div>
              )}
              {isOwn && (
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={`ml-auto flex items-center gap-1.5 rounded-[9px] border px-4 py-2 text-[13px] font-semibold transition-colors ${
                    editMode
                      ? 'border-primary bg-primary text-white hover:bg-primaryHover'
                      : 'border-borderStrong bg-surface text-primary hover:bg-surface2'
                  }`}
                >
                  {editMode ? '✓ Done Editing' : '✏️ Edit Profile'}
                </button>
              )}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[13px] text-textSecondary">
              {isOwn ? (
                <>
                  <BranchEditableField value={branchValue} onSave={saveField('branch')} editMode={editMode} />
                  <span>·</span>
                  <EditableField value={student.college} onSave={saveField('college')} placeholder="Add college" editMode={editMode} />
                  <span>·</span>
                  Year <EditableField value={student.year} onSave={saveField('year')} type="number" placeholder="?" editMode={editMode} />
                </>
              ) : (
                [branchValue, student.college, student.year ? `Year ${student.year}` : null].filter(Boolean).join(' · ')
              )}
            </p>
            {isOwn ? (
              <p className="mt-1 text-[12.5px] text-muted">📍 <EditableField value={student.location} onSave={saveField('location')} placeholder="Add your city" editMode={editMode} /></p>
            ) : student.location ? (
              <p className="mt-1 text-[12.5px] text-muted">📍 {student.location}</p>
            ) : null}
            {isOwn ? (
              <p className="mt-1.5 text-[13px] italic text-primaryHover">"<EditableField value={student.tagline} onSave={saveField('tagline')} placeholder="Add a tagline" editMode={editMode} />"</p>
            ) : student.tagline ? (
              <p className="mt-1.5 text-[13px] italic text-primaryHover">"{student.tagline}"</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex divide-x divide-border rounded-[14px] border border-border bg-surface">
        <div className="flex-1 px-5 py-4">
          <p className="m-0 text-[11.5px] text-muted">🎓 CGPA</p>
          <p className="m-0 text-[15px] font-semibold text-text">
            {isOwn ? <EditableField value={student.cgpa} onSave={saveField('cgpa')} type="number" placeholder="Add CGPA" editMode={editMode} /> : (student.cgpa ? `${student.cgpa} / 10` : '—')}
          </p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="m-0 text-[11.5px] text-muted">💼 Experience</p>
          <p className="m-0 text-[15px] font-semibold text-text">
            {isOwn ? <EditableField value={student.experience} onSave={saveField('experience')} options={EXPERIENCE_LEVELS} editMode={editMode} /> : (student.experience || '—')}
          </p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="m-0 text-[11.5px] text-muted">⏱ Availability</p>
          <p className="m-0 text-[15px] font-semibold text-text">
            {isOwn ? <EditableField value={student.availability_hours} onSave={saveField('availability_hours')} placeholder="e.g. 10-15 hrs/week" editMode={editMode} /> : (student.availability_hours || '—')}
          </p>
        </div>
        {isOwn && (
          <button onClick={() => navigate('/network')} className="flex-1 px-5 py-4 text-left transition-colors hover:bg-surface2">
            <p className="m-0 text-[11.5px] text-muted">🔗 Connections</p>
            <p className="m-0 text-[15px] font-semibold text-text">{connectedIds.length}</p>
          </button>
        )}
      </div>

      <div className="mt-4 rounded-[14px] border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="m-0 text-sm font-semibold text-text">&lt;/&gt; Skills &amp; Skill Level</h3>
          {isOwn && <AddSkillForm onAdd={addSkill} />}
        </div>
        <div className="flex flex-wrap gap-2">
          {skillsDetailed.map((skill) => (
            <SkillPill
              key={skill.name}
              skill={skill}
              isOwn={isOwn}
              editMode={editMode}
              onChangeLevel={(level) => changeSkillLevel(skill.name, level)}
              onRemove={() => removeSkill(skill.name)}
            />
          ))}
          {skillsDetailed.length === 0 && <p className="text-sm text-muted">No skills added yet.</p>}
        </div>
      </div>

      {(interests.length > 0 || isOwn) && (
        <div className="mt-4 rounded-[14px] border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="m-0 text-sm font-semibold text-text">📍 Project Interests</h3>
            {isOwn && interests.length > 0 && <AddInterestForm onAdd={addInterest} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {interests.map((interest) => (
              <span key={interest} className="group flex items-center gap-1.5 rounded-full bg-surface2 px-3 py-1 text-xs font-medium text-primary">
                {interest}
                {isOwn && (
                  <button
                    onClick={() => removeInterest(interest)}
                    className={`text-primary/60 hover:text-danger group-hover:inline ${editMode ? 'inline' : 'hidden'}`}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
            {interests.length === 0 && (
              isOwn ? (
                <>
                  <p className="m-0 text-sm text-muted">No interests added yet.</p>
                  <AddInterestForm onAdd={addInterest} label="+ Add your first interest" />
                </>
              ) : (
                <p className="text-sm text-muted">No interests added yet.</p>
              )
            )}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[14px] border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">🔗 Links</h3>
          <div className="flex flex-col gap-2">
            {isOwn ? (
              <>
                <p className="m-0 text-[13px] text-primary">GitHub: <EditableField value={student.github_url} onSave={saveField('github_url')} placeholder="Add GitHub" editMode={editMode} /></p>
                <p className="m-0 text-[13px] text-primary">LinkedIn: <EditableField value={student.linkedin_url} onSave={saveField('linkedin_url')} placeholder="Add LinkedIn" editMode={editMode} /></p>
              </>
            ) : (
              <>
                {student.github_url && <a href={student.github_url} target="_blank" rel="noreferrer" className="text-[13px] text-primary hover:underline">GitHub: {student.github_url.replace(/^https?:\/\//, '')}</a>}
                {student.linkedin_url && <a href={student.linkedin_url} target="_blank" rel="noreferrer" className="text-[13px] text-primary hover:underline">LinkedIn: {student.linkedin_url.replace(/^https?:\/\//, '')}</a>}
                {!student.github_url && !student.linkedin_url && <p className="text-sm text-muted">No links added.</p>}
              </>
            )}
          </div>
        </div>
        <div className="rounded-[14px] border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">👥 Collaboration Status</h3>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-textSecondary">Open to collaborate</span>
            {isOwn ? (
              <button onClick={toggleCollaborate} className={`relative h-[23px] w-[42px] rounded-full transition-colors ${student.open_to_collaborate !== false ? 'bg-accent' : 'bg-border'}`}>
                <span className={`absolute top-[2.5px] h-[18px] w-[18px] rounded-full bg-surface transition-all ${student.open_to_collaborate !== false ? 'left-[21px]' : 'left-[2.5px]'}`} />
              </button>
            ) : (
              <span className={`text-xs font-medium ${student.open_to_collaborate !== false ? 'text-accent' : 'text-muted'}`}>
                {student.open_to_collaborate !== false ? 'Yes' : 'No'}
              </span>
            )}
          </div>
        </div>
      </div>

      {student.previous_projects?.length > 0 && (
        <div className="mt-4 rounded-[14px] border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">Previous Projects</h3>
          <div className="flex flex-col gap-2">
            {student.previous_projects.map((proj) => (
              <div key={proj} className="rounded-[9px] border border-border bg-bg px-4 py-3 text-sm text-text">{proj}</div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[1000] rounded-[9px] bg-primary px-[18px] py-2.5 text-[13px] font-medium text-white shadow-lg">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}


function OrganizerProfile({ organiser, isOwn, onEdit }) {
  const fields = [
    ['Organiser type', organiser.organisation_type || 'Not specified'],
    ['Designation', organiser.designation || 'Not added'],
    ['Official email', organiser.official_email || 'Not added'],
    ['Contact number', organiser.contact_phone || 'Not added'],
    ['Website', organiser.website_url || 'Not added'],
    ['Location', organiser.location || 'Not added'],
    ['Verification', organiser.organiser_verification_status || 'pending'],
  ]
  return (
    <div className="mx-auto max-w-2xl rounded-[14px] border border-border bg-surface p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {organiser.organisation_logo_url ? <img src={organiser.organisation_logo_url} alt="Organisation logo" className="h-16 w-16 rounded-xl object-cover" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface2 text-2xl font-bold text-primary">{(organiser.organisation_name || organiser.name || 'O').charAt(0).toUpperCase()}</div>}
          <div className="min-w-0"><h1 className="text-2xl font-bold text-text">{organiser.organisation_type === 'individual' ? organiser.name : (organiser.organisation_name || organiser.name)}</h1><p className="text-sm text-muted">{organiser.designation || 'Event Organiser'}</p></div>
        </div>
        {isOwn && <button type="button" onClick={onEdit} className="shrink-0 rounded-[9px] border border-borderStrong bg-surface px-4 py-2 text-[13px] font-semibold text-primary hover:bg-surface2">✏️ Edit Profile</button>}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-lg bg-surface2 p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-medium text-text">{value}</p></div>)}</div>
      {organiser.organisation_about && <div className="mt-5"><h2 className="font-semibold text-text">About</h2><p className="mt-1 whitespace-pre-wrap text-sm text-textSecondary">{organiser.organisation_about}</p></div>}
      {isOwn && <p className="mt-5 text-xs text-muted">To update these details, use the organiser profile setup. Verification is managed by COLLIVRA.</p>}
    </div>
  )
}

export default function Profile() {
  const { id } = useParams()
  const { user, loading: authLoading } = useAuth()
  const { profile: ownProfile, loading: ownLoading, refresh } = useProfile()
  const navigate = useNavigate()
  const [otherProfile, setOtherProfile] = useState(null)
  const [editingOrganiser, setEditingOrganiser] = useState(false)
  const [loading, setLoading] = useState(!!id)

  const isOwn = !id || id === user?.id

  async function loadOther() {
    if (!id) return
    setLoading(true)
    const { data } = await supabase.from('student_profiles').select('*').eq('id', id).maybeSingle()
    setOtherProfile(data)
    setLoading(false)
  }

  useEffect(() => {
    if (!id || isOwn) return
    loadOther()
  }, [id, isOwn])

  if (authLoading || ownLoading || loading) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      Loading...
    </div>
  )
}

if (!user && !id) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      Please log in to view your profile.
    </div>
  )
}

  const showSetup = isOwn && (!ownProfile || (editingOrganiser && ownProfile.account_type !== 'student'))
  const profileToShow = isOwn ? ownProfile : otherProfile

  return (
    <AppShell breadcrumb={<span>{isOwn ? 'My Profile' : profileToShow?.name || 'Profile'}</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        {showSetup ? (
          <SetupForm
            userId={user.id}
            accountType={ownProfile?.account_type || user.user_metadata?.account_type || 'student'}
            initialProfile={ownProfile}
            onCancel={ownProfile ? () => setEditingOrganiser(false) : undefined}
            onComplete={async () => {
              await refresh()
              setEditingOrganiser(false)
              if (!ownProfile) navigate('/discover')
            }}
          />
        ) : profileToShow ? (
          profileToShow.account_type && profileToShow.account_type !== 'student' ? (
            <OrganizerProfile organiser={profileToShow} isOwn={isOwn} onEdit={() => setEditingOrganiser(true)} />
          ) : <ViewProfile
            student={profileToShow}
            isOwn={isOwn}
            onUpdate={isOwn ? refresh : loadOther}
          />
        ) : (
          <p className="text-muted">Profile not found.</p>
        )}
      </div>
    </AppShell>
  )
}
