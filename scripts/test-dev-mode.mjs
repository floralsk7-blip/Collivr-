import assert from 'node:assert/strict'
import { createMockSupabaseClient } from '../src/lib/mockSupabaseClient.js'

console.log('Testing Collivra Safe Local Development Mode (Mock Supabase Service Layer)...')

const mock = createMockSupabaseClient()
assert.ok(mock.isMock, 'Client must identify as mock service layer')

// 1. Auth getSession & getUser
const { data: sessionData, error: sessionErr } = await mock.auth.getSession()
assert.equal(sessionErr, null, 'getSession must not error')
assert.ok(sessionData?.session?.user, 'getSession must provide dev user session')
assert.equal(sessionData.session.user.user_metadata.account_type, 'student')
console.log('  ok - auth.getSession() resolves cleanly with dev session')

// 2. Auth signInWithPassword
const { data: signInData, error: signInErr } = await mock.auth.signInWithPassword({
  email: 'organiser.dev@collivra.local',
  password: 'any-password',
})
assert.equal(signInErr, null)
assert.equal(signInData.user.user_metadata.account_type, 'organiser')
console.log('  ok - auth.signInWithPassword() supports account type differentiation')

// 3. Querying student_profiles
const { data: profiles, error: profilesErr } = await mock.from('student_profiles').select('*')
assert.equal(profilesErr, null)
assert.ok(Array.isArray(profiles) && profiles.length >= 2, 'Must contain sample student and mentor profiles')
const faculty = profiles.find((p) => p.is_mentor && p.name.includes('Marcus Vance'))
assert.ok(faculty, 'Sample faculty mentor must exist in mock data')
console.log('  ok - from("student_profiles").select() returns mock profiles')

// 4. Querying projects with filter
const { data: proj, error: projErr } = await mock
  .from('projects')
  .select('*')
  .eq('domain', 'AI/ML')
  .maybeSingle()
assert.equal(projErr, null)
assert.ok(proj?.name, 'Must return sample project')
console.log('  ok - from("projects").select().eq().maybeSingle() executes properly')

// 5. Inserting into projects
const newProj = {
  name: 'Unit Test Project',
  description: 'Testing project creation in dev mode without Supabase',
  domain: 'FinTech',
  mentor_preference: 'professor',
}
const { data: createdProj, error: insertErr } = await mock.from('projects').insert(newProj)
assert.equal(insertErr, null)
assert.equal(createdProj.name, 'Unit Test Project')
assert.equal(createdProj.mentor_preference, 'professor')
assert.ok(createdProj.id, 'Must generate id for inserted project')
console.log('  ok - from("projects").insert() safely persists to in-memory store')

// 6. Functions invoke
const { data: aiRes, error: aiErr } = await mock.functions.invoke('analyze-project', {
  body: { skills_required: ['React', 'Python'] },
})
assert.equal(aiErr, null)
assert.ok(aiRes.required_skills.includes('React'))
assert.ok(aiRes.recommended_mentor_type)
console.log('  ok - functions.invoke("analyze-project") returns realistic mock analysis')

const { data: mentorRes, error: mentorErr } = await mock.functions.invoke('mentorship-manage', {
  body: { action: 'list' },
})
assert.equal(mentorErr, null)
assert.ok(Array.isArray(mentorRes.mentors) && mentorRes.mentors.length >= 2)
console.log('  ok - functions.invoke("mentorship-manage") returns mock mentor list')

console.log('\nAll Local Development Mode tests passed successfully!')

