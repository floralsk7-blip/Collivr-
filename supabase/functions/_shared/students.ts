import type { Student } from './teamOptimizer.ts'

// deno-lint-ignore no-explicit-any
type Admin = any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function cleanIds(values: unknown, max = 200): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && UUID.test(v)))].slice(0, max)
}

export const STUDENT_COLUMNS = 'id, name, skills, skills_detailed, experience, project_interests, availability_hours, branch, department'

export async function loadStudents(admin: Admin, ids: string[]): Promise<Student[]> {
  if (ids.length === 0) return []
  const { data, error } = await admin.from('student_profiles').select(STUDENT_COLUMNS).in('id', ids)
  if (error) throw new Error(error.message)
  return (data ?? []) as Student[]
}
