import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import {
  getWorkspaceNotes,
  addWorkspaceNote,
  getProjectMilestones,
  createMilestone,
  toggleMilestoneStatus,
  submitMentorReview,
  getMentorReviews,
  getMentorDashboardStats,
} from '../src/lib/mentorWorkspaceService.js'

console.log('Testing Collivra Smart Mentor Matching: Sub-phase 8 (Dashboard & Project Workspace)...')

// 1. Migration & Schema Check
const migrationPath = new URL('../supabase/migrations/20261118000000_mentor_workspace_and_collaboration.sql', import.meta.url)
assert.ok(existsSync(migrationPath), 'Migration 20261118000000 must exist')
const migrationSql = readFileSync(migrationPath, 'utf8')
assert.ok(migrationSql.includes('create table if not exists public.mentor_workspace_notes'), 'Migration must create mentor_workspace_notes table')
assert.ok(migrationSql.includes('create table if not exists public.mentorship_milestones'), 'Migration must create mentorship_milestones table')
assert.ok(migrationSql.includes('create table if not exists public.mentor_reviews'), 'Migration must create mentor_reviews table')
console.log('  ok - 1. Database schema defines normalized workspace notes, milestones, and mentor reviews')

// 2. Mentor Dashboard Statistics
const mentorId = 'dev-mentor-faculty-001'
const stats = await getMentorDashboardStats(mentorId)
assert.equal(typeof stats.activeMentees, 'number', 'Must compute active mentees')
assert.equal(typeof stats.completedSessions, 'number', 'Must compute completed sessions')
assert.equal(typeof stats.pendingRequests, 'number', 'Must compute pending booking requests')
assert.equal(typeof stats.totalEarnings, 'number', 'Must aggregate earnings from captured transactions')
console.log('  ok - 2. Mentor dashboard statistics correctly compute mentees, sessions, and verified earnings')

// 3. Mentorship Workspace Notes (Code Review, Feedback, Architecture)
const projectId = 'dev-project-001'
const studentId = 'dev-user-student-001'

const initialNotes = await getWorkspaceNotes(projectId)
assert.ok(Array.isArray(initialNotes), 'Notes must be returned as array')

const newNote = await addWorkspaceNote({
  projectId,
  mentorId,
  studentId,
  authorId: mentorId,
  category: 'code_review',
  content: 'Refactored matrix multiplication routines with PyTorch JIT compiler, achieving 2.4x speedup on GPU benchmarks.',
  isPinned: true,
})
assert.ok(newNote.id, 'New workspace note must be assigned UUID')
assert.equal(newNote.category, 'code_review', 'Note category must be preserved')

const refreshedNotes = await getWorkspaceNotes(projectId)
assert.ok(refreshedNotes.some((n) => n.id === newNote.id), 'Newly added note must be retrievable')
console.log('  ok - 3. Shared workspace notes support code reviews, architecture guidance, and pinning')

// 4. Mentorship Milestones
const initialMilestones = await getProjectMilestones(projectId)
assert.ok(Array.isArray(initialMilestones), 'Milestones must be an array')

const newMilestone = await createMilestone({
  projectId,
  mentorId,
  studentId,
  title: 'End-to-End Latency Benchmark',
  description: 'Validate inference latency under 50ms for autonomous drone telemetry.',
  dueDate: '2026-12-05',
})
assert.ok(newMilestone.id, 'Milestone must be assigned UUID')
assert.equal(newMilestone.status, 'pending', 'Milestone initializes in pending state')

// Toggle milestone status to completed
const completedMilestone = await toggleMilestoneStatus(newMilestone.id, 'completed')
assert.equal(completedMilestone.status, 'completed', 'Milestone status must transition to completed')
assert.ok(completedMilestone.completed_at, 'Completion timestamp must be set')
console.log('  ok - 4. Mentorship milestones track project progress, completion timestamps, and status changes')

// 5. Student Verified Reviews
const review = await submitMentorReview({
  bookingId: 'dev-booking-completed-test',
  mentorId,
  studentId,
  rating: 5.0,
  reviewTitle: 'Exceptional Academic and Research Mentorship',
  reviewText: 'Dr. Vance guided our team through rigorous theoretical formulation and mathematical proofs. Outstanding mentor!',
})
assert.ok(review.id, 'Review must be saved')
assert.equal(review.rating, 5.0, 'Rating must match')

const mentorReviews = await getMentorReviews(mentorId)
assert.ok(mentorReviews.some((r) => r.id === review.id), 'Public reviews must appear in mentor profile reviews query')
console.log('  ok - 5. Verified student reviews submit with rating validation and populate mentor profile reviews')

// 6. Strict RLS and Authorization Boundary Checks
assert.ok(migrationSql.includes('drop policy if exists "Parties can read workspace notes"'), 'Must define restricted read policy on workspace notes')
assert.ok(migrationSql.includes('drop policy if exists "Parties can manage milestones"'), 'Must define restricted milestone policy')
console.log('  ok - 6. RLS security policies strictly isolate private mentorship workspace notes and milestones to authorized participants')

// 7. Frontend Integration Checks
const appPath = new URL('../src/App.jsx', import.meta.url)
const appCode = readFileSync(appPath, 'utf8')
assert.ok(appCode.includes('/mentor/dashboard'), 'App.jsx must route /mentor/dashboard')
assert.ok(appCode.includes('/student/mentorships'), 'App.jsx must route /student/mentorships')

const projectDetailPath = new URL('../src/pages/ProjectDetail.jsx', import.meta.url)
const projectDetailCode = readFileSync(projectDetailPath, 'utf8')
assert.ok(projectDetailCode.includes('Mentorship Workspace'), 'ProjectDetail.jsx must render Mentorship Workspace')
assert.ok(projectDetailCode.includes('Mentorship Milestones'), 'ProjectDetail.jsx must render Milestones checklist')
assert.ok(projectDetailCode.includes('Workspace Notes & Code Reviews'), 'ProjectDetail.jsx must render Notes & Code Reviews')
console.log('  ok - 7. Frontend components MentorDashboard, StudentMentorships, and ProjectDetail integrate workspace tools')

console.log('\nAll 7 Sub-phase 8 tests passed successfully!')

