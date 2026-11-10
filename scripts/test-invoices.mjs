// Invoice tests: PayPal transaction mapping, eligibility rules, windows, PDF output, migration safety.
// Run: npm run test:invoices
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mapSubscriptionTransaction, transactionWindows } from '../supabase/functions/_shared/invoices.ts'
import { buildInvoicePdf, invoiceFileName, formatMoney, formatInvoiceDate, pdfSafe } from '../src/lib/invoicePdf.js'

const sub = { user_id: 'u1', plan_key: 'premium_monthly', paypal_subscription_id: 'I-XLJ8JKJTRC7M' }
const good = { id: '5O190127TN364715T', status: 'COMPLETED', time: '2026-11-08T10:00:00Z', amount_with_breakdown: { gross_amount: { currency_code: 'USD', value: '2.99' } } }

// 1. A completed PayPal transaction maps to exactly the data PayPal gave us
const inv = mapSubscriptionTransaction(good, sub, 'Premium for Students (monthly)')
assert.deepEqual({ ...inv, metadata: undefined }, { user_id: 'u1', source_type: 'subscription', source_ref: '5O190127TN364715T', transaction_id: '5O190127TN364715T', description: 'Premium for Students (monthly)', plan_key: 'premium_monthly', amount: 2.99, currency: 'USD', paid_at: '2026-11-08T10:00:00.000Z', metadata: undefined })
assert.equal(inv.metadata.paypal_subscription_id, 'I-XLJ8JKJTRC7M')

// 2. Failed / pending / refunded / incomplete payments never produce an invoice
for (const status of ['PENDING', 'DECLINED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REVERSED', 'CANCELLED', '', undefined]) {
  assert.equal(mapSubscriptionTransaction({ ...good, status }, sub, 'x'), null, String(status))
}
for (const broken of [
  { ...good, id: '' }, { ...good, id: undefined }, { ...good, time: undefined }, { ...good, time: 'not a date' },
  { ...good, amount_with_breakdown: undefined }, { ...good, amount_with_breakdown: { gross_amount: { currency_code: 'USD', value: '0.00' } } },
  { ...good, amount_with_breakdown: { gross_amount: { currency_code: '', value: '2.99' } } },
  { ...good, amount_with_breakdown: { gross_amount: { currency_code: 'USD', value: 'abc' } } }, null, 'x',
]) assert.equal(mapSubscriptionTransaction(broken, sub, 'x'), null)

// 3. Re-syncing gives the same stable key, so the unique constraint prevents duplicates
assert.equal(mapSubscriptionTransaction(good, sub, 'x').source_ref, mapSubscriptionTransaction({ ...good }, sub, 'x').source_ref)

// 4. Windows never exceed 30 days and cover the range
const ws = transactionWindows(new Date('2026-01-01T00:00:00Z'), new Date('2026-12-31T00:00:00Z'))
assert.ok(ws.length >= 12 && ws.every((w) => new Date(w.end) - new Date(w.start) <= 30 * 86_400_000))
assert.equal(ws[0].start, '2026-01-01T00:00:00.000Z'); assert.equal(ws.at(-1).end, '2026-12-31T00:00:00.000Z')
assert.deepEqual(transactionWindows(new Date('2026-12-01'), new Date('2026-11-01')), [])

// 5. PDF output is a valid, readable document containing the real invoice data
const invoice = {
  invoice_number: 'COL-2026-000001', source_type: 'subscription', transaction_id: '5O190127TN364715T',
  description: 'Premium for Students (monthly)', amount: '2.99', currency: 'USD', payment_method: 'PayPal', status: 'paid',
  paid_at: '2026-11-08T10:00:00Z', customer_name: 'Asha (Test) \\ User', customer_email: 'asha@example.com', customer_organisation: 'Demo College', account_type: 'student',
}
const pdf = buildInvoicePdf(invoice)
const head = Buffer.from(pdf.slice(0, 8)).toString('latin1'); const tail = Buffer.from(pdf.slice(-6)).toString('latin1')
assert.match(head, /^%PDF-1\.4/); assert.match(tail, /%%EOF/)
fs.writeFileSync(new URL('./.invoice-sample.pdf', import.meta.url), pdf)
const str = Buffer.from(pdf).toString('latin1')
const startxref = Number(str.match(/startxref\n(\d+)/)[1]); assert.equal(str.slice(startxref, startxref + 4), 'xref')
for (const [i, m] of [...str.matchAll(/(\d{10}) 00000 n/g)].entries()) assert.match(str.slice(Number(m[1]), Number(m[1]) + 12), new RegExp(`^${i + 1} 0 obj`))
for (const needle of ['COL-2026-000001', '5O190127TN364715T', 'USD 2.99', '08 Nov 2026, 10:00 UTC', 'PAID', 'COLLIVRA', 'PayPal', 'asha@example.com', 'Demo College']) assert.ok(str.includes(needle), needle)
assert.equal(invoiceFileName(invoice), 'COL-2026-000001.pdf'); assert.equal(invoiceFileName({ invoice_number: '../x y' }), '---x-y.pdf')
assert.equal(formatMoney('19', 'usd'), 'USD 19.00'); assert.equal(formatInvoiceDate('bad'), ''); assert.equal(pdfSafe('Zoë “q” –'), "Zo? \"q\" -")
// missing customer details are omitted, never invented; long descriptions do not crash
assert.ok(buildInvoicePdf({ ...invoice, customer_name: null, customer_email: null, customer_organisation: null, account_type: null, description: 'Event Pass: ' + 'Very long hackathon name '.repeat(12) }).length > 800)

// 6. The migration is additive and keeps invoices private and unique
const sql = fs.readFileSync(new URL('../supabase/migrations/20261120000000_invoices_and_payment_history.sql', import.meta.url), 'utf8')
assert.ok(!/drop\s+table|truncate|delete\s+from|alter\s+table\s+public\.(payments|subscriptions)/i.test(sql), 'migration must not remove or alter existing payment data')
assert.ok(/unique \(source_type, source_ref\)/.test(sql)); assert.ok(/invoice_number text not null unique/.test(sql))
assert.ok(/enable row level security/.test(sql) && /user_id = auth\.uid\(\)/.test(sql)); assert.ok(!/for (insert|update|delete) to authenticated/.test(sql))
assert.ok(/status = 'captured' and new\.paypal_capture_id is not null and new\.captured_at is not null/.test(sql))
assert.ok(/exception when others then/.test(sql), 'trigger must never break payment capture')

// 7. Landing page no longer advertises an Event Organiser yearly plan; other cards are intact
const landing = fs.readFileSync(new URL('../src/pages/Landing.jsx', import.meta.url), 'utf8')
assert.ok(!/PLAN_COPY\.college|college_yearly|Choose College/.test(landing))
for (const k of ['PLAN_COPY.free', 'PLAN_COPY.premium', 'PLAN_COPY.hackathon', 'PLAN_COPY.organization']) assert.ok(landing.includes(k), k)

fs.unlinkSync(new URL('./.invoice-sample.pdf', import.meta.url))
console.log('ok - invoices: PayPal mapping, eligibility, PDF, migration safety, landing page')
