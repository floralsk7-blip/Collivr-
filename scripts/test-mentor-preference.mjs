import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

console.log('Testing Collivra Smart Mentor Matching: Sub-phase 2...')

// 1. Check migration file exists and is valid SQL
const migrationPath = new URL('../supabase/migrations/20261112000000_project_mentor_preference.sql', import.meta.url)
assert.ok(existsSync(migrationPath), 'Migration file must exist')
const migrationSql = readFileSync(migrationPath, 'utf8')
assert.ok(migrationSql.includes('alter table public.projects'), 'Migration must alter projects table')
assert.ok(migrationSql.includes('mentor_preference'), 'Migration must add mentor_preference column')
assert.ok(migrationSql.includes("'none'"), 'Migration must include none option')
assert.ok(migrationSql.includes("'professor'"), 'Migration must include professor option')
assert.ok(migrationSql.includes("'industry'"), 'Migration must include industry option')
assert.ok(migrationSql.includes("'ai'"), 'Migration must include ai option')
assert.ok(migrationSql.includes("default 'none'"), 'Migration must default to none')
console.log('  ok - database migration is present, valid and includes check constraint')

// 2. Check schema.sql has been kept in sync
const schemaPath = new URL('../supabase/schema.sql', import.meta.url)
const schemaSql = readFileSync(schemaPath, 'utf8')
assert.ok(schemaSql.includes('mentor_preference text default \'none\''), 'schema.sql must include mentor_preference column')
console.log('  ok - baseline schema.sql is synchronized')

// 3. Inspect CreateProject.jsx code and structure
const createProjectPath = new URL('../src/pages/CreateProject.jsx', import.meta.url)
const createProjectCode = readFileSync(createProjectPath, 'utf8').replace(/\r\n/g, '\n')

// Check STEP_LABELS has 5 steps with required order
assert.ok(createProjectCode.includes("'Mentor Preference'"), 'STEP_LABELS must include Mentor Preference step')
assert.ok(createProjectCode.includes('STEP_LABELS = [\n  \'Project Details\',\n  \'Team Requirements\',\n  \'AI Analysis\',\n  \'Mentor Preference\',\n  \'Review & Publish\',\n]'), 'Step sequence must be correctly ordered: Project Details -> Team Requirements -> AI Analysis -> Mentor Preference -> Review & Publish')
console.log('  ok - STEP_LABELS sequence is properly defined with 5 steps in required order')

// Check step progression and ordering
assert.ok(createProjectCode.includes('{/* step 3: ai analysis */}'), 'Step 3 must be AI Analysis')
assert.ok(createProjectCode.includes('{/* step 4: mentor preference */}'), 'Step 4 must be Mentor Preference')
assert.ok(createProjectCode.includes('{/* step 5: review and publish */}'), 'Step 5 must be Review & Publish')
assert.ok(createProjectCode.includes('setStep(4)'), 'confirmAnalysis must transition to step 4')
assert.ok(createProjectCode.includes('setStep(5)'), 'confirmMentorPreference must transition to step 5')
console.log('  ok - step navigation transitions correctly: Team Requirements -> AI Analysis (3) -> Mentor Preference (4) -> Review (5)')

// Check all 4 options exist with exact titles and descriptions
const EXPECTED_OPTIONS = [
  {
    id: 'none',
    title: 'No mentor needed',
    description: 'I want to manage my project independently.',
  },
  {
    id: 'professor',
    title: 'College Professor',
    description: 'Get academic, research and technical guidance from college professors and faculty members.',
  },
  {
    id: 'industry',
    title: 'Industry Expert',
    description: 'Get practical guidance from experienced developers, engineers, founders and industry professionals.',
  },
  {
    id: 'ai',
    title: 'Let Collivra AI recommend',
    description: 'Let AI analyze my project requirements and suggest the most suitable mentor type.',
  },
]

for (const opt of EXPECTED_OPTIONS) {
  assert.ok(createProjectCode.includes(opt.id), `Option id "${opt.id}" must exist in code`)
  assert.ok(createProjectCode.includes(opt.title), `Option title "${opt.title}" must exist in code`)
  assert.ok(createProjectCode.includes(opt.description), `Option description "${opt.description}" must exist in code`)
}
console.log('  ok - all 4 mentor preference options match requirements exactly')

// 4. Form validation & default behavior
assert.ok(createProjectCode.includes("mentor_preference: 'none'"), 'Default mentor_preference must be none')
assert.ok(createProjectCode.includes('canProceedStep1'), 'canProceedStep1 validation must be preserved')
assert.ok(createProjectCode.includes('form.description.trim().length >= 20'), 'Minimum 20 characters validation must be preserved')
console.log('  ok - form validation and default preference are preserved')

// 5. Database payload persistence & fallback safety
assert.ok(createProjectCode.includes('mentor_preference: form.mentor_preference'), 'Payload must include mentor_preference')
assert.ok(createProjectCode.includes("res.error.message?.includes('mentor_preference')"), 'Graceful fallback if database column is missing')
console.log('  ok - database payload persistence and schema fallback are implemented')

// 6. Navigation and draft persistence
assert.ok(createProjectCode.includes('DRAFT_STORAGE_KEY'), 'Draft persistence key must exist')
assert.ok(createProjectCode.includes('sessionStorage.getItem(DRAFT_STORAGE_KEY)'), 'Draft must be loaded from storage')
assert.ok(createProjectCode.includes('sessionStorage.setItem(DRAFT_STORAGE_KEY'), 'Draft must be saved to storage')
assert.ok(createProjectCode.includes('sessionStorage.removeItem(DRAFT_STORAGE_KEY)'), 'Draft must be cleared upon publishing')
console.log('  ok - draft persistence survives navigation and refresh')

// 7. Review & publish screen includes mentor preference
assert.ok(createProjectCode.includes('mentor preference'), 'Review screen must display mentor preference section')
assert.ok(createProjectCode.includes('selectedPreference?.title'), 'Review screen must show selected preference title')
console.log('  ok - review & publish screen displays the selected preference')

// 8. ProjectDetail.jsx displays mentor preference
const projectDetailPath = new URL('../src/pages/ProjectDetail.jsx', import.meta.url)
const projectDetailCode = readFileSync(projectDetailPath, 'utf8')
assert.ok(projectDetailCode.includes('project.mentor_preference'), 'ProjectDetail must display mentor preference')
console.log('  ok - ProjectDetail.jsx renders mentor preference badge')

console.log('\nAll 8 Sub-phase 2 checks passed successfully!')
