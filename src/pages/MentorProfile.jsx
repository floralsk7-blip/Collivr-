import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { useAuth } from '../hooks/useAuth'
import {
  getMentorProfile,
  createMentorProfile,
  updateMentorProfile,
  saveMentorExpertise,
  saveMentorAvailability,
  addMentorQualification,
  deleteMentorQualification,
  addMentorPortfolioProject,
  deleteMentorPortfolioProject,
  submitMentorVerification,
  reviewMentorVerification,
} from '../lib/mentorProfileService'
import {
  getMentorPackages,
  saveMentorPackage,
  deleteMentorPackage,
  togglePackageActive,
  PACKAGE_TIERS,
} from '../lib/mentorPackageService'

const FIELD = 'w-full rounded-[9px] border border-border bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none'

const VERIFICATION_BADGES = {
  unverified: { label: 'Unverified', style: 'bg-surface2 text-muted border-border' },
  pending: { label: 'Pending Review', style: 'bg-warning/10 text-warning border-warning/30' },
  verified: { label: 'Verified Mentor ✓', style: 'bg-accent/10 text-accent border-accent/30 font-semibold' },
  rejected: { label: 'Verification Rejected', style: 'bg-danger/10 text-danger border-danger/30' },
  suspended: { label: 'Suspended', style: 'bg-danger/15 text-danger border-danger/40' },
}

export default function MentorProfile() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [activeTab, setActiveTab] = useState('basic') // 'basic' | 'expertise' | 'qualifications' | 'availability' | 'verification'

  // Data state
  const [profile, setProfile] = useState(null)
  const [expertise, setExpertise] = useState(null)
  const [qualifications, setQualifications] = useState([])
  const [portfolio, setPortfolio] = useState([])
  const [availability, setAvailability] = useState(null)
  const [verificationDocs, setVerificationDocs] = useState([])
  const [packages, setPackages] = useState([])

  // Package states
  const [editingTier, setEditingTier] = useState('basic')
  const [benefitInput, setBenefitInput] = useState('')
  const [packageForms, setPackageForms] = useState({
    basic: {
      name: 'Essential Mentorship (Basic)',
      description: 'Monthly 1:1 consultation, asynchronous code review, and roadmap advisory.',
      price_usd: 50,
      billing_interval: 'monthly',
      duration_weeks: 4,
      sessions_count: 1,
      chat_support: true,
      code_review: false,
      project_review: true,
      priority_support: false,
      benefits: ['1x 45-min monthly 1:1 session', 'Project review notes', 'Asynchronous email support'],
      limitations: ['Standard 48-hour response time'],
      is_active: true,
    },
    standard: {
      name: 'Accelerated Mentorship (Standard)',
      description: 'Bi-weekly 1:1 syncs, milestone tracking, and architecture code reviews.',
      price_usd: 120,
      billing_interval: 'monthly',
      duration_weeks: 4,
      sessions_count: 2,
      chat_support: true,
      code_review: true,
      project_review: true,
      priority_support: false,
      benefits: ['2x 60-min sessions per month', 'In-depth code reviews', 'Milestone completion tracking'],
      limitations: [],
      is_active: true,
    },
    premium: {
      name: 'Intensive Capstone Advisory (Premium)',
      description: 'Weekly 1:1 sessions, dedicated technical advisory, and priority collaboration.',
      price_usd: 240,
      billing_interval: 'monthly',
      duration_weeks: 4,
      sessions_count: 4,
      chat_support: true,
      code_review: true,
      project_review: true,
      priority_support: true,
      benefits: ['Weekly 1:1 video sessions', 'Priority Discord/Slack chat access', 'Comprehensive architecture reviews'],
      limitations: [],
      is_active: true,
    },
    custom: {
      name: 'Custom Project Advisory',
      description: 'Tailored mentorship scope for multidisciplinary or research capstone projects.',
      price_usd: 180,
      billing_interval: 'project',
      duration_weeks: 6,
      sessions_count: 3,
      chat_support: true,
      code_review: true,
      project_review: true,
      priority_support: true,
      benefits: ['Custom milestone deliverables', 'Specialized consultation'],
      limitations: [],
      is_active: false,
    },
  })

  // Form states
  const [basicForm, setBasicForm] = useState({
    full_name: '',
    headline: '',
    bio: '',
    location: '',
    contact_email: '',
    primary_category: 'industry_expert',
    institution_name: '',
    department: '',
    academic_designation: '',
    company_name: '',
    company_role: '',
    years_of_experience: 0,
    is_active: true,
  })

  const [expertiseForm, setExpertiseForm] = useState({
    technical_skills: [],
    domain_expertise: [],
    research_interests: [],
    tech_stack: [],
    mentorship_topics: [],
  })

  const [availForm, setAvailForm] = useState({
    is_available: true,
    weekly_hours: 5,
    timezone: 'UTC',
    max_active_mentees: 3,
    preferred_days: ['Monday', 'Wednesday', 'Friday'],
  })

  // Inputs for adding items
  const [skillInput, setSkillInput] = useState('')
  const [topicInput, setTopicInput] = useState('')
  const [researchInput, setResearchInput] = useState('')

  // Modal / form states for qualifications & portfolio
  const [qualForm, setQualForm] = useState({ degree: '', institution: '', field_of_study: '', graduation_year: '' })
  const [showQualModal, setShowQualModal] = useState(false)

  const [portForm, setPortForm] = useState({ title: '', description: '', technologies: '', project_url: '', achievements: '' })
  const [showPortModal, setShowPortModal] = useState(false)

  // Verification submission form
  const [docForm, setDocForm] = useState({
    document_type: 'institutional_id',
    document_name: '',
    document_url: '',
    notes: '',
  })

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const data = await getMentorProfile(user.id)
      if (data && data.profile) {
        setProfile(data.profile)
        setBasicForm({
          full_name: data.profile.full_name || '',
          headline: data.profile.headline || '',
          bio: data.profile.bio || '',
          location: data.profile.location || '',
          contact_email: data.profile.contact_email || user.email || '',
          primary_category: data.profile.primary_category || 'industry_expert',
          institution_name: data.profile.institution_name || '',
          department: data.profile.department || '',
          academic_designation: data.profile.academic_designation || '',
          company_name: data.profile.company_name || '',
          company_role: data.profile.company_role || '',
          years_of_experience: data.profile.years_of_experience || 0,
          is_active: data.profile.is_active !== false,
        })

        if (data.expertise) {
          setExpertise(data.expertise)
          setExpertiseForm({
            technical_skills: data.expertise.technical_skills || [],
            domain_expertise: data.expertise.domain_expertise || [],
            research_interests: data.expertise.research_interests || [],
            tech_stack: data.expertise.tech_stack || [],
            mentorship_topics: data.expertise.mentorship_topics || [],
          })
        }

        if (data.availability) {
          setAvailability(data.availability)
          setAvailForm({
            is_available: data.availability.is_available !== false,
            weekly_hours: data.availability.weekly_hours || 5,
            timezone: data.availability.timezone || 'UTC',
            max_active_mentees: data.availability.max_active_mentees || 3,
            preferred_days: data.availability.preferred_days || ['Monday', 'Wednesday', 'Friday'],
          })
        }

        setQualifications(data.qualifications || [])
        setPortfolio(data.portfolio || [])
        setVerificationDocs(data.verificationDocuments || [])

        // Load Packages
        try {
          const pkgs = await getMentorPackages(data.profile.id)
          setPackages(pkgs || [])
          if (pkgs && pkgs.length > 0) {
            setPackageForms((prev) => {
              const updated = { ...prev }
              for (const p of pkgs) {
                if (updated[p.tier]) {
                  updated[p.tier] = {
                    ...updated[p.tier],
                    ...p,
                    price_usd: Number(p.price_usd),
                    duration_weeks: Number(p.duration_weeks) || 4,
                    sessions_count: Number(p.sessions_count) || 1,
                    benefits: Array.isArray(p.benefits) ? p.benefits : [],
                    limitations: Array.isArray(p.limitations) ? p.limitations : [],
                  }
                }
              }
              return updated
            })
          }
        } catch (pkgErr) {
          console.warn('Could not load mentor packages:', pkgErr)
        }
      } else {
        // Initialize with default auth info
        setBasicForm((f) => ({
          ...f,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
          contact_email: user.email || '',
        }))
      }
    } catch (err) {
      setError(err?.message || 'Could not load mentor profile.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleSaveBasic(e) {
    e?.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const categories = basicForm.primary_category === 'both'
        ? ['college_professor', 'industry_expert']
        : [basicForm.primary_category]

      if (!profile) {
        const created = await createMentorProfile({
          ...basicForm,
          user_id: user.id,
          categories,
        })
        setProfile(created)
        setSuccess('Mentor profile created successfully!')
      } else {
        const updated = await updateMentorProfile(profile.id, {
          ...basicForm,
          categories,
        })
        setProfile(updated)
        setSuccess('Profile updated successfully!')
      }
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not save profile.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveExpertise() {
    if (!profile) {
      setError('Please create your basic profile first.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await saveMentorExpertise(profile.id, expertiseForm)
      setSuccess('Expertise updated successfully!')
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not save expertise.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAvailability() {
    if (!profile) {
      setError('Please create your basic profile first.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await saveMentorAvailability(profile.id, availForm)
      setSuccess('Availability preferences updated!')
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not save availability.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddQualification(e) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    try {
      await addMentorQualification(profile.id, qualForm)
      setQualForm({ degree: '', institution: '', field_of_study: '', graduation_year: '' })
      setShowQualModal(false)
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not add qualification.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteQualification(id) {
    try {
      await deleteMentorQualification(id)
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not delete qualification.')
    }
  }

  async function handleAddPortfolio(e) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    try {
      const techList = portForm.technologies.split(',').map((t) => t.trim()).filter(Boolean)
      await addMentorPortfolioProject(profile.id, {
        ...portForm,
        technologies: techList,
      })
      setPortForm({ title: '', description: '', technologies: '', project_url: '', achievements: '' })
      setShowPortModal(false)
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not add portfolio project.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePortfolio(id) {
    try {
      await deleteMentorPortfolioProject(id)
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not delete project.')
    }
  }

  async function handleSubmitVerification(e) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await submitMentorVerification(profile.id, docForm)
      setDocForm({ document_type: 'institutional_id', document_name: '', document_url: '', notes: '' })
      setSuccess('Verification credentials submitted for review!')
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not submit verification.')
    } finally {
      setSaving(false)
    }
  }

  // Local dev simulation for administrator review
  async function handleSimulateReview(approved) {
    if (!profile) return
    setSaving(true)
    try {
      await reviewMentorVerification(profile.id, {
        approved,
        rejectionReason: approved ? null : 'Institutional directory record could not be verified. Please provide an active faculty staff directory link.',
        reviewerId: user.id,
      })
      await loadData()
    } catch (err) {
      setError(err?.message || 'Review simulation failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePackage(tier) {
    if (!profile) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const pkgData = { ...packageForms[tier], tier }
      await saveMentorPackage(profile.id, pkgData)
      setSuccess(`Updated ${PACKAGE_TIERS[tier]?.label || tier} package successfully!`)
      const refreshed = await getMentorPackages(profile.id)
      setPackages(refreshed)
    } catch (err) {
      setError(err?.message || 'Could not save package.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePackageActive(tier, currentActive) {
    if (!profile) return
    setSaving(true)
    setError('')
    try {
      const existing = packages.find((p) => p.tier === tier)
      if (existing) {
        await togglePackageActive(existing.id, !currentActive)
      } else {
        await saveMentorPackage(profile.id, { ...packageForms[tier], tier, is_active: !currentActive })
      }
      setPackageForms((prev) => ({
        ...prev,
        [tier]: { ...prev[tier], is_active: !currentActive },
      }))
      const refreshed = await getMentorPackages(profile.id)
      setPackages(refreshed)
      setSuccess(`Package status updated to ${!currentActive ? 'Active' : 'Inactive'}.`)
    } catch (err) {
      setError(err?.message || 'Could not toggle package status.')
    } finally {
      setSaving(false)
    }
  }

  function handleAddBenefit(tier) {
    if (!benefitInput.trim()) return
    setPackageForms((prev) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        benefits: [...(prev[tier].benefits || []), benefitInput.trim()],
      },
    }))
    setBenefitInput('')
  }

  function handleRemoveBenefit(tier, index) {
    setPackageForms((prev) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        benefits: (prev[tier].benefits || []).filter((_, i) => i !== index),
      },
    }))
  }

  if (loading) {
    return (
      <AppShell breadcrumb={<span>Mentors / Profile Management</span>}>
        <div className="mx-auto max-w-content px-6 py-8 md:px-9">
          <div className="skeleton h-8 w-48 mb-4" />
          <div className="skeleton h-64 w-full" />
        </div>
      </AppShell>
    )
  }

  const vBadge = VERIFICATION_BADGES[profile?.verification_status || 'unverified']

  return (
    <AppShell breadcrumb={<span><Link to="/mentors" className="hover:underline">Mentors</Link> / Profile Management</span>}>
      <div className="mx-auto max-w-content px-6 py-8 md:px-9">
        {/* Header section */}
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-text">
                {profile?.full_name || 'Mentor Profile'}
              </h1>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${vBadge.style}`}>
                {vBadge.label}
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {basicForm.primary_category === 'both'
                  ? '🎓 Academic & 💼 Industry'
                  : basicForm.primary_category === 'college_professor'
                    ? '🎓 College Professor'
                    : '💼 Industry Expert'}
              </span>
            </div>
            <p className="mt-1 text-sm text-textSecondary">
              {profile?.headline || 'Setup your profile, categories, expertise, and institutional credentials.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/mentors"
              className="rounded-[9px] border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:bg-surface2"
            >
              ← Back to Mentors
            </Link>
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="mt-4 rounded-[10px] border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-[10px] border border-accent/30 bg-accent/10 p-3.5 text-sm text-accent">
            {success}
          </div>
        )}

        {/* Rejection notice if applicable */}
        {profile?.verification_status === 'rejected' && profile?.rejection_reason && (
          <div className="mt-4 rounded-[10px] border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
            <h4 className="font-semibold">Verification Feedback</h4>
            <p className="mt-1 text-xs text-textSecondary">{profile.rejection_reason}</p>
            <p className="mt-2 text-xs font-medium text-primary">
              You can update your credentials and resubmit for verification under the "Verification & Credentials" tab.
            </p>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-border pb-3">
          {[
            { id: 'basic', label: '1. Basic Info & Category' },
            { id: 'expertise', label: '2. Expertise & Topics' },
            { id: 'qualifications', label: '3. Qualifications & Projects' },
            { id: 'availability', label: '4. Availability' },
            { id: 'verification', label: '5. Verification & Credentials' },
            { id: 'packages', label: '6. Packages & Offerings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-[9px] px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface text-textSecondary hover:bg-surface2 hover:text-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: BASIC INFO & CATEGORIES */}
        {activeTab === 'basic' && (
          <form onSubmit={handleSaveBasic} className="mt-6 space-y-6">
            <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card">
              <h3 className="text-base font-bold text-text">Mentor Category</h3>
              <p className="text-xs text-muted mb-4">
                Select your primary mentorship specialization. You can offer academic depth, industry architecture, or both.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    id: 'college_professor',
                    title: 'College Professor',
                    icon: '🎓',
                    desc: 'Research methodologies, theoretical algorithms, thesis guidance, and academic rigor.',
                  },
                  {
                    id: 'industry_expert',
                    title: 'Industry Expert',
                    icon: '💼',
                    desc: 'Production deployment, scalable cloud architecture, DevOps, and commercial standards.',
                  },
                  {
                    id: 'both',
                    title: 'Both Categories',
                    icon: '🌟',
                    desc: 'Bridge academic research with production-grade engineering and real-world deployment.',
                  },
                ].map((cat) => {
                  const isSelected = basicForm.primary_category === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setBasicForm((f) => ({ ...f, primary_category: cat.id }))}
                      className={`flex flex-col rounded-[12px] border p-4 text-left transition ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                          : 'border-border bg-surface hover:bg-surface2'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-xl">{cat.icon}</span>
                        <div className={`h-3.5 w-3.5 rounded-full border ${isSelected ? 'border-primary bg-primary' : 'border-border'}`} />
                      </div>
                      <h4 className="mt-2 text-sm font-semibold text-text">{cat.title}</h4>
                      <p className="mt-1 text-xs text-textSecondary">{cat.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card space-y-4">
              <h3 className="text-base font-bold text-text">Basic Profile Information</h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Full Name *</label>
                  <input
                    required
                    value={basicForm.full_name}
                    onChange={(e) => setBasicForm((f) => ({ ...f, full_name: e.target.value }))}
                    className={FIELD}
                    placeholder="e.g. Dr. Marcus Vance or Elena Rostova"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Professional Headline *</label>
                  <input
                    required
                    value={basicForm.headline}
                    onChange={(e) => setBasicForm((f) => ({ ...f, headline: e.target.value }))}
                    className={FIELD}
                    placeholder="e.g. Staff Software Architect & Cloud Advisor"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Biography & Mentorship Approach *</label>
                <textarea
                  required
                  rows={4}
                  value={basicForm.bio}
                  onChange={(e) => setBasicForm((f) => ({ ...f, bio: e.target.value }))}
                  className={FIELD}
                  placeholder="Describe your background, domains you mentor in, and how you guide student teams..."
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Location</label>
                  <input
                    value={basicForm.location}
                    onChange={(e) => setBasicForm((f) => ({ ...f, location: e.target.value }))}
                    className={FIELD}
                    placeholder="e.g. Cambridge, MA or Remote"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Contact Email</label>
                  <input
                    type="email"
                    value={basicForm.contact_email}
                    onChange={(e) => setBasicForm((f) => ({ ...f, contact_email: e.target.value }))}
                    className={FIELD}
                    placeholder="e.g. mentor@institution.edu"
                  />
                </div>
              </div>
            </div>

            {/* Dynamic Institutional vs Industry details */}
            <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card space-y-4">
              <h3 className="text-base font-bold text-text">Professional & Institutional Affiliation</h3>

              {(basicForm.primary_category === 'college_professor' || basicForm.primary_category === 'both') && (
                <div className="rounded-[10px] border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Academic Faculty Details</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted">College / University</label>
                      <input
                        value={basicForm.institution_name}
                        onChange={(e) => setBasicForm((f) => ({ ...f, institution_name: e.target.value }))}
                        className={FIELD}
                        placeholder="e.g. MIT"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">Department</label>
                      <input
                        value={basicForm.department}
                        onChange={(e) => setBasicForm((f) => ({ ...f, department: e.target.value }))}
                        className={FIELD}
                        placeholder="e.g. Computer Science"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">Academic Designation</label>
                      <input
                        value={basicForm.academic_designation}
                        onChange={(e) => setBasicForm((f) => ({ ...f, academic_designation: e.target.value }))}
                        className={FIELD}
                        placeholder="e.g. Professor, HOD"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(basicForm.primary_category === 'industry_expert' || basicForm.primary_category === 'both') && (
                <div className="rounded-[10px] border border-accent/20 bg-accent/5 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-accent">Industry Experience Details</h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-muted">Company / Organization</label>
                      <input
                        value={basicForm.company_name}
                        onChange={(e) => setBasicForm((f) => ({ ...f, company_name: e.target.value }))}
                        className={FIELD}
                        placeholder="e.g. CloudScale Systems"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">Role / Title</label>
                      <input
                        value={basicForm.company_role}
                        onChange={(e) => setBasicForm((f) => ({ ...f, company_role: e.target.value }))}
                        className={FIELD}
                        placeholder="e.g. Staff Software Architect"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Total Years of Experience</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={basicForm.years_of_experience}
                  onChange={(e) => setBasicForm((f) => ({ ...f, years_of_experience: Number(e.target.value) }))}
                  className={`${FIELD} max-w-[180px]`}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
              >
                {saving ? 'Saving...' : profile ? 'Save Changes' : 'Create Mentor Profile'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: EXPERTISE & SKILLS */}
        {activeTab === 'expertise' && (
          <div className="mt-6 space-y-6">
            <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card space-y-4">
              <div>
                <h3 className="text-base font-bold text-text">Technical Skills</h3>
                <p className="text-xs text-muted">Technologies, tools, frameworks, and programming languages.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {expertiseForm.technical_skills.map((skill) => (
                  <span key={skill} className="flex items-center gap-1.5 rounded-md bg-surface2 px-3 py-1.5 text-xs font-medium text-primary">
                    {skill}
                    <button
                      type="button"
                      onClick={() => setExpertiseForm((f) => ({ ...f, technical_skills: f.technical_skills.filter((s) => s !== skill) }))}
                      className="text-primary/60 hover:text-primary font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2 max-w-md">
                <input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (skillInput.trim() && !expertiseForm.technical_skills.includes(skillInput.trim())) {
                        setExpertiseForm((f) => ({ ...f, technical_skills: [...f.technical_skills, skillInput.trim()] }))
                        setSkillInput('')
                      }
                    }
                  }}
                  className={FIELD}
                  placeholder="Type a skill and press Enter"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (skillInput.trim() && !expertiseForm.technical_skills.includes(skillInput.trim())) {
                      setExpertiseForm((f) => ({ ...f, technical_skills: [...f.technical_skills, skillInput.trim()] }))
                      setSkillInput('')
                    }
                  }}
                  className="rounded-[9px] bg-surface2 px-4 py-2 text-xs font-semibold text-primary hover:bg-border"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card space-y-4">
              <div>
                <h3 className="text-base font-bold text-text">Mentorship Topics & Focus</h3>
                <p className="text-xs text-muted">Specific areas you want to guide students on (e.g. Research Methodology, Scalability, PayPal APIs).</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {expertiseForm.mentorship_topics.map((topic) => (
                  <span key={topic} className="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
                    {topic}
                    <button
                      type="button"
                      onClick={() => setExpertiseForm((f) => ({ ...f, mentorship_topics: f.mentorship_topics.filter((t) => t !== topic) }))}
                      className="text-accent/60 hover:text-accent font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2 max-w-md">
                <input
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (topicInput.trim() && !expertiseForm.mentorship_topics.includes(topicInput.trim())) {
                        setExpertiseForm((f) => ({ ...f, mentorship_topics: [...f.mentorship_topics, topicInput.trim()] }))
                        setTopicInput('')
                      }
                    }
                  }}
                  className={FIELD}
                  placeholder="e.g. Distributed Systems Architecture"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (topicInput.trim() && !expertiseForm.mentorship_topics.includes(topicInput.trim())) {
                      setExpertiseForm((f) => ({ ...f, mentorship_topics: [...f.mentorship_topics, topicInput.trim()] }))
                      setTopicInput('')
                    }
                  }}
                  className="rounded-[9px] bg-surface2 px-4 py-2 text-xs font-semibold text-primary hover:bg-border"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveExpertise}
                disabled={saving}
                className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Expertise'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: QUALIFICATIONS & PORTFOLIO PROJECTS */}
        {activeTab === 'qualifications' && (
          <div className="mt-6 space-y-6">
            {/* Qualifications */}
            <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-text">Academic Qualifications</h3>
                  <p className="text-xs text-muted">Degrees, institutions, and academic certifications.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQualModal(true)}
                  className="rounded-[9px] bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primaryHover"
                >
                  + Add Qualification
                </button>
              </div>

              {qualifications.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-xs text-muted">
                  No qualifications added yet. Click above to add your degrees or academic background.
                </p>
              ) : (
                <div className="divide-y divide-border rounded-[10px] border border-border">
                  {qualifications.map((q) => (
                    <div key={q.id} className="flex items-center justify-between p-4 text-sm">
                      <div>
                        <h4 className="font-semibold text-text">{q.degree}</h4>
                        <p className="text-xs text-textSecondary">{q.institution} {q.field_of_study && `· ${q.field_of_study}`}</p>
                        {q.graduation_year && <span className="text-[11px] text-muted">Graduation: {q.graduation_year}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteQualification(q.id)}
                        className="text-xs font-medium text-danger hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Portfolio Projects */}
            <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-text">Project Experience & Portfolio</h3>
                  <p className="text-xs text-muted">Relevant engineering systems, research projects, or open source repositories.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPortModal(true)}
                  className="rounded-[9px] bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primaryHover"
                >
                  + Add Project
                </button>
              </div>

              {portfolio.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-xs text-muted">
                  No portfolio projects added yet. Showcase previous projects to give mentees confidence in your guidance.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {portfolio.map((p) => (
                    <div key={p.id} className="rounded-[12px] border border-border bg-surface2/50 p-4">
                      <div className="flex items-start justify-between">
                        <h4 className="font-semibold text-text">{p.title}</h4>
                        <button
                          type="button"
                          onClick={() => handleDeletePortfolio(p.id)}
                          className="text-xs text-danger hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                      {p.description && <p className="mt-1 text-xs text-textSecondary">{p.description}</p>}
                      {p.technologies?.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {p.technologies.map((t) => (
                            <span key={t} className="rounded bg-surface px-2 py-0.5 text-[10px] font-medium text-primary">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {p.project_url && (
                        <a
                          href={p.project_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                        >
                          View Repository / Project ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal for adding qualification */}
            {showQualModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <form onSubmit={handleAddQualification} className="w-full max-w-md rounded-[14px] border border-border bg-surface p-6 shadow-xl space-y-4">
                  <h3 className="text-base font-bold text-text">Add Qualification</h3>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Degree / Title *</label>
                    <input
                      required
                      value={qualForm.degree}
                      onChange={(e) => setQualForm((q) => ({ ...q, degree: e.target.value }))}
                      className={FIELD}
                      placeholder="e.g. Ph.D. in Computer Science"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Institution / University *</label>
                    <input
                      required
                      value={qualForm.institution}
                      onChange={(e) => setQualForm((q) => ({ ...q, institution: e.target.value }))}
                      className={FIELD}
                      placeholder="e.g. Stanford University"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-muted">Field of Study</label>
                      <input
                        value={qualForm.field_of_study}
                        onChange={(e) => setQualForm((q) => ({ ...q, field_of_study: e.target.value }))}
                        className={FIELD}
                        placeholder="e.g. AI / Neural Systems"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">Graduation Year</label>
                      <input
                        type="number"
                        value={qualForm.graduation_year}
                        onChange={(e) => setQualForm((q) => ({ ...q, graduation_year: e.target.value }))}
                        className={FIELD}
                        placeholder="e.g. 2018"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQualModal(false)}
                      className="rounded-[9px] border border-border px-4 py-2 text-xs font-semibold text-textSecondary hover:bg-surface2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-[9px] bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primaryHover"
                    >
                      Add Qualification
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Modal for adding portfolio project */}
            {showPortModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <form onSubmit={handleAddPortfolio} className="w-full max-w-md rounded-[14px] border border-border bg-surface p-6 shadow-xl space-y-4">
                  <h3 className="text-base font-bold text-text">Add Portfolio Project</h3>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Project Title *</label>
                    <input
                      required
                      value={portForm.title}
                      onChange={(e) => setPortForm((p) => ({ ...p, title: e.target.value }))}
                      className={FIELD}
                      placeholder="e.g. High-Concurrency Transaction Engine"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Description</label>
                    <textarea
                      rows={3}
                      value={portForm.description}
                      onChange={(e) => setPortForm((p) => ({ ...p, description: e.target.value }))}
                      className={FIELD}
                      placeholder="Brief overview of the project and your role..."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Technologies Used (comma-separated)</label>
                    <input
                      value={portForm.technologies}
                      onChange={(e) => setPortForm((p) => ({ ...p, technologies: e.target.value }))}
                      className={FIELD}
                      placeholder="React, Docker, AWS, PayPal API"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Project or Repository URL</label>
                    <input
                      type="url"
                      value={portForm.project_url}
                      onChange={(e) => setPortForm((p) => ({ ...p, project_url: e.target.value }))}
                      className={FIELD}
                      placeholder="https://github.com/..."
                    />
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPortModal(false)}
                      className="rounded-[9px] border border-border px-4 py-2 text-xs font-semibold text-textSecondary hover:bg-surface2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-[9px] bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primaryHover"
                    >
                      Add Project
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: AVAILABILITY & CAPACITY */}
        {activeTab === 'availability' && (
          <div className="mt-6 space-y-6">
            <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card space-y-4">
              <h3 className="text-base font-bold text-text">Mentoring Availability & Timezone</h3>

              <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface2/50 p-4">
                <div>
                  <h4 className="text-sm font-semibold text-text">Currently Open for Mentorship</h4>
                  <p className="text-xs text-muted">When paused, student teams will not be able to send new mentorship requests.</p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={availForm.is_available}
                    onChange={(e) => setAvailForm((f) => ({ ...f, is_available: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Weekly Mentoring Hours</label>
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={availForm.weekly_hours}
                    onChange={(e) => setAvailForm((f) => ({ ...f, weekly_hours: Number(e.target.value) }))}
                    className={FIELD}
                  />
                  <span className="mt-1 block text-[11px] text-muted">Hours you can dedicate each week</span>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Timezone</label>
                  <select
                    value={availForm.timezone}
                    onChange={(e) => setAvailForm((f) => ({ ...f, timezone: e.target.value }))}
                    className={FIELD}
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="Europe/London">London (GMT/BST)</option>
                    <option value="Europe/Paris">Central Europe (CET)</option>
                    <option value="Asia/Kolkata">India (IST)</option>
                    <option value="Asia/Singapore">Singapore / SGT</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Max Active Mentees</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={availForm.max_active_mentees}
                    onChange={(e) => setAvailForm((f) => ({ ...f, max_active_mentees: Number(e.target.value) }))}
                    className={FIELD}
                  />
                  <span className="mt-1 block text-[11px] text-muted">Simultaneous project teams</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveAvailability}
                disabled={saving}
                className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Availability'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: VERIFICATION & CREDENTIALS */}
        {activeTab === 'verification' && (
          <div className="mt-6 space-y-6">
            <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-base font-bold text-text">Verification Status</h3>
                  <p className="text-xs text-muted">
                    Verified mentors receive the verified badge across Collivra and are prioritized in matching recommendations.
                  </p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${vBadge.style}`}>
                  {vBadge.label}
                </span>
              </div>

              {profile?.verification_status === 'verified' ? (
                <div className="rounded-[10px] border border-accent/20 bg-accent/5 p-4 text-xs text-accent">
                  <p className="font-semibold text-sm">You are an officially verified Collivra mentor!</p>
                  <p className="mt-1 text-textSecondary">
                    Your institutional or industry credentials have been authenticated. Verified on{' '}
                    {new Date(profile.verified_at || Date.now()).toLocaleDateString()}.
                  </p>
                </div>
              ) : profile?.verification_status === 'pending' ? (
                <div className="rounded-[10px] border border-warning/20 bg-warning/5 p-4 text-xs text-warning">
                  <p className="font-semibold text-sm">Verification In Progress</p>
                  <p className="mt-1 text-textSecondary">
                    Your submitted credentials are under administrative review. This process ensures student safety and high mentorship standards.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitVerification} className="space-y-4">
                  <h4 className="text-sm font-bold text-text">Submit Credentials for Verification</h4>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Document / Proof Type *</label>
                      <select
                        value={docForm.document_type}
                        onChange={(e) => setDocForm((d) => ({ ...d, document_type: e.target.value }))}
                        className={FIELD}
                      >
                        <option value="institutional_id">College / Faculty ID</option>
                        <option value="faculty_id">Academic Staff Directory Link</option>
                        <option value="employment_proof">Corporate Employment Proof / Letter</option>
                        <option value="degree_certificate">Degree Certificate</option>
                        <option value="linkedin_verification">Verified LinkedIn / Industry Portfolio</option>
                        <option value="other">Other Official Credential</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Document Name or Credential Title *</label>
                      <input
                        required
                        value={docForm.document_name}
                        onChange={(e) => setDocForm((d) => ({ ...d, document_name: e.target.value }))}
                        className={FIELD}
                        placeholder="e.g. Stanford CS Faculty ID or AWS Cert"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Document Link / Repository / Directory URL</label>
                    <input
                      type="url"
                      value={docForm.document_url}
                      onChange={(e) => setDocForm((d) => ({ ...d, document_url: e.target.value }))}
                      className={FIELD}
                      placeholder="https://..."
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Verification Notes</label>
                    <textarea
                      rows={2}
                      value={docForm.notes}
                      onChange={(e) => setDocForm((d) => ({ ...d, notes: e.target.value }))}
                      className={FIELD}
                      placeholder="Add any relevant verification references (e.g. staff directory link, institutional email)..."
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving || !profile}
                      className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                    >
                      {saving ? 'Submitting...' : 'Submit for Verification'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Submitted verification history */}
            {verificationDocs.length > 0 && (
              <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card space-y-3">
                <h4 className="text-sm font-bold text-text">Submitted Verification Credentials</h4>
                <div className="divide-y divide-border rounded-[10px] border border-border">
                  {verificationDocs.map((doc) => (
                    <div key={doc.id} className="flex flex-wrap items-center justify-between p-3.5 text-xs">
                      <div>
                        <span className="font-semibold text-text">{doc.document_name}</span>
                        <span className="ml-2 text-muted">({doc.document_type})</span>
                        {doc.notes && <p className="mt-0.5 text-textSecondary">{doc.notes}</p>}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        doc.status === 'approved'
                          ? 'bg-accent/10 text-accent'
                          : doc.status === 'rejected'
                            ? 'bg-danger/10 text-danger'
                            : 'bg-warning/10 text-warning'
                      }`}>
                        {doc.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Local Dev Mode Admin Simulation Controller */}
            <div className="rounded-[14px] border border-warning/30 bg-warning/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">🛠️</span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-warning">
                  Local Dev Mode: Administrative Verification Simulator
                </h4>
              </div>
              <p className="text-xs text-textSecondary">
                In local development mode without live backend administrative services, test your verification workflows by simulating an admin decision below:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleSimulateReview(true)}
                  disabled={saving || !profile}
                  className="rounded-[8px] bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Simulate Admin Approval (Verify)
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateReview(false)}
                  disabled={saving || !profile}
                  className="rounded-[8px] bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Simulate Admin Rejection (Reject)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!profile) return
                    await updateMentorProfile(profile.id, { verification_status: 'unverified' })
                    await loadData()
                  }}
                  disabled={saving || !profile}
                  className="rounded-[8px] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface2 disabled:opacity-50"
                >
                  Reset to Unverified
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: PACKAGES & OFFERINGS */}
        {activeTab === 'packages' && (
          <div className="mt-6 space-y-6">
            <div className="rounded-[14px] border border-border bg-surface p-6 shadow-card">
              <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                <div>
                  <h3 className="text-base font-bold text-text">Mentorship Packages & Pricing</h3>
                  <p className="text-xs text-muted">
                    Configure your offerings across tiers. Students can review benefits, pricing, and book your mentorship based on these packages.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                    {packages.filter((p) => p.is_active).length} Active Offering(s)
                  </span>
                </div>
              </div>

              {/* Tier Selection Buttons */}
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {['basic', 'standard', 'premium', 'custom'].map((t) => {
                  const form = packageForms[t]
                  const isCurrent = editingTier === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditingTier(t)}
                      className={`relative flex flex-col items-start rounded-xl border p-4 text-left transition ${
                        isCurrent
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border bg-surface2/50 hover:bg-surface2'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">
                          {PACKAGE_TIERS[t]?.label}
                        </span>
                        <span className={`h-2 w-2 rounded-full ${form.is_active ? 'bg-accent' : 'bg-muted'}`} />
                      </div>
                      <div className="mt-2 text-lg font-bold text-text">
                        ${form.price_usd}
                        <span className="text-xs font-normal text-muted">
                          /{form.billing_interval === 'monthly' ? 'mo' : form.billing_interval}
                        </span>
                      </div>
                      <span className="mt-1 text-[11px] text-textSecondary line-clamp-1">
                        {form.sessions_count} session(s) · {form.duration_weeks} wks
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Package Detail Editor Form */}
              {editingTier && (
                <div className="mt-6 rounded-xl border border-border bg-surface2/30 p-5 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                    <div>
                      <h4 className="text-sm font-bold text-text">
                        Editing {PACKAGE_TIERS[editingTier]?.label}
                      </h4>
                      <p className="text-xs text-muted">
                        {PACKAGE_TIERS[editingTier]?.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-text">
                        <input
                          type="checkbox"
                          checked={packageForms[editingTier].is_active}
                          onChange={() => handleTogglePackageActive(editingTier, packageForms[editingTier].is_active)}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                        <span>Active for student booking</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-text mb-1">Package Title</label>
                      <input
                        type="text"
                        value={packageForms[editingTier].name}
                        onChange={(e) => setPackageForms((prev) => ({
                          ...prev,
                          [editingTier]: { ...prev[editingTier], name: e.target.value },
                        }))}
                        className={FIELD}
                        placeholder="e.g. Essential Mentorship"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-text mb-1">Price (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs text-muted">$</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={packageForms[editingTier].price_usd}
                          onChange={(e) => setPackageForms((prev) => ({
                            ...prev,
                            [editingTier]: { ...prev[editingTier], price_usd: e.target.value },
                          }))}
                          className={`${FIELD} pl-7`}
                          placeholder="50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-text mb-1">Billing Interval</label>
                      <select
                        value={packageForms[editingTier].billing_interval}
                        onChange={(e) => setPackageForms((prev) => ({
                          ...prev,
                          [editingTier]: { ...prev[editingTier], billing_interval: e.target.value },
                        }))}
                        className={FIELD}
                      >
                        <option value="monthly">Monthly Recurring</option>
                        <option value="project">Project / Milestone Duration</option>
                        <option value="one_time">One-Time Advisory</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-text mb-1">Number of 1:1 Sessions</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={packageForms[editingTier].sessions_count}
                        onChange={(e) => setPackageForms((prev) => ({
                          ...prev,
                          [editingTier]: { ...prev[editingTier], sessions_count: e.target.value },
                        }))}
                        className={FIELD}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-text mb-1">Duration (Weeks)</label>
                      <input
                        type="number"
                        min="1"
                        max="52"
                        value={packageForms[editingTier].duration_weeks}
                        onChange={(e) => setPackageForms((prev) => ({
                          ...prev,
                          [editingTier]: { ...prev[editingTier], duration_weeks: e.target.value },
                        }))}
                        className={FIELD}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-text mb-1">Description & Scope</label>
                      <textarea
                        rows={2}
                        value={packageForms[editingTier].description || ''}
                        onChange={(e) => setPackageForms((prev) => ({
                          ...prev,
                          [editingTier]: { ...prev[editingTier], description: e.target.value },
                        }))}
                        className={FIELD}
                        placeholder="Detail what students can expect from this tier..."
                      />
                    </div>
                  </div>

                  {/* Feature Checkboxes */}
                  <div>
                    <h5 className="text-xs font-semibold text-text mb-2">Included Deliverables</h5>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { key: 'chat_support', label: '💬 Chat Support' },
                        { key: 'code_review', label: '💻 Code Review' },
                        { key: 'project_review', label: '📋 Project Review' },
                        { key: 'priority_support', label: '⚡ Priority Access' },
                      ].map((item) => (
                        <label
                          key={item.key}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface p-2.5 text-xs text-text hover:bg-surface2"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(packageForms[editingTier][item.key])}
                            onChange={(e) => setPackageForms((prev) => ({
                              ...prev,
                              [editingTier]: { ...prev[editingTier], [item.key]: e.target.checked },
                            }))}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Custom Benefits List */}
                  <div>
                    <h5 className="text-xs font-semibold text-text mb-2">Key Highlights & Benefits</h5>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={benefitInput}
                        onChange={(e) => setBenefitInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddBenefit(editingTier)
                          }
                        }}
                        className={FIELD}
                        placeholder="Add a custom highlight (e.g. 'Resume & portfolio critique')..."
                      />
                      <button
                        type="button"
                        onClick={() => handleAddBenefit(editingTier)}
                        className="rounded-[9px] bg-surface2 px-4 py-2 text-xs font-semibold text-text hover:bg-border"
                      >
                        Add
                      </button>
                    </div>

                    {packageForms[editingTier].benefits?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {packageForms[editingTier].benefits.map((b, idx) => (
                          <span
                            key={idx}
                            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-textSecondary"
                          >
                            <span>✓ {b}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveBenefit(editingTier, idx)}
                              className="text-muted hover:text-danger"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-border">
                    <button
                      type="button"
                      onClick={() => handleSavePackage(editingTier)}
                      disabled={saving || !profile}
                      className="rounded-[9px] bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                    >
                      {saving ? 'Saving Package...' : `Save ${PACKAGE_TIERS[editingTier]?.label || 'Package'}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

