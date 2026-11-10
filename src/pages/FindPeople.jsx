import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import AppShell from '../components/AppShell'
import ConnectButton from '../components/ConnectButton'

const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced']

export default function FindPeople() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState(params.get('q') || '')
  const [expFilter, setExpFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadStudents()
  }, [user, profile])

  async function loadStudents() {
  if (!user?.id) {
    setStudents([])
    setLoading(false)
    return
  }

  setLoading(true)

  try {
    const { data, error } = await supabase
      .from('student_profiles')
      .select('*')
      .neq('id', user.id)
      .neq('account_type', 'organiser')

    if (error) throw error

    const mySkills = profile?.skills || []

    const scored = (data || [])
      .filter((student) => student.id !== user.id && student.account_type !== 'organiser')
      .map((s) => {
        const overlap = (s.skills || []).filter((sk) =>
          mySkills.some(
            (ms) => ms.toLowerCase() === sk.toLowerCase()
          )
        )

        return { ...s, shared: overlap.length }
      })
      .sort((a, b) => b.shared - a.shared)

    setStudents(scored)
  } catch (error) {
    console.error('Error loading students:', error)
    setStudents([])
  } finally {
    setLoading(false)
  }
}

  const filtered = students.filter((s) => {
    const matchesSearch =
      !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.college?.toLowerCase().includes(search.toLowerCase()) ||
      s.skills?.some((sk) => sk.toLowerCase().includes(search.toLowerCase()))
    const matchesExp = !expFilter || s.experience === expFilter
    return matchesSearch && matchesExp
  })

  return (
    <AppShell breadcrumb={<span>Find People</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <h1 className="text-2xl font-bold text-text">Find people</h1>
        <p className="mt-1 text-sm text-muted">Search by name, college or skill.</p>

        <div className="my-6 rounded-[14px] border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <select
              value={expFilter}
              onChange={(e) => setExpFilter(e.target.value)}
              className={`rounded-full border px-3.5 py-1.5 text-[12.5px] ${expFilter ? 'border-primary bg-primary text-white' : 'border-border bg-surface2 text-text'}`}
            >
              <option value="">Experience</option>
              {EXPERIENCE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, college, or skill..."
                className="w-full rounded-[9px] border border-border bg-bg py-2.5 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-20 rounded-[14px]" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-10 text-center text-muted">No students match your search. Try different keywords.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((student) => (
              <div
                key={student.id}
                onClick={() => navigate(`/profile/${student.id}`)}
                className="flex cursor-pointer items-center gap-4 rounded-[14px] border border-border bg-surface p-4 transition-colors hover:border-accentLight hover:bg-surface2/40"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface2 text-lg font-bold text-primary">
                  {student.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[15px] font-semibold text-text">{student.name}</p>
                  <p className="m-0 truncate text-xs text-muted">{student.year ? `Year ${student.year} · ` : ''}{student.college}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {student.skills?.slice(0, 4).map((sk) => (
                      <span key={sk} className="rounded-md bg-surface2 px-2.5 py-0.5 text-[11.5px] font-medium text-primary">{sk}</span>
                    ))}
                  </div>
                </div>
                {student.shared > 0 && (
                  <span className="hidden shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-accent sm:inline-block">
                    {student.shared} shared skill{student.shared === 1 ? '' : 's'}
                  </span>
                )}
                <div onClick={(e) => e.stopPropagation()} className="w-[150px] shrink-0">
                  <ConnectButton studentId={student.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
