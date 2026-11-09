import AppShell from '../components/AppShell'
import PaymentHistory from '../components/PaymentHistory'

export default function Invoices() {
  return (
    <AppShell breadcrumb={<span>Invoices</span>}>
      <div className="mx-auto max-w-content px-6 py-8 md:px-9">
        <h1 className="text-3xl font-bold text-text">My invoices</h1>
        <div className="mt-6">
          <PaymentHistory />
        </div>
      </div>
    </AppShell>
  )
}
