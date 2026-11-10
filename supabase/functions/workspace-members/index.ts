import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireUser, requireUuid } from '../_shared/http.ts'

async function requireWorkspaceAdmin(admin: any, organizationId: string, userId: string) {
  const { data, error } = await admin.rpc('is_org_admin', { p_org: organizationId, p_user: userId })
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(403, 'Only a workspace owner or admin can manage members.')
  const { data: org } = await admin.from('organizations').select('organization_type').eq('id', organizationId).maybeSingle()
  if (!org) throw new HttpError(404, 'Workspace not found.')
  return org
}

async function findUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new HttpError(500, error.message)
    const found = (data.users || []).find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if ((data.users || []).length < 1000) break
  }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))
    const organizationId = requireUuid(body.organizationId, 'organization')
    const admin = adminClient()
    const org = await requireWorkspaceAdmin(admin, organizationId, user.id)

    if (body.action === 'list') {
      const { data, error } = await admin.from('organization_members')
        .select('id,user_id,role,membership_status,student_profiles(name,official_email)')
        .eq('organization_id', organizationId).order('created_at')
      if (error) throw new HttpError(500, error.message)
      return json({ members: data || [] })
    }

    if (body.action === 'add') {
      const email = String(body.email || '').trim().toLowerCase()
      const role = String(body.role || '')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.')
      if (!['admin','event_manager','judge'].includes(role)) throw new HttpError(400, 'Invalid workspace role.')
      const target = await findUserByEmail(admin, email)
      if (!target) throw new HttpError(404, 'This person must create a COLLIVRA account first.')
      const { data: profile } = await admin.from('student_profiles').select('account_type').eq('id', target.id).maybeSingle()
      if (!profile) throw new HttpError(400, 'Ask this person to complete their COLLIVRA profile first.')
      if (['admin','event_manager'].includes(role) && !['organiser','institution','organisation'].includes(profile.account_type)) {
        throw new HttpError(400, 'Only Event Organiser accounts can receive organiser management roles.')
      }
      const { error } = await admin.from('organization_members').upsert({
        organization_id: organizationId, user_id: target.id, role, membership_status: 'active',
      }, { onConflict: 'organization_id,user_id' })
      if (error) throw new HttpError(500, error.message)
      return json({ success: true })
    }

    if (body.action === 'remove') {
      const memberId = requireUuid(body.memberId, 'member')
      const { error } = await admin.from('organization_members').update({ membership_status: 'suspended' })
        .eq('id', memberId).eq('organization_id', organizationId)
      if (error) throw new HttpError(500, error.message)
      return json({ success: true })
    }

    throw new HttpError(400, 'Unknown action.')
  } catch (error) {
    return errorResponse(error)
  }
})
