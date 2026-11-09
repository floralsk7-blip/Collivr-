import { Link } from 'react-router-dom'
import MatchScoreBadge from './MatchScoreBadge'
import InviteButton from './InviteButton'
import ConnectButton from './ConnectButton'

export default function StudentCard({ student, score, notes, skillOverlap = [], details = null, projectId, showInvite }) {
  const initial = student?.name?.charAt(0)?.toUpperCase() || '?'
  const branch = student?.branch || student?.department

  const skills = Array.isArray(student?.skills)
    ? student.skills
    : []

  const overlap = Array.isArray(skillOverlap)
    ? skillOverlap
    : []

  const related = Array.isArray(details?.related_skills) ? details.related_skills : []
  const missing = Array.isArray(details?.missing_skills) ? details.missing_skills : []

  const hours = student?.availability_hours
  const availabilityText = hours
    ? `${hours}${/[a-z]/i.test(String(hours)) ? '' : ' hrs/week'}`
    : details
      ? 'not shared'
      : ''
  const collaborationText = typeof student?.open_to_collaborate === 'boolean'
    ? (student.open_to_collaborate ? 'Open to collaborate' : 'Not currently open')
    : ''

  return (
    <div className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary">
      {/* student identity */}

      <div className="flex items-start gap-3">
        {student?.photo_url ? (
          <img
            src={student.photo_url}
            alt={student.name || 'student'}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-accent">
            {initial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text">
            {student?.name || 'student'}
          </p>

          <p className="truncate text-sm text-muted">
            {student?.college || 'college not provided'}
            {branch ? ` · ${branch}` : ''}
          </p>
        </div>

        {typeof score === 'number' && (
          <MatchScoreBadge score={score} />
        )}
      </div>

      {/* ai explanation */}

      {notes && (
        <div className="mt-3 rounded-lg bg-surface2 px-3 py-2">
          <p className="text-xs leading-relaxed text-textSecondary">
            {notes}
          </p>
        </div>
      )}

      {/* matching skills */}

      {overlap.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-accent">
            Skills matching this project
          </p>

          <div className="flex flex-wrap gap-2">
            {overlap.map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* related, missing, availability and collaboration (from the verified match breakdown) */}

      {(related.length > 0 || missing.length > 0) && (
        <div className="mt-3 space-y-2">
          {related.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Related skills</p>
              <div className="flex flex-wrap gap-2">
                {related.map((hit) => (
                  <span key={hit.required} className="rounded-full border border-border bg-surface2 px-2.5 py-1 text-xs text-textSecondary">
                    {hit.via} <span className="text-muted">for {hit.required}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {missing.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Missing skills</p>
              <div className="flex flex-wrap gap-2">
                {missing.map((m) => (
                  <span
                    key={m.skill}
                    className={`rounded-full px-2.5 py-1 text-xs ${m.importance === 'critical' || m.importance === 'high' ? 'bg-danger/10 font-medium text-danger' : 'bg-surface2 text-muted'}`}
                  >
                    {m.skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(availabilityText || collaborationText) && (
        <div className="mt-3 space-y-0.5 text-xs text-textSecondary">
          {availabilityText && <p>Availability: {availabilityText}</p>}
          {collaborationText && <p>Collaboration: {collaborationText}</p>}
        </div>
      )}

      {/* other student skills */}

      {skills.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-medium text-muted">
            Other skills
          </p>

          <div className="flex flex-wrap gap-2">
            {skills
              .filter(
                (skill) =>
                  !overlap.some(
                    (matched) =>
                      matched.toLowerCase() === skill.toLowerCase()
                  )
              )
              .slice(0, 5)
              .map((skill) => (
                <span
                  key={skill}
                  className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-accent"
                >
                  {skill}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* external profiles */}

      <div className="mt-4 flex items-center gap-3 text-sm text-muted">
        {student?.github_url && (
          <a
            href={student.github_url}
            target="_blank"
            rel="noreferrer"
            className="hover:text-text"
          >
            GitHub
          </a>
        )}

        {student?.linkedin_url && (
          <a
            href={student.linkedin_url}
            target="_blank"
            rel="noreferrer"
            className="hover:text-text"
          >
            LinkedIn
          </a>
        )}
      </div>

      {/* actions */}

      <div className="mt-4 flex items-center gap-2">
        <Link
          to={`/profile/${student.id}`}
          className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-sm font-medium text-text transition-colors hover:border-primary"
        >
          View Profile
        </Link>

        <ConnectButton
          studentId={student.id}
          fullWidth={false}
        />

        {showInvite && (
          <InviteButton
            studentId={student.id}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  )
}