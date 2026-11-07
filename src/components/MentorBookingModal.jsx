/**
 * Collivra Mentor Booking Modal Component
 * Facilitates package selection, session scheduling, and secure payment checkout.
 */

import { useState } from 'react'
import {
  createBookingRequest,
  getBookingsForStudent,
} from '../lib/mentorBookingService.js'
import {
  createMentorPaymentOrder,
  captureAndVerifyMentorPayment,
} from '../lib/mentorPaymentService.js'
import { useAuth } from '../hooks/useAuth.js'

export default function MentorBookingModal({
  mentor,
  project,
  packages = [],
  isOpen,
  onClose,
  onBookingSuccess,
}) {
  const { user } = useAuth()

  const activePackages = packages.filter((p) => p.is_active)
  const defaultPackage = activePackages[0] || null

  const [selectedPackageId, setSelectedPackageId] = useState(defaultPackage?.id || '')
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date(Date.now() + 86400000 * 3) // 3 days from now
    d.setHours(15, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [studentNotes, setStudentNotes] = useState('')
  const [step, setStep] = useState('configure') // 'configure' | 'checkout' | 'confirmed'
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [bookingResult, setBookingResult] = useState(null)

  if (!isOpen || !mentor) return null

  const selectedPkg = activePackages.find((p) => p.id === selectedPackageId) || defaultPackage

  async function handleProceedToCheckout(e) {
    e?.preventDefault()
    if (!user) {
      setError('Please sign in as a student to book a mentor.')
      return
    }
    if (!selectedPkg) {
      setError('Please select an active mentorship package.')
      return
    }
    setError('')
    setStep('checkout')
  }

  async function handleCompleteBookingAndPayment() {
    setProcessing(true)
    setError('')
    try {
      // 1. Create booking request in pending_payment state
      const booking = await createBookingRequest({
        studentId: user.id,
        mentorId: mentor.id || mentor.mentor_id,
        packageId: selectedPkg.id,
        projectId: project?.id || null,
        sessionScheduledAt: new Date(scheduledDate).toISOString(),
        studentNotes,
      })

      // 2. Create server-side order
      const order = await createMentorPaymentOrder(booking.id)

      // 3. Capture & verify payment (simulated safely in dev mode; PayPal API in prod)
      const captureResult = await captureAndVerifyMentorPayment(booking.id, order.orderId)

      setBookingResult(captureResult.booking)
      setStep('confirmed')
      if (onBookingSuccess) onBookingSuccess(captureResult.booking)
    } catch (err) {
      setError(err?.message || 'Payment or booking processing failed.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Mentorship Booking
            </span>
            <h3 className="text-lg font-bold text-text">
              Book Session with {mentor.full_name}
            </h3>
            <p className="text-xs text-muted">
              {mentor.primary_category === 'college_professor'
                ? `${mentor.academic_designation || 'Faculty'} · ${mentor.institution_name || 'Academic Institution'}`
                : `${mentor.company_role || 'Industry Specialist'} · ${mentor.company_name || 'Technology Enterprise'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-text"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
            {error}
          </div>
        )}

        {/* STEP 1: CONFIGURE PACKAGE & TIME */}
        {step === 'configure' && (
          <form onSubmit={handleProceedToCheckout} className="space-y-4">
            {/* Package Selection */}
            <div>
              <label className="block text-xs font-semibold text-text mb-2">
                1. Select Mentorship Offering Tier
              </label>
              {activePackages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
                  This mentor has not yet published active packages. Please check back soon or send an inquiry.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {activePackages.map((pkg) => {
                    const isSelected = (selectedPkg?.id || defaultPackage?.id) === pkg.id
                    return (
                      <div
                        key={pkg.id}
                        onClick={() => setSelectedPackageId(pkg.id)}
                        className={`cursor-pointer rounded-xl border p-3.5 transition ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border bg-surface2/30 hover:bg-surface2'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-primary">
                            {pkg.tier} Tier · {pkg.name}
                          </span>
                          <span className="text-sm font-bold text-text">
                            ${pkg.price_usd}
                            <span className="text-xs font-normal text-muted">/{pkg.billing_interval}</span>
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-textSecondary">{pkg.description}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted">
                          <span>📅 {pkg.sessions_count} session(s)</span>
                          <span>⏳ {pkg.duration_weeks} wks</span>
                          {pkg.code_review && <span>💻 Code Review</span>}
                          {pkg.chat_support && <span>💬 Chat Support</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Session Scheduled Time */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                2. Requested Date & Time
              </label>
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
                className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-xs text-text focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-muted">
                Mentor availability will be verified upon booking submission.
              </p>
            </div>

            {/* Student Project Notes */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                3. Session Objectives & Notes
              </label>
              <textarea
                rows={3}
                value={studentNotes}
                onChange={(e) => setStudentNotes(e.target.value)}
                placeholder="Briefly state what you hope to achieve in this session (e.g., algorithm review, thesis chapter critique, deployment hurdles)..."
                className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-xs text-text placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[8px] border border-border bg-surface px-4 py-2 text-xs font-semibold text-text hover:bg-surface2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedPkg}
                className="rounded-[8px] bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primaryHover disabled:opacity-50"
              >
                Proceed to Checkout →
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: CHECKOUT & PAYMENT VERIFICATION */}
        {step === 'checkout' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface2/30 p-4 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                Order Summary
              </h4>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-text">{selectedPkg?.name}</span>
                <span className="font-bold text-text">${selectedPkg?.price_usd}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Mentor:</span>
                <span className="text-text">{mentor.full_name}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Requested Session:</span>
                <span className="text-text">{new Date(scheduledDate).toLocaleString()}</span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-bold text-text">
                <span>Total Due:</span>
                <span className="text-primary">${selectedPkg?.price_usd} USD</span>
              </div>
            </div>

            {/* Local dev mode transparency banner */}
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-warning">
                <span>🛡️</span>
                <span>Secure Server-Side Payment Verification</span>
              </div>
              <p className="text-[11px] text-textSecondary">
                Collivra captures and verifies payments server-side before activating your booking. In Local Development Mode, transactions are simulated safely without credit card or financial changes.
              </p>
            </div>

            <div className="flex justify-between items-center gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setStep('configure')}
                disabled={processing}
                className="rounded-[8px] border border-border bg-surface px-4 py-2 text-xs font-semibold text-text hover:bg-surface2"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleCompleteBookingAndPayment}
                disabled={processing}
                className="rounded-[8px] bg-accent px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {processing ? 'Verifying Payment...' : `Confirm & Pay $${selectedPkg?.price_usd} via PayPal`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CONFIRMED */}
        {step === 'confirmed' && (
          <div className="py-4 text-center space-y-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-2xl text-accent">
              ✓
            </span>
            <h4 className="text-base font-bold text-text">
              Booking Request Submitted & Payment Verified!
            </h4>
            <p className="text-xs text-textSecondary max-w-sm mx-auto">
              Your payment has been securely verified. The request has been delivered to <strong>{mentor.full_name}</strong>. You will be notified once the session time is confirmed.
            </p>
            <div className="pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[8px] bg-primary px-6 py-2 text-xs font-semibold text-white hover:bg-primaryHover"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

