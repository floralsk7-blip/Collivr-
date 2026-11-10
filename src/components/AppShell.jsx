import Navbar from './Navbar'
import Sidebar, { MobileNav } from './Sidebar'
import { isDevMode } from '../lib/supabaseClient'

export default function AppShell({ breadcrumb, children }) {
  return (
    <div className="min-h-screen bg-bg">
      {isDevMode && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-center text-xs font-medium text-amber-800 dark:text-amber-300 md:ml-[230px]">
          <span className="font-semibold">[Local Dev Mode]</span> Using mock service layer. To connect to a live Supabase backend, set credentials in <code className="rounded bg-surface px-1">.env</code>.
        </div>
      )}
      <Sidebar />
      <Navbar breadcrumb={breadcrumb} />
      <main className="animate-fade-in pb-20 md:ml-[230px] md:pb-0">{children}</main>
      <MobileNav />
    </div>
  )
}
