import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireUser } from '../_shared/http.ts'

function assertAdmin(email?: string) {
  const allowed = (Deno.env.get('COLLIVRA_ADMIN_EMAILS') || '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  if (!email || !allowed.includes(email.toLowerCase())) {
    throw new HttpError(403, 'Platform administrator access is required.')
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await requireUser(req)
    assertAdmin(user.email)
    const body = await req.json().catch(() => ({}))
    const admin = adminClient()

    if (body.action === 'list') {
      const [{ data: organizations, error: orgError }, { data: requests, error: reqError }, { data: inquiries, error: inquiryError }] = await Promise.all([
        admin.from('organizations').select('*').order('created_at', { ascending: false }),
        admin.from('organization_verification_requests').select('*').order('created_at', { ascending: false }),
        admin.from('plan_inquiries').select('*').order('created_at', { ascending: false }),
      ])
      if (orgError || reqError || inquiryError) throw new HttpError(500, orgError?.message || reqError?.message || inquiryError?.message || 'Could not load admin data.')
      return json({ organizations: organizations || [], requests: requests || [], inquiries: inquiries || [] })
    }

    if (body.action === 'review_verification') {
      const { organizationId, requestId, decision } = body
      if (!organizationId || !requestId || !['approved','rejected'].includes(decision)) throw new HttpError(400, 'Invalid verification decision.')
      const { error: requestError } = await admin.from('organization_verification_requests').update({
        status: decision, reviewed_by: user.id, reviewed_at: new Date().toISOString(),
      }).eq('id', requestId).eq('organization_id', organizationId)
      if (requestError) throw new HttpError(500, requestError.message)
      const { error: orgError } = await admin.from('organizations').update({
        verification_status: decision === 'approved' ? 'verified' : 'rejected',
        updated_at: new Date().toISOString(),
      }).eq('id', organizationId)
      if (orgError) throw new HttpError(500, orgError.message)
      return json({ success: true })
    }

    if (body.action === 'activate_custom_contract') {
      const { organizationId, accessUntil, inquiryId, eventLimit } = body
      if (!organizationId || !accessUntil || !Number.isFinite(Date.parse(accessUntil))
        || !Number.isInteger(Number(eventLimit)) || Number(eventLimit) < 1 || Number(eventLimit) > 10000) {
        throw new HttpError(400, 'Provide a valid organization, contract expiry and event volume limit.')
      }
      const { data: org, error: lookupError } = await admin.from('organizations').select('organization_type,verification_status').eq('id', organizationId).maybeSingle()
      if (lookupError || !org) throw new HttpError(404, 'Workspace not found.')
      if (org.organization_type !== 'organisation' || org.verification_status !== 'verified') throw new HttpError(400, 'Verify the organisation before activating a custom contract.')
      const { error: orgError } = await admin.from('organizations').update({
        subscription_status: 'active', subscription_plan: 'organisation_custom',
        contract_access_until: accessUntil, event_limit: Number(eventLimit), updated_at: new Date().toISOString(),
      }).eq('id', organizationId)
      if (orgError) throw new HttpError(500, orgError.message)
      const { count: existingEvents } = await admin.from('events')
        .select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)
      if ((existingEvents ?? 0) <= Number(eventLimit)) {
        const { error: includeError } = await admin.from('events').update({ contract_included: true })
          .eq('organization_id', organizationId).eq('status', 'draft')
        if (includeError) throw new HttpError(500, includeError.message)
      }
      if (inquiryId) {
        const { error: inquiryError } = await admin.from('plan_inquiries').update({ status: 'approved' }).eq('id', inquiryId)
        if (inquiryError) throw new HttpError(500, inquiryError.message)
      }
      return json({ success: true })
    }

    throw new HttpError(400, 'Unknown action.')
  } catch (error) {
    return errorResponse(error)
  }
})
