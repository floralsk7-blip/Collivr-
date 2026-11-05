import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useProfile() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (authLoading) return

    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('student_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Profile fetch error:', error)
    }

    setProfile(data ?? null)
    setLoading(false)
  }, [user, authLoading])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { profile, loading: authLoading || loading, refresh }
}