import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function InviteButton({ studentId, projectId }) {
  const { user } = useAuth()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user || !projectId) return
    supabase
      .from('team_invites')
      .select('status')
      .eq('project_id', projectId)
      .eq('receiver_id', studentId)
      .maybeSingle()
      .then(({ data }) => setStatus(data?.status ?? null))
  }, [user, projectId, studentId])

  async function sendInvite() {
    setLoading(true)
    const { error } = await supabase.from('team_invites').insert({
      project_id: projectId,
      sender_id: user.id,
      receiver_id: studentId,
      status: 'pending',
    })
    if (!error) setStatus('pending')
    setLoading(false)
  }

  if (status === 'pending') {
    return (
      <span className="flex-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-center text-sm font-medium text-warning">
        Invite Pending
      </span>
    )
  }
  if (status === 'accepted') {
    return (
      <span className="flex-1 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-center text-sm font-medium text-accent">
        Accepted
      </span>
    )
  }
  if (status === 'declined') {
    return (
      <span className="flex-1 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-center text-sm font-medium text-danger">
        Declined
      </span>
    )
  }

  return (
    <button
      onClick={sendInvite}
      disabled={loading || !projectId}
      className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/80 disabled:opacity-50"
    >
      {loading ? 'Sending...' : 'Invite'}
    </button>
  )
}
