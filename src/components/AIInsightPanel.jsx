
export default function AIInsightPanel({ analysis, requiredSkills = [], loading }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="skeleton mb-4 h-5 w-40" />
        <div className="skeleton mb-3 h-3 w-full" />
        <div className="skeleton mb-3 h-3 w-5/6" />
        <div className="skeleton h-3 w-2/3" />
      </div>
    )
  }

  if (!analysis) return null

  const roles = Array.isArray(analysis.identified_roles)
  ? analysis.identified_roles
  : []

const extractedSkills = [
  ...new Set([
    ...(Array.isArray(analysis.required_skills) ? analysis.required_skills : []),
    ...(Array.isArray(requiredSkills) ? requiredSkills : []),
  ]),
]
  const gaps = analysis.skill_gaps || []
  const priorities = analysis.skill_priorities || []

  const complexity = analysis.project_complexity
  const experience = analysis.experience_level

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-text">
            AI Project Analysis ✨
          </h3>
          <p className="mt-1 text-xs text-muted">
            project requirements identified by gemini
          </p>
        </div>

        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          AI analysis
        </span>
      </div>

      {/* extracted skills */}

      {requiredSkills.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-sm font-medium text-text">
            Required Skills
          </p>

          <div className="flex flex-wrap gap-2">
            {requiredSkills.map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* suggested roles */}

      {roles.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-sm font-medium text-text">
            Roles Identified
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => (
              <div
                key={role}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface2 px-3 py-2"
              >
                <span className="text-accent">✦</span>
                <span className="text-sm text-text">
                  {role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* skill priorities */}

      {priorities.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-sm font-medium text-text">
            Skill Priorities
          </p>

          <div className="flex flex-col gap-2">
            {priorities.map((item, index) => {
              const skill =
                typeof item === 'string'
                  ? item
                  : item.skill || item.name || 'Skill'

              const priority =
                typeof item === 'string'
                  ? ''
                  : item.priority || item.level || ''

              return (
                <div
                  key={`${skill}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <span className="text-sm text-text">
                    {skill}
                  </span>

                  {priority && (
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-accent">
                      {priority}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* project complexity and experience */}

      {(complexity || experience) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {complexity && (
            <div className="rounded-lg border border-border bg-surface2 p-3">
              <p className="text-xs text-muted">
                Project Complexity
              </p>
              <p className="mt-1 text-sm font-semibold capitalize text-text">
                {complexity}
              </p>
            </div>
          )}

          {experience && (
            <div className="rounded-lg border border-border bg-surface2 p-3">
              <p className="text-xs text-muted">
                Recommended Experience
              </p>
              <p className="mt-1 text-sm font-semibold capitalize text-text">
                {experience}
              </p>
            </div>
          )}
        </div>
      )}

      {/* detected skill gaps */}

      {gaps.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 text-sm font-medium text-text">
            Potential Skill Gaps
          </p>

          <div className="flex flex-wrap gap-2">
            {gaps.map((gap) => (
              <span
                key={gap}
                className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning"
              >
                {gap}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ai reasoning */}

      {analysis.reasoning && (
        <div className="mb-4 rounded-lg border border-border bg-surface2 p-3">
          <p className="mb-1 text-sm font-medium text-text">
            Why these requirements?
          </p>

          <p className="text-sm leading-relaxed text-textSecondary">
            {analysis.reasoning}
          </p>
        </div>
      )}

      {/* sustainability notes */}

      {analysis.sustainability_notes && (
        <div>
          <p className="mb-2 text-sm font-medium text-text">
            Additional Insights
          </p>

          <p className="text-sm leading-relaxed text-textSecondary">
            {analysis.sustainability_notes}
          </p>
        </div>
      )}

      {!requiredSkills.length &&
        !roles.length &&
        !gaps.length &&
        !analysis.reasoning &&
        !analysis.sustainability_notes && (
          <p className="text-sm text-muted">
            no detailed insights were returned by the analysis.
          </p>
        )}
    </section>
  )
}
