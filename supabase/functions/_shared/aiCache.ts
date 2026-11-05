// deno-lint-ignore no-explicit-any
type Admin = any

// Caches an AI result per project and feature, keyed by a hash of its inputs.
// The same inputs return the stored AI answer without spending another AI action.
export async function getCached(admin: Admin, projectId: string, kind: string, hash: string) {
  const { data } = await admin.from('ai_results').select('payload').eq('project_id', projectId).eq('kind', kind).eq('input_hash', hash).maybeSingle()
  return data?.payload ?? null
}

export async function putCached(admin: Admin, projectId: string, kind: string, hash: string, payload: unknown) {
  await admin.from('ai_results').delete().eq('project_id', projectId).eq('kind', kind)
  await admin.from('ai_results').insert({ project_id: projectId, kind, input_hash: hash, payload })
}
