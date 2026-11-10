import { createClient } from '@supabase/supabase-js'
import { createMockSupabaseClient } from './mockSupabaseClient.js'

const env = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env
  : (typeof process !== 'undefined' ? process.env : {})

const supabaseUrl = env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'placeholder' &&
  supabaseAnonKey !== 'placeholder' &&
  supabaseUrl.startsWith('http')
)

export const isDevMode = !isSupabaseConfigured

if (isDevMode) {
  console.warn(
    '[Collivra] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Operating in safe Local Development Mode with mock services.'
  )
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMockSupabaseClient()
