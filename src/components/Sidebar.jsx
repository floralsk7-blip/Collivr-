import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useSubscription } from '../hooks/useSubscription'
import { TIER_LABEL } from '../lib/plans'
import Logo from './Logo'
import Icon from './Icon'

const NAV_GROUPS = [
  {
    label: 'Home',
    items: [
      { path: '/dashboard', label: 'Home', icon: 'home' },
      { path: '/messages', label: 'Messages', icon: 'chat', badgeKey: 'messages' },
      { path: '/notifications', label: 'Notifications', icon: 'bell', badgeKey: 'notifications' },
    ],
  },
  {
    label: 'Discover',
    items: [
      { path: '/find-people', label: 'Find People', icon: 'users' },
      { path: '/discover', label: 'Find Projects', icon: 'search' },
      { path: '/network', label: 'Community', icon: 'link', badgeKey: 'network' },
      { path: '/mentors', label: 'Mentors', icon: 'sparkle' },
    ],
  },
  {
    label: 'Create',
    items: [
      { path: '/create-project', label: 'Start a Project', icon: 'plus' },
      { path: '/events', label: 'Events', icon: 'ticket' },
    ],
  },
  {
    label: 'Account',
    items: [
      { path: '/pricing', label: 'Plans & Billing', icon: 'crown' },
      { path: '/settings', label: 'Settings', icon: 'sliders' },
    ],
  },
]

const ORGANISER_NAV_GROUPS = [
  { label: 'Conduct events', items: [
    { path: '/events', label: 'My Events', icon: 'ticket' },
    { path: '/pricing', label: 'Plans & Billing', icon: 'crown' },
    { path: '/settings', label: 'Settings', icon: 'sliders' },
  ] },
]

const MOBILE_ITEMS = [
  { path: '/dashboard', label: 'Home', icon: 'home' },
  { path: '/find-people', label: 'People', icon: 'users' },
  { path: '/discover', label: 'Projects', icon: 'search' },
  { path: '/messages', label: 'Chat', icon: 'chat', badgeKey: 'messages' },
]

async function loadBadgeCounts(userId) {
  const [{ count: invites }, { count: pendingConnections }, { count: unreadDirect }] = await Promise.all([
    supabase.from('team_invites').select('*', { count: 'exact', head: true }).eq('receiver_id', userId).eq('status', 'pending'),
    supabase.from('connections').select('*', { count: 'exact', head: true }).eq('receiver_id', userId).eq('status', 'pending'),
    supabase.from('direct_messages').select('*', { count: 'exact', head: true }).eq('receiver_id', userId).is('read_at', null),
  ])

  const { data: memberRows } = await supabase.from('team_members').select('team_id').eq('student_id', userId)
  const teamIds = (memberRows || []).map((m) => m.team_id)
  let unreadTeam = 0
  if (teamIds.length > 0) {
    const { data: reads } = await supabase.from('message_reads').select('team_id, last_read_at').eq('user_id', userId)
    const readMap = Object.fromEntries((reads || []).map((r) => [r.team_id, r.last_read_at]))
    const counts = await Promise.all(
      teamIds.map(async (teamId) => {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', teamId)
          .gt('created_at', readMap[teamId] || '1970-01-01')
          .neq('sender_id', userId)
        return count || 0
      }),
    )
    unreadTeam = counts.reduce((a, b) => a + b, 0)
  }

  return {
    messages: unreadTeam + (unreadDirect || 0),
    notifications: (invites || 0) + (pendingConnections || 0),
    network: pendingConnections || 0,
  }
}

function useBadges() {
  const { user } = useAuth()
  const [badges, setBadges] = useState({ messages: 0, notifications: 0, network: 0 })
  useEffect(() => {
    if (!user) return
    loadBadgeCounts(user.id).then(setBadges).catch(() => {})
  }, [user])
  return badges
}

export default function Sidebar() {
  const { profile } = useProfile()
  const { user } = useAuth()
  const { tier } = useSubscription()
  const badges = useBadges()
  const accountType = profile?.account_type || user?.user_metadata?.account_type || 'student'
  const isOrganizer = accountType !== 'student'
  // Analytics is a Premium-only student feature. Keep every existing student item
  // unchanged and append a single entry for accounts with an active Premium entitlement.
  const studentGroups = tier === 'premium'
    ? NAV_GROUPS.map((group) => group.label === 'Home'
      ? { ...group, items: [...group.items, { path: '/analytics', label: 'Analytics', icon: 'chart' }] }
      : group)
    : NAV_GROUPS
  const groups = isOrganizer ? ORGANISER_NAV_GROUPS : studentGroups
  const accountLabel = isOrganizer ? 'Event Organiser' : 'Student'

  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-[230px] flex-col bg-sidebarBg md:flex">
      <div className="px-5 py-6">
        <Link to={isOrganizer ? '/events' : '/dashboard'}><Logo dark /></Link>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sidebarText/55">{group.label}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${
                      isActive ? 'bg-white/10 font-semibold text-white' : 'text-sidebarText hover:bg-sidebarHover hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-gold" />}
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                      {item.badgeKey && badges[item.badgeKey] > 0 && (
                        <span className="ml-auto min-w-[18px] rounded-full bg-gold px-1.5 py-px text-center text-[10px] font-bold text-sidebarBg">
                          {badges[item.badgeKey]}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <Link to={isOrganizer ? '/profile' : '/pricing'} className="m-3 flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-3 hover:bg-white/10">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          {profile?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-white">{profile?.organisation_name || profile?.name || accountLabel}</p>
          <p className="flex items-center gap-1 text-[11px] text-gold">
            {isOrganizer ? accountLabel : <>{tier !== 'free' && <Icon name="crown" className="h-3 w-3" />}{TIER_LABEL[tier]} plan</>}
          </p>
        </div>
      </Link>
    </aside>
  )
}

export function MobileNav() {
  const badges = useBadges()
  const { profile } = useProfile()
  const { user } = useAuth()
  const isOrganizer = (profile?.account_type || user?.user_metadata?.account_type) !== 'student'
  const items = isOrganizer ? [
    { path: '/events', label: 'Events', icon: 'ticket' },
    { path: '/pricing', label: 'Billing', icon: 'crown' },
    { path: '/profile', label: 'Profile', icon: 'user' },
    { path: '/settings', label: 'Settings', icon: 'sliders' },
  ] : MOBILE_ITEMS
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-white/10 bg-sidebarBg md:hidden">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${isActive ? 'text-white' : 'text-sidebarText/70'}`
          }
        >
          <Icon name={item.icon} className="h-5 w-5" />
          {item.label}
          {item.badgeKey && badges[item.badgeKey] > 0 && <span className="absolute right-[28%] top-1.5 h-2 w-2 rounded-full bg-gold" />}
        </NavLink>
      ))}
    </nav>
  )
}
