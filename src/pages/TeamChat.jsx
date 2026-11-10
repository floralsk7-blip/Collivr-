import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useRealtimeMessages } from '../hooks/useRealtime'

function dateLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function TeamChat({ teamId }) {
  const { user } = useAuth()
  const messages = useRealtimeMessages(teamId)
  const [content, setContent] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function sendMessage(e) {
    e.preventDefault()
    if (!content.trim()) return
    const text = content.trim()
    setContent('')
    await supabase.from('messages').insert({ team_id: teamId, sender_id: user.id, content: text })
  }

  return (
    <div>
      <h3 className="mb-4 text-[17px] font-bold text-text">Team Chat</h3>

      <div className="flex h-[calc(100vh-22rem)] min-h-[360px] flex-col rounded-[14px] border border-border bg-surface">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted">No messages yet. Say hello to your team.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {messages.map((m, i) => {
                const isOwn = m.sender_id === user.id
                const prev = messages[i - 1]
                const showHeader = !prev || prev.sender_id !== m.sender_id
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
                    <div className={`mb-2 flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                      {!isOwn && (
                        <div className="w-[30px] shrink-0">
                          {showHeader && (
                            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-surface2 text-xs font-bold text-primary">
                              {m.student_profiles?.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                          )}
                        </div>
                      )}
                      <div className={`flex max-w-md flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                        {showHeader && !isOwn && <span className="mb-0.5 ml-1 text-xs font-semibold text-primary">{m.student_profiles?.name}</span>}
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

        <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-border p-3">
          <div className="flex flex-1 items-center gap-2 rounded-[12px] border border-border bg-bg px-3 py-1.5">
            <input
              value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="Type a message…"
              className="flex-1 bg-transparent py-1 text-sm text-text placeholder:text-muted focus:outline-none"
            />
            <span className="cursor-pointer text-muted">📎</span>
            <span className="cursor-pointer text-muted">🎤</span>
          </div>
          <button type="submit" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primaryHover">➤</button>
        </form>
      </div>
    </div>
  )
}
