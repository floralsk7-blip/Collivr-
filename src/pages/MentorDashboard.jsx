/**
 * Collivra Mentor Dashboard
 * Dedicated command center for mentors to manage mentees, incoming requests,
 * upcoming sessions, package configurations, earnings, and reviews.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getMentorProfile } from '../lib/mentorProfileService.js'
import {
  getBookingsForMentor,
  acceptBooking,
  rejectBooking,
  proposeAlternativeTimes,
  completeBooking,
} from '../lib/mentorBookingService.js'
import {
  getMentorDashboardStats,
  getMentorReviews,
} from '../lib/mentorWorkspaceService.js'

export default function MentorDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [profileData, setProfileData] = useState(null)
  const [bookings, setBookings] = useState([])
  const [stats, setStats] = useState({
    activeMentees: 0,
    completedSessions: 0,
    pendingRequests: 0,
    totalEarnings: 0,
  })
  const [reviews, setReviews] = useState([])
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [processingId, setProcessingId] = useState(null)

  // Modals / prompt state
  const [activeTab, setActiveTab] = useState('requests') // 'requests' | 'upcoming' | 'history' | 'reviews'

  const loadDashboard = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setActionError('')
    try {
      const p = await getMentorProfile(user.id)
      if (p && p.profile) {
        setProfileData(p)
        const [mentorBookings, mentorStats, mentorRev] = await Promise.all([
          getBookingsForMentor(p.profile.id),
          getMentorDashboardStats(p.profile.id),
          getMentorReviews(p.profile.id),
        ])
        setBookings(mentorBookings || [])
        setStats(mentorStats || {})
        setReviews(mentorRev || [])
      } else {
        setProfileData(null)
      }
    } catch (err) {
      console.warn('Dashboard load error:', err)
      setActionError('Could not load mentor dashboard.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  async function handleAccept(bookingId) {
    if (!profileData?.profile?.id) return
    setProcessingId(bookingId)
    setActionError('')
    setActionSuccess('')
    try {
      await acceptBooking(bookingId, profileData.profile.id, {
        meetingLink: 'https://meet.google.com/collivra-mentorship',
        mentorNotes: 'Session confirmed! Please come prepared with your discussion topics.',
      })
      setActionSuccess('Booking accepted and session confirmed!')
      await loadDashboard()
    } catch (err) {
      setActionError(err?.message || 'Could not accept booking.')
    } finally {
      setProcessingId(null)
    }
  }

  async function handleReject(bookingId) {
    if (!profileData?.profile?.id) return
    const reason = window.prompt('Please provide a reason for declining this request (will be shared with student):', 'Schedule conflict at the requested time.')
    if (reason === null) return

    setProcessingId(bookingId)
    setActionError('')
    setActionSuccess('')
    try {
      await rejectBooking(bookingId, profileData.profile.id, reason)
      setActionSuccess('Booking declined. Full refund workflow initiated.')
      await loadDashboard()
    } catch (err) {
      setActionError(err?.message || 'Could not decline booking.')
    } finally {
      setProcessingId(null)
    }
  }

  async function handleComplete(bookingId) {
    if (!profileData?.profile?.id) return
    setProcessingId(bookingId)
    try {
      await completeBooking(bookingId, profileData.profile.id)
      setActionSuccess('Session marked as completed!')
      await loadDashboard()
    } catch (err) {
      setActionError(err?.message || 'Could not complete session.')
    } finally {
      setProcessingId(null)
    }
  }

  const pendingRequests = bookings.filter((b) => b.status === 'awaiting_acceptance' || b.status === 'payment_verified')
  const upcomingSessions = bookings.filter((b) => b.status === 'confirmed')
  const pastSessions = bookings.filter((b) => b.status === 'completed' || b.status === 'cancelled' || b.status === 'refunded')

  if (loading) {
    return (
      <AppShell breadcrumb={<span>Mentor / Dashboard</span>}>
        <div className="mx-auto max-w-content px-6 py-8 md:px-9">
          <div className="skeleton h-8 w-48 mb-4" />
          <div className="skeleton h-40 w-full mb-6" />
          <div className="skeleton h-64 w-full" />
        </div>
      </AppShell>
    )
  }

  if (!profileData?.profile) {
    return (
      <AppShell breadcrumb={<span>Mentor / Dashboard</span>}>
        <div className="mx-auto max-w-content px-6 py-12 md:px-9 text-center space-y-4">
          <span className="text-4xl">🎓</span>
          <h2 className="text-xl font-bold text-text">Become a Collivra Mentor</h2>
          <p className="text-xs text-textSecondary max-w-md mx-auto">
            You do not have an active mentor profile yet. Create your profile, set your categories (College Professor or Industry Expert), and publish mentorship packages.
          </p>
          <Link
            to="/mentor/profile"
            className="inline-block rounded-[9px] bg-primary px-5 py-2.5 text-xs font-semibold text-white hover:bg-primaryHover shadow-sm"
          >
            Setup Mentor Profile →
          </Link>
        </div>
      </AppShell>
    )
  }

  const { profile } = profileData

  return (
    <AppShell breadcrumb={<span>Mentor / Dashboard</span>}>
      <div className="mx-auto max-w-content px-6 py-8 md:px-9 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-text">
                Welcome, {profile.full_name}
              </h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                profile.verification_status === 'verified'
                  ? 'bg-accent/10 text-accent'
                  : 'bg-warning/10 text-warning'
              }`}>
                {profile.verification_status === 'verified' ? '✓ Verified Mentor' : 'Pending Verification'}
              </span>
            </div>
            <p className="mt-1 text-xs text-textSecondary">
              {profile.headline || 'Manage your active mentorships, incoming booking requests, and student reviews.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/mentor/profile"
              className="rounded-[9px] border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-text hover:bg-surface2"
            >
              Edit Profile & Packages
            </Link>
          </div>
        </div>

        {/* Notifications */}
        {actionError && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-danger">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="rounded-xl border border-accent/30 bg-accent/10 p-3.5 text-xs text-accent">
            {actionSuccess}
          </div>
        )}

        {/* Metric Overview Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <span className="text-xs font-medium text-muted">Active Mentees</span>
            <div className="mt-1 text-2xl font-bold text-text">{stats.activeMentees}</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <span className="text-xs font-medium text-muted">Pending Requests</span>
            <div className="mt-1 text-2xl font-bold text-warning">{pendingRequests.length}</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <span className="text-xs font-medium text-muted">Completed Sessions</span>
            <div className="mt-1 text-2xl font-bold text-primary">{stats.completedSessions}</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <span className="text-xs font-medium text-muted">Total Earnings</span>
            <div className="mt-1 text-2xl font-bold text-accent">${stats.totalEarnings}</div>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-border pb-2 gap-2 text-xs">
          {[
            { id: 'requests', label: `Pending Requests (${pendingRequests.length})` },
            { id: 'upcoming', label: `Upcoming Sessions (${upcomingSessions.length})` },
            { id: 'history', label: `Session History (${pastSessions.length})` },
            { id: 'reviews', label: `Student Reviews (${reviews.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3.5 py-1.5 font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface text-textSecondary hover:bg-surface2'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: PENDING REQUESTS */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            {pendingRequests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted">
                No pending booking requests at this time.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {pendingRequests.map((b) => (
                  <div key={b.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                          {b.mentor_packages?.name || 'Mentorship Package'}
                        </span>
                        <h4 className="mt-1 text-sm font-bold text-text">
                          Student: {b.student_profiles?.name || 'Collivra Student'}
                        </h4>
                        <p className="text-xs text-muted">
                          {b.projects?.name ? `Project: ${b.projects.name}` : 'Student Capstone'}
                        </p>
                      </div>
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                        Payment Verified
                      </span>
                    </div>

                    <div className="rounded-lg bg-surface2/40 p-3 text-xs text-textSecondary">
                      <div className="flex justify-between font-medium">
                        <span>Requested Time:</span>
                        <span className="text-text font-semibold">
                          {new Date(b.session_scheduled_at).toLocaleString()}
                        </span>
                      </div>
                      {b.student_notes && (
                        <p className="mt-1.5 text-[11px] text-muted italic">
                          "{b.student_notes}"
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-border">
                      <button
                        type="button"
                        onClick={() => handleReject(b.id)}
                        disabled={processingId === b.id}
                        className="rounded-[8px] border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
                      >
                        Decline & Refund
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAccept(b.id)}
                        disabled={processingId === b.id}
                        className="rounded-[8px] bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 shadow-sm"
                      >
                        {processingId === b.id ? 'Confirming...' : 'Accept & Confirm'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: UPCOMING SESSIONS */}
        {activeTab === 'upcoming' && (
          <div className="space-y-4">
            {upcomingSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted">
                No upcoming confirmed sessions scheduled.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {upcomingSessions.map((b) => (
                  <div key={b.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                          Confirmed Session
                        </span>
                        <h4 className="mt-1 text-sm font-bold text-text">
                          {b.student_profiles?.name || 'Student Mentee'}
                        </h4>
                        <p className="text-xs text-muted">
                          {b.projects?.name ? `Project: ${b.projects.name}` : 'Mentorship'}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-text">
                        {new Date(b.session_scheduled_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="rounded-lg bg-surface2/50 p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted">Time:</span>
                        <span className="font-semibold text-text">
                          {new Date(b.session_scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({b.session_duration_minutes} min)
                        </span>
                      </div>
                      {b.meeting_link && (
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-muted">Meeting:</span>
                          <a
                            href={b.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-semibold"
                          >
                            Open Video Call ↗
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-border">
                      <button
                        type="button"
                        onClick={() => handleComplete(b.id)}
                        disabled={processingId === b.id}
                        className="rounded-[8px] bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primaryHover"
                      >
                        Mark Completed
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {pastSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted">
                No past session history recorded.
              </div>
            ) : (
              <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
                {pastSessions.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center justify-between p-4 text-xs">
                    <div>
                      <span className="font-semibold text-text">
                        {b.student_profiles?.name || 'Student'}
                      </span>
                      <span className="ml-2 text-muted">
                        · {new Date(b.session_scheduled_at).toLocaleDateString()}
                      </span>
                      <p className="mt-0.5 text-textSecondary">{b.mentor_packages?.name}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                      b.status === 'completed'
                        ? 'bg-accent/10 text-accent'
                        : 'bg-danger/10 text-danger'
                    }`}>
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: REVIEWS */}
        {activeTab === 'reviews' && (
          <div className="space-y-4">
            {reviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted">
                No verified student reviews received yet. Reviews appear after completed sessions.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {reviews.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-accent">
                        ★ {Number(r.rating).toFixed(1)} / 5.0
                      </span>
                      <span className="text-[11px] text-muted">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {r.review_title && (
                      <h4 className="text-xs font-bold text-text">{r.review_title}</h4>
                    )}
                    <p className="text-xs text-textSecondary leading-relaxed">
                      "{r.review_text}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}

