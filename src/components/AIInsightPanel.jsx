export default function AIInsightPanel({ analysis, loading }) {
  if (loading) {
    return (
      <div className="rounded-xl border-l-4 border-l-primary border-y border-r border-border bg-surface p-5">
        <div className="skeleton mb-3 h-4 w-40" />
        <div className="skeleton mb-2 h-3 w-full" />
        <div className="skeleton h-3 w-2/3" />
      </div>
    )
  }

  if (!analysis) return null

  return (
    <div className="rounded-xl border-l-4 border-l-primary border-y border-r border-border bg-surface p-5">
      <h3 className="mb-4 font-semibold text-text">AI Insights</h3>

      {analysis.identified_roles?.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-muted">Roles Identified</p>
          <div className="flex flex-wrap gap-2">
            {analysis.identified_roles.map((role) => (
              <span key={role} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-accent">
                {role}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis.skill_gaps?.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-muted">Skill Gaps Detected</p>
          <div className="flex flex-wrap gap-2">
            {analysis.skill_gaps.map((gap) => (
              <span key={gap} className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                {gap}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis.sustainability_notes && (
        <div>
          <p className="mb-2 text-sm font-medium text-muted">Sustainability Notes</p>
          <p className="text-sm leading-relaxed text-text">{analysis.sustainability_notes}</p>
        </div>
      )}
    </div>
  )
}
