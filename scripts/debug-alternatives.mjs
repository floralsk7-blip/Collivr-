// Debug script: reproduce the 3 candidate / team-size-2 scenario and trace
// exactly why generateAlternativeTeams may return fewer than 3 alternatives.
// Run: node --experimental-strip-types scripts/debug-alternatives.mjs

import { generateAlternativeTeams, prepareStudent, scoreTeam } from
  '../supabase/functions/_shared/teamOptimizer.ts'

// Three candidates mirroring the reported scenario (Sheetal 41%, Chenam 34%, Aarav 33%)
// Give each a realistic profile that passes the skills filter (skills.size > 0 after prepareStudent)
const students = [
  {
    id: 'sheetal-id',
    name: 'Sheetal Kumari',
    skills: ['Python', 'Data Analysis'],
    skills_detailed: [
      { name: 'Python', level: 'intermediate' },
      { name: 'Data Analysis', level: 'beginner' },
    ],
    experience: 'intermediate',
    project_interests: ['Machine Learning', 'Data Science'],
    availability_hours: '10 hrs/week',
    branch: 'Computer Science',
    department: null,
  },
  {
    id: 'chenam-id',
    name: 'Chenam Patel',
    skills: ['React', 'JavaScript'],
    skills_detailed: [
      { name: 'React', level: 'intermediate' },
      { name: 'JavaScript', level: 'intermediate' },
    ],
    experience: 'beginner',
    project_interests: ['Web Development'],
    availability_hours: '8 hrs/week',
    branch: 'Information Technology',
    department: null,
  },
  {
    id: 'aarav-id',
    name: 'Aarav Sharma',
    skills: ['Node.js', 'MongoDB'],
    skills_detailed: [
      { name: 'Node.js', level: 'beginner' },
      { name: 'MongoDB', level: 'beginner' },
    ],
    experience: 'beginner',
    project_interests: ['Backend Development'],
    availability_hours: '6 hrs/week',
    branch: 'Electronics',
    department: null,
  },
]

const spec = {
  domain: 'Web Application',
  skillsFocus: ['React', 'Python', 'Node.js'],
  teamSize: 2,
}

console.log('=== Diagnostic: 3 candidates, team size 2 ===\n')

// Step 1: Check what prepareStudent produces (skills.size)
console.log('--- Step 1: prepareStudent output (skills.size per candidate) ---')
for (const s of students) {
  const p = prepareStudent(s, spec)
  console.log(`  ${s.name}: skills.size=${p.skills.size}, strength=${p.strength.toFixed(3)}, hours=${p.hours}`)
  for (const [key, val] of p.skills) {
    process.stdout.write(`    key="${key}" level=${val.level} label="${val.label}"\n`)
  }
}

// Step 2: Run all C(3,2) = 3 combinations manually and score each
console.log('\n--- Step 2: All C(3,2)=3 combinations scored ---')
const prepared = students.map(s => prepareStudent(s, spec))
const combos = [
  [prepared[0], prepared[1]],  // Sheetal + Chenam
  [prepared[0], prepared[2]],  // Sheetal + Aarav
  [prepared[1], prepared[2]],  // Chenam + Aarav
]
const comboLabels = ['Sheetal+Chenam', 'Sheetal+Aarav', 'Chenam+Aarav']
for (let i = 0; i < combos.length; i++) {
  const result = scoreTeam(combos[i], spec)
  console.log(`  ${comboLabels[i]}: total=${result.total.toFixed(1)} breakdown=${JSON.stringify(result.breakdown)} missing=${JSON.stringify(result.missingSkills)}`)
}

// Step 3: Run generateAlternativeTeams and see what it actually returns
console.log('\n--- Step 3: generateAlternativeTeams output ---')
const alts = generateAlternativeTeams(students, spec, { maxAlternatives: 3 })
console.log(`  Generated ${alts.length} alternative(s):`)
for (const alt of alts) {
  console.log(`  ${alt.label} [${alt.badge}]: score=${alt.score} members=${JSON.stringify(alt.memberIds)} missing=${JSON.stringify(alt.missingSkills)}`)
}

// Step 4: Trace the pool filter
console.log('\n--- Step 4: Pool filter (skills.size > 0) ---')
const pool = prepared.filter(p => p.skills.size > 0)
console.log(`  pool.length=${pool.length}, targetSize=${spec.teamSize}`)
console.log(`  pool.length === targetSize? ${pool.length === spec.teamSize}`)
console.log(`  pool.length > targetSize? ${pool.length > spec.teamSize}`)

console.log('\n=== Diagnostic complete ===')
