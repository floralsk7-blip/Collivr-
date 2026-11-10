import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useConnections } from '../hooks/useConnections'
import AppShell from '../components/AppShell'

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Notifications() {
  const { user } = useAuth()
  const { respond: respondConnectionHook, reload: reloadConnections } = useConnections()
  const [invites, setInvites] = useState([])
  const [connections, setConnections] = useState([])
  const [eventNotices, setEventNotices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) load()
  }, [user])

  async function load() {
    setLoading(true)
    const { data: inviteData } = await supabase
      .from('team_invites')
      .select('*, projects(name), student_profiles!team_invites_sender_id_fkey(name)')
      .eq('receiver_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setInvites(inviteData || [])

    const { data: connectionData } = await supabase
      .from('connections')
      .select('*, student_profiles!connections_sender_id_fkey(name)')
      .eq('receiver_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setConnections(connectionData || [])

    const { data: eventNoticeData } = await supabase
      .from('event_notifications').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(50)
    setEventNotices(eventNoticeData || [])
    setLoading(false)
  }

  async function respondInvite(id, status) {
    await supabase.from('team_invites').update({ status }).eq('id', id)
    load()
  }

  async function respondConnection(id, status) {
    await respondConnectionHook(id, status === 'accepted')
    await reloadConnections()
    load()
  }

  const isEmpty = invites.length === 0 && connections.length === 0 && eventNotices.length === 0

  async function markEventRead(id) {
    await supabase.from('event_notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    setEventNotices((items) => items.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
  }

  return (
    <AppShell breadcrumb={<span>Notifications</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <h1 className="mb-6 text-xl font-bold text-text">🔔 Notifications</h1>

        {loading ? (
          <div className="flex flex-col gap-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-[14px]" />)}</div>
        ) : isEmpty ? (
          <p className="text-sm text-muted">You're all caught up — no pending notifications.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {eventNotices.map((item) => (
              <div key={item.id} className={`flex items-start gap-3 rounded-[14px] border border-border bg-surface p-4 ${item.read_at ? 'opacity-70' : ''}`}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-info/10 text-base">📣</span>
                <div className="flex-1">
                  <p className="m-0 text-sm font-semibold text-text">{item.title}</p>
                  <p className="m-0 mt-1 text-sm text-textSecondary">{item.message}</p>
                  <p className="m-0 mt-1 text-xs text-muted">{timeAgo(item.created_at)}</p>
                </div>
                {!item.read_at && <button onClick={() => markEventRead(item.id)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text">Mark read</button>}
              </div>
            ))}

            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-info/10 text-base">🤝</span>
                <div className="flex-1">
                  <p className="m-0 text-sm text-text">
                    <span className="font-semibold">{inv.student_profiles?.name}</span> invited you to join <span className="font-semibold">{inv.projects?.name}</span>
                  </p>
                  <p className="m-0 text-xs text-muted">{timeAgo(inv.created_at)}</p>
                </div>
                <button onClick={() => respondInvite(inv.id, 'accepted')} className="rounded-[9px] bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primaryHover">Accept</button>
                <button onClick={() => respondInvite(inv.id, 'declined')} className="rounded-[9px] border border-border bg-surface px-4 py-2 text-xs text-muted hover:bg-surface2">Decline</button>
              </div>
            ))}

            {connections.map((conn) => (
              <div key={conn.id} className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-base">👤</span>
                <div className="flex-1">
                  <p className="m-0 text-sm text-text">
                    <span className="font-semibold">{conn.student_profiles?.name}</span> wants to connect
                  </p>
                  <p className="m-0 text-xs text-muted">{timeAgo(conn.created_at)}</p>
                </div>
                <button onClick={() => respondConnection(conn.id, 'accepted')} className="rounded-[9px] bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primaryHover">Accept</button>
                <button onClick={() => respondConnection(conn.id, 'declined')} className="rounded-[9px] border border-border bg-surface px-4 py-2 text-xs text-muted hover:bg-surface2">Decline</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
