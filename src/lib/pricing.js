// One-time Event Pass entitlements. These descriptions match implemented controls.
export const EVENT_PASS_TIERS = {
  standard: { key: 'standard', price: '9.00', label: 'Standard', description: 'Up to 3 stages, individual submissions and manual judging.' },
  advanced: { key: 'advanced', price: '19.00', label: 'Advanced', description: 'Up to 10 stages, team submissions and automatic score-threshold or top-N advancement.' },
  complex: { key: 'complex', price: '39.00', label: 'Complex', description: 'Unlimited stages, all Advanced features and weighted multi-criteria judging.' },
}

export const EVENT_PASS_FEATURES = [
  { label: 'Create event', values: ['Included', 'Included', 'Included'] },
  { label: 'Stages', values: ['Up to 3', 'Up to 10', 'Unlimited'] },
  { label: 'Individual forms, quizzes and file/link submissions', values: ['Included', 'Included', 'Included'] },
  { label: 'Team submissions', values: ['—', 'Included', 'Included'] },
  { label: 'Manual judging and advancement', values: ['Included', 'Included', 'Included'] },
  { label: 'Automatic advancement', values: ['—', 'Score threshold or top-N', 'Score threshold or top-N'] },
  { label: 'Weighted judging rubric', values: ['—', '—', 'Included'] },
]

export function quotePrice(complexity = 'standard') {
  return EVENT_PASS_TIERS[complexity] || EVENT_PASS_TIERS.standard
}

export const TIERS = Object.values(EVENT_PASS_TIERS)
