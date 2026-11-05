import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireUser, requireUuid } from '../_shared/http.ts'
import { formTeamsForEvent } from '../_shared/formEvent.ts'

// Button flow: ONLY a paid event can form teams. The optimizer decides the teams
// (deterministic, auditable). Gemini just explains the result in plain words.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const eventId = requireUuid(body.eventId, 'event')

    const admin = adminClient()
    const { data: event } = await admin.from('events').select('*').eq('id', eventId).maybeSingle()
    if (!event) throw new HttpError(404, 'Event not found.')
    const { data: allowed, error: permissionError } = await admin.rpc('can_manage_collivra_event', {
      p_event: eventId,
      p_user: user.id,
    })
    if (permissionError) throw new HttpError(500, permissionError.message)
    if (!allowed) throw new HttpError(403, 'Only an authorised, currently entitled event manager can form teams.')

    return json(await formTeamsForEvent(admin, event))
  } catch (err) {
    return errorResponse(err)
  }
})
