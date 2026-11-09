import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { listInvoices, syncInvoices } from '../lib/invoices'
import { downloadInvoicePdf, formatInvoiceDate, formatMoney, SOURCE_LABEL, ACCOUNT_LABEL } from '../lib/invoicePdf'

function InvoiceView({ invoice, onClose, onDownload }) {
  const rows = [
    ['Invoice number', invoice.invoice_number],
    ['Payment date', formatInvoiceDate(invoice.paid_at)],
    ['Description', invoice.description],
    ['Type', SOURCE_LABEL[invoice.source_type] || 'Payment'],
    ['Amount', formatMoney(invoice.amount, invoice.currency)],
    ['Currency', invoice.currency],
    ['Payment method', invoice.payment_method || 'PayPal'],
    ['Status', 'Paid'],
    ['PayPal transaction ID', invoice.transaction_id],
  ]
  const billed = [invoice.customer_name, invoice.customer_organisation, invoice.customer_email, ACCOUNT_LABEL[invoice.account_type]].filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Invoice ${invoice.invoice_number}`} onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between rounded-t-2xl bg-primary px-6 py-5 text-white">
          <div>
            <p className="font-display text-xl font-bold tracking-wide">COLLIVRA</p>
            <p className="text-xs text-white/75">Smart team building for student projects</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">INVOICE</p>
            <p className="text-xs text-white/85">{invoice.invoice_number}</p>
          </div>
        </div>
        <div className="space-y-5 px-6 py-5">
          {billed.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Billed to</p>
              {billed.map((line, i) => <p key={line} className={`text-sm ${i === 0 ? 'font-semibold text-text' : 'text-textSecondary'}`}>{line}</p>)}
            </div>
          )}
          <dl className="divide-y divide-border rounded-xl border border-border text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="break-all text-right font-medium text-text">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-borderStrong px-4 py-2 text-sm font-semibold text-text hover:bg-surface2">Close</button>
            <button onClick={() => onDownload(invoice)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover">Download PDF</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Payment history for the signed-in user (students and event organisers alike).
// Reads only the user's own invoices (row level security) and asks the server to import any
// PayPal subscription payments that do not have an invoice yet.
export default function PaymentHistory() {
  const { user } = useAuth()
  const userId = user?.id
  const [invoices, setInvoices] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState(null)
  const [downloadError, setDownloadError] = useState('')
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    if (!userId) return
    const mine = ++requestRef.current
    try {
      const rows = await listInvoices(userId)
      if (mine === requestRef.current) { setInvoices(rows); setError('') }
    } catch (err) {
      if (mine === requestRef.current) setError(err.message)
    }
  }, [userId])

  const sync = useCallback(async ({ quiet = false } = {}) => {
    setSyncing(true)
    if (!quiet) setNotice('')
    try {
      const result = await syncInvoices()
      if (!quiet) {
        setNotice(result?.problems?.length ? result.problems.join(' ') : result?.created ? `${result.created} new invoice${result.created === 1 ? '' : 's'} added.` : 'Your payment history is up to date.')
      }
    } catch (err) {
      // The list below still shows every invoice that already exists.
      if (!quiet) setNotice(`Could not check PayPal for new payments: ${err.message}`)
    }
    await load()
    setSyncing(false)
  }, [load])

  useEffect(() => {
    // Show existing invoices straight away, then check PayPal for subscription payments in the background.
    load().then(() => sync({ quiet: true }))
  }, [load, sync])

  function handleDownload(invoice) {
    setDownloadError('')
    try {
      downloadInvoicePdf(invoice)
    } catch (err) {
      setDownloadError(err.message || 'Could not create the PDF.')
    }
  }

  return (
    <section aria-labelledby="payment-history-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="payment-history-title" className="text-xl font-bold text-text">Payment history &amp; invoices</h2>
          <p className="mt-0.5 text-sm text-textSecondary">Every successful PayPal payment on your account. Download an invoice again whenever you need it.</p>
        </div>
        <button onClick={() => sync()} disabled={syncing} className="rounded-lg border border-borderStrong px-3.5 py-2 text-xs font-semibold text-text hover:bg-surface2 disabled:opacity-50">
          {syncing ? 'Checking PayPal...' : 'Check for new payments'}
        </button>
      </div>

      {notice && <p role="status" className="mt-3 rounded-lg bg-accent/10 px-4 py-2.5 text-sm text-accent">{notice}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
      {downloadError && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger">{downloadError}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {invoices === null && !error && <div className="skeleton m-4 h-24" />}
        {invoices && invoices.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-muted">No successful payments yet. Invoices appear here automatically after a payment is confirmed by PayPal.</p>
        )}
        {invoices && invoices.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-surface2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">PayPal reference</th>
                  <th className="px-4 py-3 text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-text">{inv.invoice_number}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-textSecondary">{formatInvoiceDate(inv.paid_at, false)}</td>
                    <td className="px-4 py-3 text-text">{inv.description}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-text">{formatMoney(inv.amount, inv.currency)}</td>
                    <td className="px-4 py-3 text-textSecondary">{inv.payment_method || 'PayPal'}</td>
                    <td className="px-4 py-3"><span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">Paid</span></td>
                    <td className="break-all px-4 py-3 font-mono text-xs text-textSecondary">{inv.transaction_id}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => setSelected(inv)} className="mr-2 rounded-md border border-borderStrong px-2.5 py-1 text-xs font-semibold text-text hover:bg-surface2">View</button>
                      <button onClick={() => handleDownload(inv)} className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primaryHover">PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <InvoiceView invoice={selected} onClose={() => setSelected(null)} onDownload={handleDownload} />}
    </section>
  )
}
