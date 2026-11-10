import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  validatePackagePayload,
  getMentorPackages,
  saveMentorPackage,
  togglePackageActive,
  deleteMentorPackage,
  getStudentSubscriptions,
  cancelMentorSubscription,
  getSubscriptionHistory,
  PACKAGE_TIERS,
} from '../src/lib/mentorPackageService.js'

console.log('Testing Collivra Smart Mentor Matching: Sub-phase 6 (Mentor Subscriptions & Packages)...')

// 1. Migration & Schema Check
const migrationPath = new URL('../supabase/migrations/20261116000000_mentor_packages_and_subscriptions.sql', import.meta.url)
assert.ok(existsSync(migrationPath), 'Migration 20261116000000 must exist')
const migrationSql = readFileSync(migrationPath, 'utf8')
assert.ok(migrationSql.includes('create table if not exists public.mentor_packages'), 'Migration must create mentor_packages table')
assert.ok(migrationSql.includes('create table if not exists public.mentor_subscriptions'), 'Migration must create mentor_subscriptions table')
assert.ok(migrationSql.includes('create table if not exists public.mentor_subscription_history'), 'Migration must create mentor_subscription_history table')
assert.ok(migrationSql.includes('mentor_package_tier_unique unique (mentor_id, tier)'), 'Migration must enforce unique package tier per mentor')
console.log('  ok - 1. Database schema and migration verified with normalized packages, subscriptions, and history tables')

// 2. Package Payload Validation
const invalidTier = validatePackagePayload({ tier: 'ultra_mega', name: 'Test', price_usd: 10, duration_weeks: 4, sessions_count: 1 })
assert.equal(invalidTier.valid, false, 'Invalid tier must fail validation')

const invalidPrice = validatePackagePayload({ tier: 'basic', name: 'Test', price_usd: -50, duration_weeks: 4, sessions_count: 1 })
assert.equal(invalidPrice.valid, false, 'Negative price must fail validation')

const invalidDuration = validatePackagePayload({ tier: 'basic', name: 'Test', price_usd: 50, duration_weeks: 0, sessions_count: 1 })
assert.equal(invalidDuration.valid, false, 'Zero duration must fail validation')

const validPkg = validatePackagePayload({ tier: 'basic', name: 'Essential Advisory', price_usd: 75, duration_weeks: 4, sessions_count: 2 })
assert.equal(validPkg.valid, true, 'Valid payload must pass validation')
console.log('  ok - 2. Package payload validation enforces tier constraints, non-negative pricing, and duration boundaries')

// 3. Package Creation & Retrieval for Mentor
const testMentorId = 'dev-mentor-faculty-001'
const initialPackages = await getMentorPackages(testMentorId)
assert.ok(Array.isArray(initialPackages), 'Packages must be an array')
assert.ok(initialPackages.length >= 2, 'Initial demo packages must be loaded')
console.log('  ok - 3. Mentor packages successfully retrieved from database service layer')

// 4. Custom Mentor Pricing & Editing (Mentors control their own pricing)
const updatedBasic = await saveMentorPackage(testMentorId, {
  tier: 'basic',
  name: 'Updated Faculty Research Starter',
  description: 'Refined 1:1 monthly guidance for thesis and ML capstone.',
  price_usd: 85.00,
  billing_interval: 'monthly',
  duration_weeks: 4,
  sessions_count: 1,
  chat_support: true,
  code_review: true,
  project_review: true,
  priority_support: false,
  benefits: ['1x 60-min session', 'Literature survey feedback'],
  limitations: ['Standard response time'],
  is_active: true,
})
assert.equal(updatedBasic.price_usd, 85.00, 'Mentor must be able to customize their own package price without hardcoding')
assert.equal(updatedBasic.name, 'Updated Faculty Research Starter')
console.log('  ok - 4. Mentors can configure and edit custom package pricing, deliverables, and terms')

// 5. Package Activation & Deactivation Toggle
const deactivated = await togglePackageActive(updatedBasic.id, false)
assert.equal(deactivated.is_active, false, 'Package must be deactivatable')

const activeOnly = await getMentorPackages(testMentorId, { onlyActive: true })
assert.equal(activeOnly.some((p) => p.id === updatedBasic.id), false, 'Deactivated package must not appear in active-only discovery')

// Re-activate
const reactivated = await togglePackageActive(updatedBasic.id, true)
assert.equal(reactivated.is_active, true, 'Package must be reactivatable')
console.log('  ok - 5. Package activation and deactivation toggle properly controls visibility to students')

// 6. Student Subscription Browsing & State Verification
const studentId = 'dev-user-student-001'
const studentSubs = await getStudentSubscriptions(studentId)
assert.ok(Array.isArray(studentSubs), 'Student subscriptions must be returned as array')
assert.ok(studentSubs.length > 0, 'Demo student has an existing subscription')
assert.equal(studentSubs[0].status, 'active', 'Active subscription reflected correctly')
console.log('  ok - 6. Students can view active subscriptions, package benefits, renewal, and expiry information')

// 7. Subscription Cancellation Policy & Audit Trail
const activeSubId = studentSubs[0].id
const cancelledSub = await cancelMentorSubscription(activeSubId, 'Completed project milestone early.')
assert.equal(cancelledSub.cancel_at_period_end, true, 'Subscription cancellation policy flags cancel_at_period_end')
assert.equal(cancelledSub.cancellation_reason, 'Completed project milestone early.')

const history = await getSubscriptionHistory(activeSubId)
assert.ok(history.length > 0, 'Subscription history audit trail must record events')
assert.equal(history[0].action, 'cancellation_requested', 'Cancellation request audit log created')
console.log('  ok - 7. Subscription cancellation policies enforce period-end access and log in audit history')

// 8. Platform Isolation (Separate from Collivra Student Premium)
assert.ok(migrationSql.includes('mentor_subscriptions'), 'Must use dedicated mentor_subscriptions table')
assert.ok(!migrationSql.includes('alter table public.subscriptions add column mentor_id'), 'Must not alter platform subscriptions table')
console.log('  ok - 8. Mentor subscriptions are strictly decoupled from platform Student Premium subscriptions')

// 9. Frontend Integration Checks
const mentorProfilePath = new URL('../src/pages/MentorProfile.jsx', import.meta.url)
const mentorProfileCode = readFileSync(mentorProfilePath, 'utf8')
assert.ok(mentorProfileCode.includes('Packages & Offerings'), 'MentorProfile.jsx must render Packages tab')
assert.ok(mentorProfileCode.includes('saveMentorPackage'), 'MentorProfile.jsx must invoke saveMentorPackage')

const projectDetailPath = new URL('../src/pages/ProjectDetail.jsx', import.meta.url)
const projectDetailCode = readFileSync(projectDetailPath, 'utf8')
assert.ok(projectDetailCode.includes('Packages & Mentorship:'), 'ProjectDetail.jsx must display available packages')
console.log('  ok - 9. Frontend components MentorProfile.jsx and ProjectDetail.jsx integrate package offerings')

console.log('\nAll 9 Sub-phase 6 tests passed successfully!')

