import Navbar from './Navbar'
import Sidebar, { MobileNav } from './Sidebar'

export default function AppShell({ breadcrumb, children }) {
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />
      <Navbar breadcrumb={breadcrumb} />
      <main className="animate-fade-in pb-20 md:ml-[230px] md:pb-0">{children}</main>
      <MobileNav />
    </div>
  )
}
