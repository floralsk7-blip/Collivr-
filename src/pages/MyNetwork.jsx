import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConnections } from '../hooks/useConnections'
import AppShell from '../components/AppShell'

function EmptyState({ icon, text, actionLabel, actionTo }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border border-border bg-surface px-6 py-14 text-center">
      <span className="text-2xl">{icon}</span>
      <p className="m-0 text-sm text-muted">{text}</p>
      {actionLabel && (
        <button
          onClick={() => navigate(actionTo)}
          className="mt-1 rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function PersonRow({ student, children }) {
  const navigate = useNavigate()
  const initial = student?.name?.charAt(0)?.toUpperCase() || '?'
  const branch = student?.branch || student?.department
  const topSkills = (student?.skills_detailed?.length ? student.skills_detailed.map((s) => s.name) : student?.skills || []).slice(0, 3)

  return (
    <div className="flex items-center gap-4 rounded-[14px] border border-border bg-surface p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface2 text-base font-bold text-primary">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[14.5px] font-semibold text-text">{student?.name}</p>
        <p className="m-0 truncate text-xs text-muted">
          {[student?.year ? `${student.year} Year` : null, branch, student?.college].filter(Boolean).join(' · ')}
        </p>
        {topSkills.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {topSkills.map((sk) => (
              <span key={sk} className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] font-medium text-primary">{sk}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {children}
        <button onClick={() => navigate(`/profile/${student?.id}`)} className="text-[13px] font-medium text-primary hover:underline">
          View Profile
        </button>
      </div>
    </div>
  )
}

export default function MyNetwork() {
  const { accepted, received, sent, otherProfile, respond, cancelRequest, loading } = useConnections()
  const navigate = useNavigate()
  const [tab, setTab] = useState('connections')

  const tabs = [
    { key: 'connections', label: 'Connections', count: accepted.length },
    { key: 'requests', label: 'Requests', count: received.length },
    { key: 'sent', label: 'Sent', count: sent.length },
  ]

  return (
    <AppShell breadcrumb={<span>My Network</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <h1 className="text-xl font-bold text-text">🔗 My Network</h1>
        <p className="mt-1 text-[13px] text-muted">Your connections and pending requests.</p>

        <div className="my-5 flex w-fit gap-1 rounded-[9px] bg-surface2 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-5 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key ? 'bg-surface text-text shadow-sm' : 'text-muted'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-[14px]" />)}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tab === 'connections' && (
              accepted.length === 0 ? (
                <EmptyState icon="🔍" text="No connections yet. Find people who match your skills." actionLabel="Find People" actionTo="/find-people" />
              ) : (
                accepted.map((c) => (
                  <PersonRow key={c.id} student={otherProfile(c)}>
                    <button
                      onClick={() => navigate(`/messages/${otherProfile(c)?.id}`)}
                      className="rounded-[9px] border border-borderStrong bg-surface px-3.5 py-1.5 text-xs font-semibold text-primary hover:bg-surface2"
                    >
                      💬 Message
                    </button>
                  </PersonRow>
                ))
              )
            )}

            {tab === 'requests' && (
              received.length === 0 ? (
                <EmptyState icon="📭" text="No incoming requests right now." actionLabel="Find People" actionTo="/find-people" />
              ) : (
                received.map((c) => (
                  <PersonRow key={c.id} student={otherProfile(c)}>
                    <button
                      onClick={() => respond(c.id, true)}
                      className="rounded-[9px] bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primaryHover"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respond(c.id, false)}
                      className="rounded-[9px] border border-danger/30 bg-surface px-3.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
                    >
                      Decline
                    </button>
                  </PersonRow>
                ))
              )
            )}

            {tab === 'sent' && (
              sent.length === 0 ? (
                <EmptyState icon="📤" text="No sent requests. Reach out to people you'd like to work with." actionLabel="Find People" actionTo="/find-people" />
              ) : (
                sent.map((c) => (
                  <PersonRow key={c.id} student={otherProfile(c)}>
                    <span className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-medium text-muted">Pending</span>
                    <button onClick={() => cancelRequest(c.id)} className="text-[13px] font-medium text-danger hover:underline">
                      Cancel
                    </button>
                  </PersonRow>
                ))
              )
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
