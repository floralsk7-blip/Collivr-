import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useConnections } from '../hooks/useConnections'
import { useDirectMessages } from '../hooks/useDirectMessages'
import AppShell from '../components/AppShell'
import ConnectButton from '../components/ConnectButton'
import TeamChat from './TeamChat'

function dateLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function DirectChat({ otherUser }) {
  const { user } = useAuth()
  const { messages, send } = useDirectMessages(otherUser.id)
  const isSelf = !user?.id || otherUser.id === user.id
  const [content, setContent] = useState('')
  const bottomRef = useRef(null)
  const branch = otherUser.branch || otherUser.department

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
  if (isSelf || !content.trim()) return

  const text = content.trim()
  setContent('')
  send(text)
}

  return (
    <div className="flex h-[calc(100vh-9.5rem)] flex-col rounded-[14px] border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-sm font-bold text-primary">
          {otherUser.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-semibold text-text">{otherUser.name}</p>
          <p className="m-0 truncate text-[11px] text-muted">{[branch, otherUser.college].filter(Boolean).join(' · ')}</p>
        </div>
        <a href={`/profile/${otherUser.id}`} className="shrink-0 text-[13px] font-medium text-primary hover:underline">View Profile</a>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">No messages yet. Say hello 👋</p>
        ) : (
          <div className="flex flex-col gap-1">
            {messages.map((m, i) => {
              const isOwn = m.sender_id === user.id
              const prev = messages[i - 1]
              const showDateSeparator = !prev || dateLabel(prev.created_at) !== dateLabel(m.created_at)
              const time = new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

              return (
                <div key={m.id}>
                  {showDateSeparator && (
                    <div className="my-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="rounded-full bg-surface2 px-3 py-1 text-[11.5px] text-muted">{dateLabel(m.created_at)}</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div className={`mb-2 flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-md flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`px-3.5 py-2.5 text-sm leading-relaxed ${
                          isOwn
                            ? 'rounded-[12px_12px_3px_12px] bg-primary text-white'
                            : 'rounded-[12px_12px_12px_3px] border border-border bg-surface text-text'
                        }`}
                      >
                        {m.content}
                      </div>
                      <span className="mt-0.5 text-[11px] text-muted">{time}</span>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <div className="flex flex-1 items-center gap-2 rounded-[12px] border border-border bg-bg px-3 py-1.5">
          <textarea
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            className="flex-1 resize-none bg-transparent py-1 text-sm text-text placeholder:text-muted focus:outline-none"
          />
        </div>
        <button onClick={submit} className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primaryHover">➤</button>
      </div>
    </div>
  )
}

export default function Messages() {
  const { user } = useAuth()
  const { userId: routeUserId } = useParams()
  const navigate = useNavigate()
  const { accepted, otherProfile, statusWith } = useConnections()

  const [mode, setMode] = useState('direct')
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [selectedUserId, setSelectedUserId] = useState(routeUserId || null)
  const [teamConversations, setTeamConversations] = useState([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [directPreviews, setDirectPreviews] = useState({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (routeUserId) {
      setMode('direct')
      setSelectedUserId(routeUserId)
    }
  }, [routeUserId])

  useEffect(() => {
    if (user) loadTeamConversations()
  }, [user])

  useEffect(() => {
    if (user && accepted.length > 0) loadDirectPreviews()
  }, [user, accepted.length])

  async function loadTeamConversations() {
    setTeamLoading(true)
    const { data: memberRows } = await supabase.from('team_members').select('team_id').eq('student_id', user.id)
    const teamIds = [...new Set((memberRows || []).map((m) => m.team_id))]

    const results = await Promise.all(
      teamIds.map(async (teamId) => {
        const { data: team } = await supabase.from('teams').select('*').eq('id', teamId).maybeSingle()
        const { data: project } = team ? await supabase.from('projects').select('name').eq('id', team.project_id).maybeSingle() : { data: null }
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('*')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        return { teamId, projectName: project?.name || 'Team', lastMessage }
      })
    )
    setTeamConversations(results)
    setTeamLoading(false)
  }

  async function loadDirectPreviews() {
    const ids = accepted.map((c) => (c.sender_id === user.id ? c.receiver_id : c.sender_id))
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`sender_id.in.(${[user.id, ...ids].join(',')}),receiver_id.in.(${[user.id, ...ids].join(',')})`)
      .order('created_at', { ascending: false })

    const preview = {}
    for (const otherId of ids) {
      const msgs = (data || []).filter(
        (m) => (m.sender_id === user.id && m.receiver_id === otherId) || (m.sender_id === otherId && m.receiver_id === user.id)
      )
      const last = msgs[0]
      const unread = msgs.some((m) => m.receiver_id === user.id && m.sender_id === otherId && !m.read_at)
      preview[otherId] = { last, unread }
    }
    setDirectPreviews(preview)
  }

  function openDirect(otherId) {
    setMode('direct')
    setSelectedUserId(otherId)
    navigate(`/messages/${otherId}`)
  }

  function openTeam(teamId) {
    setMode('teams')
    setSelectedTeam(teamId)
    navigate('/messages')
  }

  const filteredConnections = accepted.filter((c) => {
    const p = otherProfile(c)
    return !search || p?.name?.toLowerCase().includes(search.toLowerCase())
  })
const isSelfChat = Boolean(user?.id && selectedUserId === user.id)

const selectedConnection = selectedUserId && !isSelfChat
  ? accepted.find((c) =>
      (c.sender_id === user.id ? c.receiver_id : c.sender_id) === selectedUserId
    )
  : null
  const selectedProfile = selectedConnection ? otherProfile(selectedConnection) : null

  return (
    <AppShell breadcrumb={<span>Messages</span>}>
      <div className="mx-auto flex max-w-content gap-5 px-6 py-7 md:px-9">
        <div className="w-full max-w-[300px] shrink-0 border-r border-border pr-4">
          <h1 className="mb-3 text-xl font-bold text-text">💬 Messages</h1>

          <div className="mb-3 flex w-fit gap-1 rounded-[9px] bg-surface2 p-1">
            {[{ key: 'direct', label: 'Direct' }, { key: 'teams', label: 'Teams' }].map((t) => (
              <button
                key={t.key}
                onClick={() => setMode(t.key)}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
                  mode === t.key ? 'bg-surface text-text shadow-sm' : 'text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mode === 'direct' ? (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="mb-3 w-full rounded-[9px] border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
              />
              {accepted.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <p className="m-0 text-sm text-muted">No connections yet.</p>
                  <button onClick={() => navigate('/find-people')} className="rounded-[9px] bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primaryHover">
                    Find People
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filteredConnections.map((c) => {
                    const p = otherProfile(c)
                    const otherId = c.sender_id === user.id ? c.receiver_id : c.sender_id
                    const preview = directPreviews[otherId]
                    const isActive = selectedUserId === otherId
                    return (
                      <button
                        key={c.id}
                        onClick={() => openDirect(otherId)}
                        className={`flex items-center gap-2.5 rounded-[12px] p-2.5 text-left transition-colors ${isActive ? 'bg-surface2' : 'hover:bg-surface2/60'}`}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface2 text-sm font-bold text-primary">
                          {p?.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="m-0 truncate text-sm font-semibold text-text">{p?.name}</p>
                            {preview?.last && (
                              <span className="shrink-0 text-[11px] text-muted">
                                {new Date(preview.last.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <p className="m-0 truncate text-xs text-muted">{preview?.last?.content || 'No messages yet'}</p>
                        </div>
                        {preview?.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : teamLoading ? (
            <div className="flex flex-col gap-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-[14px]" />)}</div>
          ) : teamConversations.length === 0 ? (
            <p className="text-sm text-muted">No team conversations yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {teamConversations.map((c) => (
                <button
                  key={c.teamId}
                  onClick={() => openTeam(c.teamId)}
                  className={`rounded-[12px] border p-3 text-left transition-colors ${
                    selectedTeam === c.teamId ? 'border-primary bg-surface2' : 'border-border bg-surface hover:border-accentLight'
                  }`}
                >
                  <p className="m-0 truncate text-sm font-semibold text-text">{c.projectName}</p>
                  <p className="m-0 truncate text-xs text-muted">{c.lastMessage?.content || 'No messages yet'}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {mode === 'teams' && (
            selectedTeam ? <TeamChat teamId={selectedTeam} /> : <p className="text-sm text-muted">Select a conversation.</p>
          )}

          {mode === 'direct' && selectedUserId && (
  isSelfChat ? (
    <div className="flex h-[calc(100vh-9.5rem)] items-center justify-center rounded-[14px] border border-border bg-surface">
      <p className="text-sm text-muted">
        You cannot message yourself. Select another connection.
      </p>
    </div>
  ) : statusWith(selectedUserId) === 'connected' && selectedProfile ? (
    <DirectChat otherUser={selectedProfile} />
  ) : (
    <div className="flex h-[calc(100vh-9.5rem)] flex-col items-center justify-center gap-3 rounded-[14px] border border-border bg-surface text-center">
      <p className="m-0 text-sm text-muted">
        You need to connect with this person before messaging.
      </p>
      <div className="w-40">
        <ConnectButton studentId={selectedUserId} />
      </div>
    </div>
  )
)}
  

          {mode === 'direct' && !selectedUserId && (
            <div className="flex h-[calc(100vh-9.5rem)] items-center justify-center rounded-[14px] border border-border bg-surface">
              <p className="text-sm text-muted">💬 Select a conversation to start messaging.</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
