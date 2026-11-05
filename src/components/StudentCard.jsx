import { Link } from 'react-router-dom'
import MatchScoreBadge from './MatchScoreBadge'
import InviteButton from './InviteButton'
import ConnectButton from './ConnectButton'

export default function StudentCard({ student, score, notes, skillOverlap = [], projectId, showInvite }) {
  const initial = student?.name?.charAt(0)?.toUpperCase() || '?'
  const branch = student?.branch || student?.department

  const skills = Array.isArray(student?.skills)
    ? student.skills
    : []

  const overlap = Array.isArray(skillOverlap)
    ? skillOverlap
    : []

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
            {skillOverlap.length > 0 && (
  <div className="mt-3">
    <p className="mb-2 text-xs font-medium text-muted">matching skills</p>
    <div className="flex flex-wrap gap-2">
      {skillOverlap.map((skill) => (
        <span
          key={skill}
          className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success"
        >
          {skill}
        </span>
      ))}
    </div>
  </div>
)}
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