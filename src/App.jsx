import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import { useAuth } from './hooks/useAuth'
import { useProfile } from './hooks/useProfile'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Profile from './pages/Profile'
import CreateProject from './pages/CreateProject'
import DiscoverProjects from './pages/DiscoverProjects'
import ProjectDetail from './pages/ProjectDetail'
import TeamFormation from './pages/TeamFormation'
import ProjectWorkspace from './pages/ProjectWorkspace'
import Teammates from './pages/Teammates'
import Dashboard from './pages/Dashboard'
import FindPeople from './pages/FindPeople'
import MyNetwork from './pages/MyNetwork'
import TeamRecommendation from './pages/TeamRecommendation'
import MyTeams from './pages/MyTeams'
import Messages from './pages/Messages'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import Events from './pages/Events'
import EventDetail from './pages/EventDetail'
import Landing from './pages/Landing'
import Pricing from './pages/Pricing'
import Analytics from './pages/Analytics'
import Mentors from './pages/Mentors'
import PaymentSuccess from './pages/PaymentSuccess'
import EventCertificate from './pages/EventCertificate'

function StudentOnly({ children }) {
  const { profile, loading } = useProfile()
  const { user } = useAuth()
  const accountType = profile?.account_type || user?.user_metadata?.account_type
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-bg"><div className="skeleton h-8 w-32" /></div>
  if (accountType && accountType !== 'student') return <Navigate to="/events" replace />
  return children
}

function Protected({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="skeleton h-8 w-32" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const navigate = useNavigate()

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Only redirect from the public pages. Supabase also fires SIGNED_IN when a tab regains
      // focus (for example after the PayPal popup), and that must never move you off the page.
      const path = window.location.pathname
      if (event !== 'SIGNED_IN' || !session || (path !== '/login' && path !== '/')) return
      const { data } = await supabase.from('student_profiles').select('id, account_type').eq('id', session.user.id).maybeSingle()
      const accountType = data?.account_type || session.user.user_metadata?.account_type
      navigate(data ? (accountType === 'student' ? '/dashboard' : '/events') : '/profile')
    })
    return () => listener.subscription.unsubscribe()
  }, [navigate])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Protected><StudentOnly><Dashboard /></StudentOnly></Protected>} />
      <Route path="/find-people" element={<Protected><StudentOnly><FindPeople /></StudentOnly></Protected>} />
      <Route path="/network" element={<Protected><StudentOnly><MyNetwork /></StudentOnly></Protected>} />
      <Route path="/discover" element={<Protected><StudentOnly><DiscoverProjects /></StudentOnly></Protected>} />
      <Route path="/create-project" element={<Protected><StudentOnly><CreateProject /></StudentOnly></Protected>} />
      <Route path="/analytics" element={<Protected><StudentOnly><Analytics /></StudentOnly></Protected>} />
      <Route path="/mentors" element={<Protected><StudentOnly><Mentors /></StudentOnly></Protected>} />
      <Route path="/pricing" element={<Protected><Pricing /></Protected>} />
      <Route path="/events" element={<Protected><Events /></Protected>} />
      <Route path="/events/:id" element={<Protected><EventDetail /></Protected>} />
      <Route path="/certificates/:id" element={<Protected><EventCertificate /></Protected>} />
      <Route path="/my-teams" element={<Protected><StudentOnly><MyTeams /></StudentOnly></Protected>} />
      <Route path="/messages" element={<Protected><StudentOnly><Messages /></StudentOnly></Protected>} />
      <Route path="/messages/:userId" element={<Protected><StudentOnly><Messages /></StudentOnly></Protected>} />
      <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/profile/:id" element={<Protected><Profile /></Protected>} />
      <Route path="/project/:id" element={<Protected><StudentOnly><ProjectDetail /></StudentOnly></Protected>} />
      <Route path="/team/:projectId/form" element={<Protected><StudentOnly><TeamFormation /></StudentOnly></Protected>} />
      <Route path="/team/:projectId/recommend" element={<Protected><StudentOnly><TeamRecommendation /></StudentOnly></Protected>} />
      <Route path="/team/:teamId" element={<Protected><StudentOnly><ProjectWorkspace /></StudentOnly></Protected>} />
      <Route path="/teammates/:projectId" element={<Protected><StudentOnly><Teammates /></StudentOnly></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
      <Route path="/payment/success" element={<Protected><PaymentSuccess /></Protected>} />
<Route path="/payment/cancel" element={<Protected><Navigate to="/pricing" replace /></Protected>} />
    </Routes>
  )
}
