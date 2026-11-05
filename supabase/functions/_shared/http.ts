import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, message: string, code = '') {
    super(message)
    this.status = status
    this.code = code
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.message, code: err.code || undefined }, err.status)
  console.error('Unhandled error:', err)
  const message = err instanceof Error ? err.message : 'Unexpected error'
  return json({ error: message }, 500)
}

// Service-role client. Only ever used inside edge functions, never in the browser.
export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}

// Identify the caller from their Supabase session token. Never trust ids in the body.
export async function requireUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Please sign in first.')
  const { data, error } = await adminClient().auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  return data.user
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, `Invalid ${field}.`)
  return value
}
