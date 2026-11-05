// The server is the authority for Event Pass prices. Participant count is not used.
export type EventPassTier = 'standard' | 'advanced' | 'complex'
export type Tier = { key: EventPassTier; price: string; label: string; description: string }

export const TIERS: Record<EventPassTier, Tier> = {
  standard: { key: 'standard', price: '9.00', label: 'Standard', description: 'Up to 3 stages, individual submissions and manual judging.' },
  advanced: { key: 'advanced', price: '19.00', label: 'Advanced', description: 'Up to 10 stages, team submissions and automatic score-threshold or top-N advancement.' },
  complex: { key: 'complex', price: '39.00', label: 'Complex', description: 'Unlimited stages, all Advanced features and weighted multi-criteria judging.' },
}

export function quotePrice(complexity: string | null | undefined): Tier {
  return TIERS[(complexity || 'standard') as EventPassTier] ?? TIERS.standard
}
