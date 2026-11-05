import { supabase } from './supabaseClient'

// Calls an edge function and turns every failure into an Error with a readable message.
// err.code is set for business rules such as "upgrade_required" or "quota_reached".
export async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let message = error.message
    let code
    try {
      const detail = await error.context?.json?.()
      if (detail?.error) message = detail.error
      code = detail?.code
    } catch {
      /* keep the generic message */
    }
    if (/failed to send a request|failed to fetch/i.test(message)) {
      message = 'Could not reach the server. Check your connection, and that the Supabase functions are deployed.'
    }
    const err = new Error(message)
    err.code = code
    throw err
  }
  if (data?.error) {
    const err = new Error(data.error)
    err.code = data.code
    throw err
  }
  return data
}
