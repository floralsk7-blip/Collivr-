import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
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
} from '../src/lib/mentorProfileService.js'

console.log('Testing Collivra Smart Mentor Matching: Sub-phase 4 (Mentor Profiles & Architecture)...')

// 1. Migration file and Schema Synchronization
const migrationPath = new URL('../supabase/migrations/20261114000000_mentor_profiles.sql', import.meta.url)
assert.ok(existsSync(migrationPath), 'Migration 20261114000000_mentor_profiles.sql must exist')
const migrationSql = readFileSync(migrationPath, 'utf8')

const REQUIRED_TABLES = [
  'mentor_profiles',
  'mentor_expertise',
  'mentor_qualifications',
  'mentor_portfolio',
  'mentor_availability',
  'mentor_verification_documents',
]

for (const table of REQUIRED_TABLES) {
  assert.ok(migrationSql.includes(`create table if not exists public.${table}`), `Migration must create table public.${table}`)
}

const schemaPath = new URL('../supabase/schema.sql', import.meta.url)
const schemaSql = readFileSync(schemaPath, 'utf8')
for (const table of REQUIRED_TABLES) {
  assert.ok(schemaSql.includes(`create table if not exists ${table}`), `schema.sql must include table ${table}`)
}
console.log('  ok - 1. Migration and schema.sql define all 6 normalized tables')

// 2. RLS Policies and Verification Protection Trigger in Migration
assert.ok(migrationSql.includes('alter table public.mentor_profiles enable row level security'), 'RLS must be enabled on mentor_profiles')
assert.ok(migrationSql.includes('alter table public.mentor_verification_documents enable row level security'), 'RLS must be enabled on mentor_verification_documents')
assert.ok(migrationSql.includes('create trigger tr_protect_mentor_verification_status'), 'Trigger tr_protect_mentor_verification_status must be defined')
assert.ok(migrationSql.includes('Mentors can view own verification documents'), 'Verification documents must be restricted to owner')
assert.ok(!migrationSql.includes('create policy "Public can view verification documents"'), 'Verification documents must NEVER have a public view policy')
console.log('  ok - 2. Security triggers and restrictive RLS policies verified')

// 3. Local Development Mode Profile Fetching
const testUserId = 'dev-user-faculty-001'
const facultyData = await getMentorProfile(testUserId)
assert.ok(facultyData, 'getMentorProfile must return data for seeded faculty mentor')
assert.equal(facultyData.profile.primary_category, 'college_professor', 'Primary category must be college_professor')
assert.equal(facultyData.profile.verification_status, 'verified', 'Faculty profile should be verified')
assert.ok(facultyData.expertise, 'Expertise must be loaded')
assert.ok(facultyData.expertise.technical_skills.includes('PyTorch'), 'Expertise must include PyTorch')
assert.ok(facultyData.availability, 'Availability must be loaded')
assert.equal(facultyData.availability.is_available, true, 'Availability status should be true')
console.log('  ok - 3. Local development mode fetches full normalized mentor profile')

// 4. Mentor Profile Creation
const newUserId = `dev-test-user-${Date.now()}`
const createdProfile = await createMentorProfile({
  user_id: newUserId,
  full_name: 'Dr. Jane Holloway',
  headline: 'Associate Professor & Systems Researcher',
  bio: 'Specializing in distributed file systems, consensus protocols, and operating systems research.',
  location: 'Chicago, IL',
  contact_email: 'jholloway@uchicago.edu',
  primary_category: 'college_professor',
  categories: ['college_professor'],
  institution_name: 'University of Chicago',
  department: 'Computer Science',
  academic_designation: 'Associate Professor',
  years_of_experience: 9,
  technical_skills: ['C++', 'Rust', 'Distributed Systems', 'Linux Kernel'],
  domain_expertise: ['Operating Systems', 'Cloud Storage'],
})

assert.ok(createdProfile.id, 'Created profile must have UUID id')
assert.equal(createdProfile.user_id, newUserId, 'Profile must be linked to user_id')
assert.equal(createdProfile.verification_status, 'unverified', 'New mentor profile must strictly start as unverified')
assert.equal(createdProfile.years_of_experience, 9, 'Years of experience must match')
console.log('  ok - 4. Mentor profile creation enforces default unverified status and UUID assignment')

// 5. Mentor Profile Updates
const updatedProfile = await updateMentorProfile(createdProfile.id, {
  headline: 'Senior Research Faculty & Distributed Systems Lead',
  location: 'Remote & Chicago, IL',
})
assert.equal(updatedProfile.headline, 'Senior Research Faculty & Distributed Systems Lead', 'Headline must update')
assert.equal(updatedProfile.location, 'Remote & Chicago, IL', 'Location must update')
console.log('  ok - 5. Profile updates modify permitted fields successfully')

// 6. Category Validation (College Professor, Industry Expert, Both)
const VALID_CATEGORIES = ['college_professor', 'industry_expert', 'both']
for (const cat of VALID_CATEGORIES) {
  assert.ok(migrationSql.includes(`'${cat}'`), `Migration check constraint must include '${cat}'`)
}
console.log('  ok - 6. Category validation supports College Professor, Industry Expert, and Both')

// 7. Expertise Management
const updatedExp = await saveMentorExpertise(createdProfile.id, {
  technical_skills: ['C++', 'Rust', 'Distributed Consensus', 'Raft', 'Paxos'],
  domain_expertise: ['Distributed Systems', 'Cloud Storage', 'Operating Systems'],
  research_interests: ['Zero-copy Network Architectures', 'Fault-tolerant Protocols'],
  tech_stack: ['Linux', 'QEMU', 'Git', 'GDB'],
  mentorship_topics: ['Research Paper Writing', 'Systems Benchmarking', 'Doctoral Applications'],
})
assert.ok(updatedExp.technical_skills.includes('Raft'), 'Technical skills must include Raft')
assert.ok(updatedExp.mentorship_topics.includes('Research Paper Writing'), 'Mentorship topics must include Research Paper Writing')
console.log('  ok - 7. Expertise management supports skills, domains, research interests, and mentorship topics')

// 8. Availability Management
const updatedAvail = await saveMentorAvailability(createdProfile.id, {
  is_available: true,
  weekly_hours: 6,
  timezone: 'America/Chicago',
  preferred_days: ['Monday', 'Thursday'],
  preferred_time_slots: ['Evening (5 PM - 8 PM)'],
  max_active_mentees: 4,
})
assert.equal(updatedAvail.weekly_hours, 6, 'Weekly hours must update')
assert.equal(updatedAvail.timezone, 'America/Chicago', 'Timezone must update')
assert.equal(updatedAvail.max_active_mentees, 4, 'Max active mentees must update')
console.log('  ok - 8. Availability management correctly updates scheduling preferences and mentee limits')

// 9. Qualifications and Portfolio Projects
const qual = await addMentorQualification(createdProfile.id, {
  degree: 'Ph.D. in Computer Engineering',
  institution: 'University of Illinois Urbana-Champaign',
  field_of_study: 'Distributed Operating Systems',
  graduation_year: 2017,
  is_highest: true,
})
assert.ok(qual.id, 'Qualification must have id')
assert.equal(qual.degree, 'Ph.D. in Computer Engineering')

const port = await addMentorPortfolioProject(createdProfile.id, {
  title: 'RaftKV: High-Throughput Distributed Key-Value Store',
  description: 'Linearizable distributed store with dynamic snapshotting and fault tolerance under network partitions.',
  technologies: ['Rust', 'gRPC', 'Tokio'],
  project_url: 'https://github.com/collivra-demo/raftkv',
})
assert.ok(port.id, 'Portfolio project must have id')
assert.equal(port.title, 'RaftKV: High-Throughput Distributed Key-Value Store')

// Delete qualification and portfolio
await deleteMentorQualification(qual.id)
await deleteMentorPortfolioProject(port.id)
console.log('  ok - 9. Qualifications and portfolio project addition and removal succeed')

// 10. Verification Workflow (Submission -> Pending -> Admin Review -> Verified / Rejected)
const verificationResult = await submitMentorVerification(createdProfile.id, {
  document_type: 'faculty_id',
  document_name: 'UChicago CS Faculty Staff ID and Directory Proof',
  document_url: 'https://cs.uchicago.edu/faculty/jholloway',
  notes: 'Listed on Department of Computer Science faculty directory page.',
})
assert.ok(verificationResult.document.id, 'Verification document must be persisted')
assert.equal(verificationResult.document.status, 'pending', 'Document status must be pending')
assert.equal(verificationResult.profile.verification_status, 'pending', 'Mentor profile verification_status must transition to pending')
console.log('  ok - 10a. Verification submission moves status to pending with document record')

// Admin Review: Reject with Reason
const rejectedProfile = await reviewMentorVerification(createdProfile.id, {
  approved: false,
  rejectionReason: 'Faculty directory link must be an official university .edu domain.',
  reviewerId: 'dev-admin-system',
})
assert.equal(rejectedProfile.verification_status, 'rejected', 'Profile status must be rejected')
assert.ok(rejectedProfile.rejection_reason.includes('official university'), 'Rejection reason must be stored')
console.log('  ok - 10b. Admin rejection records detailed feedback for resubmission')

// Resubmission
const resubmission = await submitMentorVerification(createdProfile.id, {
  document_type: 'faculty_id',
  document_name: 'UChicago Official .EDU Directory Entry',
  document_url: 'https://cs.uchicago.edu/people/faculty/jholloway',
  notes: 'Updated official link.',
})
assert.equal(resubmission.profile.verification_status, 'pending', 'Resubmission moves status back to pending')

// Admin Review: Approve / Verify
const approvedProfile = await reviewMentorVerification(createdProfile.id, {
  approved: true,
  reviewerId: 'dev-admin-system',
})
assert.equal(approvedProfile.verification_status, 'verified', 'Profile must be verified')
assert.equal(approvedProfile.rejection_reason, null, 'Rejection reason must be cleared on approval')
assert.ok(approvedProfile.verified_at, 'verified_at must be populated')
console.log('  ok - 10c. Admin approval successfully transitions profile to verified with timestamp')

// 11. Unauthorized Direct Verification Tampering Protection
// An ordinary profile update cannot elevate verification_status directly
const directTamperAttempt = await updateMentorProfile(createdProfile.id, {
  verification_status: 'verified',
  verified_at: '2099-01-01',
})
// updateMentorProfile strips verification_status from user updates
assert.equal(directTamperAttempt.verification_status, undefined, 'Direct profile update must strip verification fields')
console.log('  ok - 11. Unauthorized client-side verification elevation is strictly blocked')

console.log('\nAll 11 Sub-phase 4 tests passed successfully!')

