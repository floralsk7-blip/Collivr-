export const NO_MATCH_MESSAGE =
  "No students currently match this project's required skills. Try adjusting the project requirements or check again later."

// Rows saved by the old matcher have no breakdown (details is null once the column exists).
// They carry the old default-style scores, so they are never shown or reused.
export const isLegacyMatch = (match) => Boolean(match) && 'details' in match && !match.details

export const visibleMatches = (rows) => (rows || []).filter((m) => m.student_profiles && !isLegacyMatch(m))
