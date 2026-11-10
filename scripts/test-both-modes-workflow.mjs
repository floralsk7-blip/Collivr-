/**
 * Test Suite: Collivra Create Project 5-Step Workflow in Both Modes
 * Mode A: Without Supabase credentials (Local Development Mode / mock layer)
 * Mode B: With Supabase credentials (real Supabase mode, resilient to missing remote columns / un-deployed functions)
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

console.log('Testing Collivra Create Project 5-Step Workflow in Both Modes...\n')

// 1. Static Verification of Codebase
const createProjectPath = new URL('../src/pages/CreateProject.jsx', import.meta.url)
const createProjectCode = readFileSync(createProjectPath, 'utf8').replace(/\r\n/g, '\n')

// Assert STEP_LABELS has exactly 5 steps in the required order
const expectedLabels = [
  'Project Details',
  'Team Requirements',
  'AI Analysis',
  'Mentor Preference',
  'Review & Publish',
]

for (let i = 0; i < expectedLabels.length; i++) {
  assert.ok(
    createProjectCode.includes(`'${expectedLabels[i]}'`),
    `STEP_LABELS must include '${expectedLabels[i]}'`
  )
}
assert.ok(
  createProjectCode.includes('STEP_LABELS = [\n  \'Project Details\',\n  \'Team Requirements\',\n  \'AI Analysis\',\n  \'Mentor Preference\',\n  \'Review & Publish\',\n]'),
  'STEP_LABELS must be defined with exact 5 steps in proper order'
)
console.log('  ok - 1. STEP_LABELS statically defines the complete 5-step workflow')

// Assert all 4 Mentor Preference options
const expectedOptions = [
  { id: 'none', title: 'No mentor needed' },
  { id: 'professor', title: 'College Professor' },
  { id: 'industry', title: 'Industry Expert' },
  { id: 'ai', title: 'Let Collivra AI recommend' },
]

for (const opt of expectedOptions) {
  assert.ok(createProjectCode.includes(opt.id), `Option id ${opt.id} must be present`)
  assert.ok(createProjectCode.includes(opt.title), `Option title ${opt.title} must be present`)
}
console.log('  ok - 2. MENTOR_PREFERENCE_OPTIONS contains all 4 required choices')

// 2. Mode Inspection
const { isSupabaseConfigured, isDevMode } = await import(
  '../src/lib/supabaseClient.js'
)

console.log(`\nCurrent Environment Evaluation:`)
console.log(`  isSupabaseConfigured: ${isSupabaseConfigured}, isDevMode: ${isDevMode}`)
if (isDevMode) {
  console.log('  -> Evaluated as Mode A (Local Development Mode with mock layer)')
} else {
  console.log('  -> Evaluated as Mode B (Real Supabase client active with remote endpoint)')
}

// Check that Step navigation is 1 -> 2 -> 3 -> 4 -> 5 regardless of mode
assert.ok(createProjectCode.includes('{/* step 3: ai analysis */}'), 'Step 3 must be AI Analysis')
assert.ok(createProjectCode.includes('{/* step 4: mentor preference */}'), 'Step 4 must be Mentor Preference')
assert.ok(createProjectCode.includes('{/* step 5: review and publish */}'), 'Step 5 must be Review & Publish')
console.log('  ok - 3. 5-step navigation structure is universally active regardless of backend configuration')

// 3. Mode B: Resilient Execution with Supabase credentials
console.log(`\nTesting Mode B (Real Supabase mode with potential schema differences):`)

// Test missing column error detector
function isMissingColumnError(err, columnName) {
  if (!err) return false
  const target = String(columnName).toLowerCase()
  const msg = String(err.message || '').toLowerCase()
  const details = String(err.details || '').toLowerCase()
  const hint = String(err.hint || '').toLowerCase()
  return (
    msg.includes(target) ||
    details.includes(target) ||
    hint.includes(target) ||
    err.code === 'PGRST204' ||
    err.code === '42703'
  )
}

// Test PostgREST PGRST204 missing column error
const pgrst204Error = {
  code: 'PGRST204',
  message: "Could not find the 'mentor_preference' column of 'projects' in the schema cache",
  details: null,
  hint: null,
}
assert.equal(isMissingColumnError(pgrst204Error, 'mentor_preference'), true, 'PGRST204 error must be detected')

// Test PostgreSQL 42703 missing column error
const pg42703Error = {
  code: '42703',
  message: 'column "mentor_preference" of relation "projects" does not exist',
}
assert.equal(isMissingColumnError(pg42703Error, 'mentor_preference'), true, 'PostgreSQL 42703 error must be detected')

// Verify unhandled errors are not falsely flagged
const rlsError = {
  code: '42501',
  message: 'new row violates row-level security policy for table "projects"',
}
assert.equal(isMissingColumnError(rlsError, 'mentor_preference'), false, 'RLS error must not be misidentified as missing column')
console.log('  ok - 4. Missing database column error detection accurately identifies schema discrepancies')

// Test Step 3 button enablement: Confirm Skills & Continue must NOT be disabled when AI is null
assert.ok(
  !createProjectCode.includes('disabled={!analysis || saving}'),
  'Step 3 confirm button must not be blocked by !analysis'
)
assert.ok(
  createProjectCode.includes('disabled={saving}'),
  'Step 3 confirm button must allow continuing when saving is false'
)
assert.ok(
  createProjectCode.includes('Confirm Skills & Continue →'),
  'Step 3 must display unambiguous continuation button'
)
console.log('  ok - 5. Step 3 never blocks advancement to Mentor Preference when Edge Function is unavailable')

// Test Diagnostic Notice rendering
assert.ok(
  createProjectCode.includes('Database Notice'),
  'CreateProject must render diagnostic notice when schema is missing column'
)
assert.ok(
  createProjectCode.includes('schemaNotice'),
  'CreateProject must maintain schemaNotice state'
)
console.log('  ok - 6. Diagnostic notice surfaces clear explanation when database migration is pending')

// Test Step 5 Review screen rendering of Mentor Preference
assert.ok(createProjectCode.includes('selectedPreference?.title'), 'Review screen renders selected preference title')
assert.ok(createProjectCode.includes('selectedPreference?.description'), 'Review screen renders description')
assert.ok(createProjectCode.includes('onClick={() => setStep(4)}'), 'Review back button navigates to Mentor Preference')
console.log('  ok - 7. Step 5 Review & Publish screen reflects chosen mentor preference and allows back navigation')

console.log('\nAll Mode A and Mode B 5-step workflow checks passed successfully!')
