import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useProfile } from '../hooks/useProfile'
import { useAuth } from '../hooks/useAuth'
import Logo from './Logo'
import Icon from './Icon'

const STUDENT_MENU = [
  { to: '/profile', label: 'My profile' },
  { to: '/events', label: 'Events' },
  { to: '/pricing', label: 'Plans & billing' },
  { to: '/settings', label: 'Settings' },
]

export default function Navbar({ breadcrumb }) {
  const { profile } = useProfile()
  const { user } = useAuth()
  const accountType = profile?.account_type || user?.user_metadata?.account_type || 'student'
  const isOrganizer = accountType !== 'student'
  const menu = isOrganizer ? [
    { to: '/profile', label: 'My profile' },
    { to: '/events', label: 'My events' },
    { to: '/pricing', label: 'Plans & billing' },
    { to: '/settings', label: 'Settings' },
  ] : STUDENT_MENU
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const menuRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function close(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function submitSearch(e) {
    e.preventDefault()
    const q = search.trim()
    navigate(q ? `/find-people?q=${encodeURIComponent(q)}` : '/find-people')
  }

  return (
    <nav className="sticky top-0 z-20 flex h-[60px] items-center justify-between gap-4 border-b border-border bg-bg/90 px-4 backdrop-blur md:ml-[230px] md:px-8">
      <div className="md:hidden"><Logo /></div>
      <div className="hidden min-w-0 items-center gap-1 text-[13px] text-muted md:flex">{breadcrumb || null}</div>

      {!isOrganizer && <form onSubmit={submitSearch} className="hidden max-w-[420px] flex-1 md:block">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" className="h-4 w-4" /></span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people by name, college or skill"
            aria-label="Search people"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
      </form>}

      <div className="flex items-center gap-3">
        <Link to="/notifications" className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-text" aria-label="Notifications">
          <Icon name="bell" className="h-5 w-5" />
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
          >
            {profile?.name?.charAt(0)?.toUpperCase() || '?'}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-lift">
              {menu.map((item) => (
                <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-text hover:bg-surface2">
                  {item.label}
                </Link>
              ))}
              <div className="my-1 border-t border-border" />
              <button onClick={signOut} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface2">Sign out</button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
