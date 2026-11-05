import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useRealtimeMessages(teamId) {
  const [messages, setMessages] = useState([])

  useEffect(() => {
    if (!teamId) return

    supabase
      .from('messages')
      .select('*, student_profiles(name, photo_url)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMessages(data || []))

    const channel = supabase
      .channel(`chat-${teamId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `team_id=eq.${teamId}` },
        async (payload) => {
          const { data: sender } = await supabase
            .from('student_profiles')
            .select('name, photo_url')
            .eq('id', payload.new.sender_id)
            .maybeSingle()
          setMessages((prev) => [...prev, { ...payload.new, student_profiles: sender }])
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [teamId])

  return messages
}
