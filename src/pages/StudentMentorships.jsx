/**
 * Collivra Student Mentorships Hub
 * Enables students to track active mentor subscriptions, upcoming video sessions,
 * session notes, and submit verified reviews.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/AppShell.jsx'
import { useAuth } from '../hooks/useAuth.js'
import {
  getStudentSubscriptions,
  cancelMentorSubscription,
} from '../lib/mentorPackageService.js'
import {
  getBookingsForStudent,
  cancelBooking,
} from '../lib/mentorBookingService.js'
import { submitMentorReview } from '../lib/mentorWorkspaceService.js'

export default function StudentMentorships() {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState([])
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Review modal state
  const [reviewBooking, setReviewBooking] = useState(null)
  const [reviewForm, setReviewForm] = useState({ rating: 5, review_title: '', review_text: '' })
  const [submittingReview, setSubmittingReview] = useState(false)

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const [subs, studentBookings] = await Promise.all([
        getStudentSubscriptions(user.id),
        getBookingsForStudent(user.id),
      ])
      setSubscriptions(subs || [])
      setBookings(studentBookings || [])
    } catch (err) {
      console.warn('Error loading student mentorships:', err)
      setError('Could not load mentorship subscriptions.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleCancelSub(subId) {
    if (!window.confirm('Are you sure you want to schedule cancellation at the end of this billing period?')) return
    setError('')
    try {
      await cancelMentorSubscription(subId, 'Student requested cancellation.')
      setSuccess('Cancellation scheduled for end of billing period.')
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not cancel subscription.')
    }
  }

  async function handleSubmitReview(e) {
    e?.preventDefault()
    if (!reviewBooking) return
    setSubmittingReview(true)
    setError('')
    setSuccess('')
    try {
      await submitMentorReview({
        bookingId: reviewBooking.id,
        mentorId: reviewBooking.mentor_id,
        studentId: user.id,
        rating: reviewForm.rating,
        reviewTitle: reviewForm.review_title,
        reviewText: reviewForm.review_text,
      })
      setSuccess('Review submitted successfully! Thank you for your feedback.')
      setReviewBooking(null)
      setReviewForm({ rating: 5, review_title: '', review_text: '' })
      await loadData()
    } catch (err) {
      setError(err?.message || 'Could not submit review.')
    } finally {
      setSubmittingReview(false)
    }
  }

  const upcomingBookings = bookings.filter((b) => b.status === 'confirmed' || b.status === 'awaiting_acceptance')
  const completedBookings = bookings.filter((b) => b.status === 'completed')

  if (loading) {
    return (
      <AppShell breadcrumb={<span>Student / Mentorships</span>}>
        <div className="mx-auto max-w-content px-6 py-8 md:px-9">
          <div className="skeleton h-8 w-48 mb-4" />
          <div className="skeleton h-48 w-full" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell breadcrumb={<span>Student / My Mentorships</span>}>
      <div className="mx-auto max-w-content px-6 py-8 md:px-9 space-y-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold text-text">My Mentorships</h1>
            <p className="mt-1 text-xs text-textSecondary">
              Track your active mentor packages, upcoming 1:1 sessions, and review completed mentorships.
            </p>
          </div>

          <Link
            to="/mentors"
            className="rounded-[9px] bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primaryHover shadow-sm"
          >
            Explore Mentors →
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-xs text-danger">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-accent/30 bg-accent/10 p-3.5 text-xs text-accent">
            {success}
          </div>
        )}

        {/* 1. UPCOMING SESSIONS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
              Upcoming Mentorship Sessions ({upcomingBookings.length})
            </h2>
          </div>

          {upcomingBookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">
              No sessions scheduled currently. Browse AI-matched mentors to book a session.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {upcomingBookings.map((b) => (
                <div key={b.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-bold text-primary uppercase">
                        {b.mentor_packages?.name || 'Mentorship'}
                      </span>
                      <h4 className="mt-1 text-sm font-bold text-text">
                        {b.mentor_profiles?.full_name || 'Assigned Mentor'}
                      </h4>
                      <p className="text-xs text-muted">
                        {b.projects?.name ? `Project: ${b.projects.name}` : 'Student Capstone'}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                      b.status === 'confirmed' ? 'bg-accent/10 text-accent' : 'bg-warning/10 text-warning'
                    }`}>
                      {b.status === 'confirmed' ? '✓ Confirmed' : 'Awaiting Confirmation'}
                    </span>
                  </div>

                  <div className="rounded-xl bg-surface2/40 p-3 text-xs space-y-1">
                    <div className="flex justify-between font-medium">
                      <span className="text-muted">Date & Time:</span>
                      <span className="text-text font-semibold">
                        {new Date(b.session_scheduled_at).toLocaleString()}
                      </span>
                    </div>
                    {b.meeting_link && (
                      <div className="flex justify-between items-center pt-1.5 border-t border-border">
                        <span className="text-muted">Video Room:</span>
                        <a
                          href={b.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-primary hover:underline"
                        >
                          Join Session Video Call ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. ACTIVE PACKAGES & SUBSCRIPTIONS */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
            Active Mentor Packages ({subscriptions.length})
          </h2>

          {subscriptions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">
              You do not have any active mentor packages.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-text">
                        {sub.mentor_packages?.name}
                      </h4>
                      <p className="text-xs text-muted">
                        Mentor: <strong>{sub.mentor_profiles?.full_name}</strong>
                      </p>
                    </div>
                    <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold text-accent uppercase">
                      {sub.status}
                    </span>
                  </div>

                  <div className="rounded-xl bg-surface2/30 p-3 text-xs space-y-1 text-textSecondary">
                    <div className="flex justify-between">
                      <span>Rate:</span>
                      <span className="font-semibold text-text">${sub.price_paid} / {sub.billing_interval}</span>
                    </div>
                    {sub.current_period_end && (
                      <div className="flex justify-between">
                        <span>Period Ends:</span>
                        <span className="text-text font-medium">
                          {new Date(sub.current_period_end).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {sub.cancel_at_period_end && (
                      <p className="text-[11px] text-warning pt-1">
                        Scheduled to cancel at end of current period.
                      </p>
                    )}
                  </div>

                  {!sub.cancel_at_period_end && sub.status === 'active' && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => handleCancelSub(sub.id)}
                        className="text-xs text-muted hover:text-danger"
                      >
                        Cancel at period end
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. COMPLETED SESSIONS & REVIEWS */}
        {completedBookings.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
              Completed Mentorship Sessions ({completedBookings.length})
            </h2>

            <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
              {completedBookings.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between p-4 text-xs">
                  <div>
                    <h4 className="font-semibold text-text">
                      Session with {b.mentor_profiles?.full_name}
                    </h4>
                    <span className="text-muted">
                      {new Date(b.session_scheduled_at).toLocaleDateString()} · {b.mentor_packages?.name}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setReviewBooking(b)}
                    className="rounded-[8px] bg-surface2 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-border"
                  >
                    ★ Leave Review
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review Modal */}
        {reviewBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-border pb-3">
                <h3 className="text-sm font-bold text-text">
                  Review Session with {reviewBooking.mentor_profiles?.full_name}
                </h3>
                <button
                  type="button"
                  onClick={() => setReviewBooking(null)}
                  className="text-muted hover:text-text"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitReview} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Rating</label>
                  <select
                    value={reviewForm.rating}
                    onChange={(e) => setReviewForm((f) => ({ ...f, rating: Number(e.target.value) }))}
                    className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-xs text-text focus:outline-none"
                  >
                    <option value={5}>★★★★★ (5.0 - Exceptional)</option>
                    <option value={4}>★★★★☆ (4.0 - Great Guidance)</option>
                    <option value={3}>★★★☆☆ (3.0 - Helpful)</option>
                    <option value={2}>★★☆☆☆ (2.0 - Fair)</option>
                    <option value={1}>★☆☆☆☆ (1.0 - Needs Improvement)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Review Headline</label>
                  <input
                    type="text"
                    value={reviewForm.review_title}
                    onChange={(e) => setReviewForm((f) => ({ ...f, review_title: e.target.value }))}
                    className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-xs text-text focus:outline-none"
                    placeholder="e.g. Invaluable architectural advice..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Detailed Feedback</label>
                  <textarea
                    rows={3}
                    value={reviewForm.review_text}
                    onChange={(e) => setReviewForm((f) => ({ ...f, review_text: e.target.value }))}
                    required
                    className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-xs text-text focus:outline-none"
                    placeholder="Share specific insights that were beneficial..."
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setReviewBooking(null)}
                    className="rounded-[8px] border border-border bg-surface px-4 py-2 text-xs font-medium text-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="rounded-[8px] bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
                  >
                    {submittingReview ? 'Submitting...' : 'Submit Review'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

