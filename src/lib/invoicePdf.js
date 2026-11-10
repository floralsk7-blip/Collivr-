// Dependency-free invoice PDF writer (PDF 1.4, A4, built-in Helvetica fonts).
// It renders ONLY the fields of an invoice row that the database already holds; it never
// computes or invents payment data. Works in the browser and in Node (used by the tests).

const W = 595.28
const H = 841.89
const MARGIN = 48
const BRAND = [0.184, 0.42, 0.31] // COLLIVRA green
const INK = [0.12, 0.14, 0.13]
const MUTED = [0.42, 0.45, 0.43]
const SOFT = [0.95, 0.94, 0.9]

// Helvetica glyph widths for ASCII 32..126 (1000 units per em).
const REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584]
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]

// Keep text inside what the built-in fonts can print; unsupported characters become '?'.
export function pdfSafe(value) {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
}

function textWidth(text, size, bold = false) {
  const table = bold ? BOLD : REG
  let units = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    units += code >= 32 && code <= 126 ? table[code - 32] : 556
  }
  return (units * size) / 1000
}

function wrap(text, size, maxWidth, bold = false) {
  const words = pdfSafe(text).split(' ').filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    let w = word
    // break a single very long token (for example a long id) so it never overflows
    while (textWidth(w, size, bold) > maxWidth) {
      let cut = w.length
      while (cut > 1 && textWidth(w.slice(0, cut), size, bold) > maxWidth) cut -= 1
      if (line) { lines.push(line); line = '' }
      lines.push(w.slice(0, cut))
      w = w.slice(cut)
    }
    const next = line ? `${line} ${w}` : w
    if (textWidth(next, size, bold) <= maxWidth) line = next
    else { lines.push(line); line = w }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
const num = (n) => (Math.round(n * 100) / 100).toString()
const rgb = (c) => c.map((v) => v.toFixed(3)).join(' ')

export function formatMoney(amount, currency) {
  return `${String(currency || '').toUpperCase()} ${Number(amount).toFixed(2)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Always UTC so the same invoice prints identically for everyone, every time.
export function formatInvoiceDate(iso, withTime = true) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  const date = `${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  return withTime ? `${date}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC` : date
}

export const SOURCE_LABEL = { event_pass: 'Event Pass (one-time payment)', subscription: 'Subscription payment' }
export const ACCOUNT_LABEL = { student: 'Student account', organiser: 'Event Organiser account' }

export function invoiceFileName(invoice) {
  return `${String(invoice.invoice_number || 'invoice').replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`
}

export function buildInvoicePdf(invoice) {
  const ops = []
  const fill = (c) => ops.push(`${rgb(c)} rg`)
  const rect = (x, y, w, h, c) => { fill(c); ops.push(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`) }
  const line = (x1, y1, x2, y2, c = [0.85, 0.85, 0.82]) => ops.push(`${rgb(c)} RG 0.6 w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`)
  const text = (str, x, y, { size = 10, bold = false, color = INK, align = 'left' } = {}) => {
    const s = pdfSafe(str)
    const w = textWidth(s, size, bold)
    const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    fill(color)
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${num(px)} ${num(y)} Td (${esc(s)}) Tj ET`)
  }

  // Header band with the COLLIVRA wordmark.
  rect(0, H - 110, W, 110, BRAND)
  text('COLLIVRA', MARGIN, H - 58, { size: 28, bold: true, color: [1, 1, 1] })
  text('Smart team building for student projects', MARGIN, H - 76, { size: 9, color: [0.86, 0.93, 0.89] })
  text('INVOICE', W - MARGIN, H - 54, { size: 22, bold: true, color: [1, 1, 1], align: 'right' })
  text(invoice.invoice_number, W - MARGIN, H - 74, { size: 11, color: [1, 1, 1], align: 'right' })

  // Billed to / invoice details
  let y = H - 150
  text('BILLED TO', MARGIN, y, { size: 8, bold: true, color: MUTED })
  text('INVOICE DETAILS', 330, y, { size: 8, bold: true, color: MUTED })
  let left = y - 18
  const billed = [
    [invoice.customer_name, true],
    [invoice.customer_organisation, false],
    [invoice.customer_email, false],
    [ACCOUNT_LABEL[invoice.account_type] || null, false],
  ].filter(([v]) => v)
  if (billed.length === 0) billed.push(['COLLIVRA account holder', true])
  for (const [value, bold] of billed) {
    for (const part of wrap(value, 10.5, 250, bold)) { text(part, MARGIN, left, { size: 10.5, bold }); left -= 15 }
  }
  const details = [
    ['Invoice number', invoice.invoice_number],
    ['Payment date', formatInvoiceDate(invoice.paid_at)],
    ['Status', 'PAID'],
    ['Payment method', invoice.payment_method || 'PayPal'],
  ]
  let right = y - 18
  for (const [label, value] of details) {
    text(label, 330, right, { size: 9, color: MUTED })
    text(value, W - MARGIN, right, { size: 9.5, bold: label === 'Status', color: label === 'Status' ? BRAND : INK, align: 'right' })
    right -= 15
  }

  // Line items
  y = Math.min(left, right) - 26
  rect(MARGIN, y - 6, W - 2 * MARGIN, 24, SOFT)
  text('DESCRIPTION', MARGIN + 10, y + 2, { size: 8, bold: true, color: MUTED })
  text('AMOUNT', W - MARGIN - 10, y + 2, { size: 8, bold: true, color: MUTED, align: 'right' })
  y -= 28
  text(formatMoney(invoice.amount, invoice.currency), W - MARGIN - 10, y, { size: 11, align: 'right' })
  for (const part of wrap(invoice.description, 11, 340, true)) { text(part, MARGIN + 10, y, { size: 11, bold: true }); y -= 15 }
  text(SOURCE_LABEL[invoice.source_type] || 'Payment', MARGIN + 10, y, { size: 9, color: MUTED })
  y -= 18
  line(MARGIN, y, W - MARGIN, y)

  // Total
  y -= 26
  text('Total paid', W - MARGIN - 150, y, { size: 11, bold: true })
  text(formatMoney(invoice.amount, invoice.currency), W - MARGIN - 10, y, { size: 14, bold: true, color: BRAND, align: 'right' })
  y -= 12
  line(W - MARGIN - 200, y, W - MARGIN, y)

  // Payment reference
  y -= 44
  rect(MARGIN, y - 54, W - 2 * MARGIN, 76, SOFT)
  text('PAYMENT REFERENCE', MARGIN + 12, y + 8, { size: 8, bold: true, color: MUTED })
  text('PayPal transaction ID', MARGIN + 12, y - 12, { size: 9, color: MUTED })
  text(invoice.transaction_id, MARGIN + 140, y - 12, { size: 10, bold: true })
  text('Currency', MARGIN + 12, y - 30, { size: 9, color: MUTED })
  text(String(invoice.currency || '').toUpperCase(), MARGIN + 140, y - 30, { size: 10 })
  text('Payment status', MARGIN + 12, y - 46, { size: 9, color: MUTED })
  text('Paid (verified with PayPal)', MARGIN + 140, y - 46, { size: 10 })

  // Footer
  line(MARGIN, 90, W - MARGIN, 90)
  text('This invoice was issued by COLLIVRA for a payment that PayPal confirmed as completed.', MARGIN, 72, { size: 8.5, color: MUTED })
  text('Payments are processed by PayPal. Keep this invoice for your records. You can download it again at any time from Plans & Billing.', MARGIN, 60, { size: 8.5, color: MUTED })
  text(`${invoice.invoice_number}  |  COLLIVRA`, W - MARGIN, 40, { size: 8, color: MUTED, align: 'right' })

  return assemblePdf(ops.join('\n'))
}

function assemblePdf(content) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 0xff
  return bytes
}

export function downloadInvoicePdf(invoice) {
  const blob = new Blob([buildInvoicePdf(invoice)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = invoiceFileName(invoice)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
