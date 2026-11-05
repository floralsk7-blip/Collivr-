
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useDirectMessages(otherUserId) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)

  const isSelf = !user?.id || !otherUserId || user.id === otherUserId

  useEffect(() => {
    if (isSelf) {
      setMessages([])
      setLoading(false)
      return
    }

    let active = true

    const load = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('direct_messages')
        .select('*')
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`
        )
        .order('created_at', { ascending: true })

      if (!active) return

      if (error) {
        console.error('Load direct messages error:', error)
        setMessages([])
      } else {
        setMessages(data || [])
      }

      setLoading(false)

      await supabase
        .from('direct_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('sender_id', otherUserId)
        .eq('receiver_id', user.id)
        .is('read_at', null)
    }

    load()

    const channel = supabase
      .channel(`dm-${user.id}-${otherUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
        },
        (payload) => {
          const message = payload.new

          const relevant =
            (message.sender_id === user.id && message.receiver_id === otherUserId) ||
            (message.sender_id === otherUserId && message.receiver_id === user.id)

          if (active && relevant) {
            setMessages((prev) =>
              prev.some((m) => m.id === message.id) ? prev : [...prev, message]
            )
          }
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [user?.id, otherUserId, isSelf])

  const send = async (content) => {
    if (isSelf) {
      return new Error('You cannot send a message to yourself.')
    }

    if (!content?.trim()) return

    const { error } = await supabase
      .from('direct_messages')
      .insert({
        sender_id: user.id,
        receiver_id: otherUserId,
        content: content.trim(),
      })

    if (error) {
      console.error('Send direct message error:', error)
      return error
    }

    return null
  }

  return { messages, send, loading }
}
