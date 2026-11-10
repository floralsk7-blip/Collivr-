import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireUser, requireUuid } from '../_shared/http.ts'

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
      p_event: eventId, p_user: user.id,
    })
    if (permissionError) throw new HttpError(500, permissionError.message)
    if (!allowed || event.organizer_id !== user.id) throw new HttpError(403, 'Only the event creator can publish this event.')
    if (event.status !== 'paid' || !event.paid_at) {
      throw new HttpError(402, 'Complete and verify the Event Pass payment before publishing.', 'payment_required')
    }
    const { error: updateError } = await admin.from('events').update({ status: 'published' }).eq('id', eventId)
    if (updateError) throw new HttpError(500, updateError.message)
    return json({ success: true, status: 'published' })
  } catch (error) {
    return errorResponse(error)
  }
})
