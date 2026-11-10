export default function MatchScoreBadge({ score }) {
  const value = Math.round(score ?? 0)
  let colorClass = 'text-muted border-border'
  if (value >= 80) colorClass = 'text-accent border-accent/40 bg-accent/10'
  else if (value >= 60) colorClass = 'text-warning border-warning/40 bg-warning/10'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold ${colorClass}`}>
      {value}% match
    </span>
  )
}
