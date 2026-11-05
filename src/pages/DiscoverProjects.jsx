import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import AppShell from '../components/AppShell'
import ProjectCard from '../components/ProjectCard'
import { useAuth } from '../hooks/useAuth'

const DOMAINS = ['All', 'AI/ML', 'Web Dev', 'Mobile', 'Data Science', 'Cybersecurity', 'IoT', 'Other']
const STATUSES = ['All', 'open', 'forming', 'active']
const SORTS = ['Newest', 'Deadline', 'Match %']

export default function DiscoverProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [domain, setDomain] = useState('All')
  const [status, setStatus] = useState('All')
  const [sort, setSort] = useState('Newest')
  const { user } = useAuth()

  useEffect(() => {
    supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProjects(data || [])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    let list = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    if (domain !== 'All') list = list.filter((p) => p.domain === domain)
    if (status !== 'All') list = list.filter((p) => p.status === status)
    if (sort === 'Deadline') list = [...list].sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0))
    return list
  }, [projects, search, domain, status, sort])

  function clearFilters() {
    setSearch('')
    setDomain('All')
    setStatus('All')
  }

  return (
    <AppShell breadcrumb={<span>Find Projects</span>}>
      <div className="mx-auto max-w-content px-6 py-7 md:px-9">
        <h1 className="text-2xl font-bold text-text">Discover Projects</h1>
        <p className="mt-1 text-muted">Find a project that matches your skills and interests.</p>

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
          />
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none">
            {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none">
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'All' ? 'All Status' : s}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none">
            {SORTS.map((s) => <option key={s} value={s}>Sort: {s}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <p className="text-muted">No projects match your filters. Try broadening your search.</p>
            <button onClick={clearFilters} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:border-primary">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
  <ProjectCard
    key={project.id}
    project={project}
    userId={user?.id}
    onChanged={() => {
      supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data }) => setProjects(data || []))
    }}
  />
))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
