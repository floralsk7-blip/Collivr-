// Create COLLIVRA subscription plans in PayPal SANDBOX and write their IDs to
// supabase/functions.env. Requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.
// Run: npm run setup:plans
// Re-running is safe: populated IDs are retained. Pass --force to create replacements.
import fs from 'node:fs'

const FILE = 'supabase/functions.env'
const force = process.argv.includes('--force')
const PLANS = [
  { envVar: 'PAYPAL_PLAN_PREMIUM_MONTHLY', name: 'COLLIVRA Student Premium Monthly', price: '2.99', unit: 'MONTH' },
  { envVar: 'PAYPAL_PLAN_PREMIUM_YEARLY', name: 'COLLIVRA Student Premium Yearly', price: '24.99', unit: 'YEAR' },
  { envVar: 'PAYPAL_PLAN_INSTITUTION_MONTHLY', name: 'COLLIVRA Institution Monthly', price: '19.00', unit: 'MONTH' },
  { envVar: 'PAYPAL_PLAN_INSTITUTION_YEARLY', name: 'COLLIVRA Institution Yearly', price: '190.00', unit: 'YEAR' },
  { envVar: 'PAYPAL_PLAN_ORGANISATION_MONTHLY', name: 'COLLIVRA Organisation Monthly', price: '29.00', unit: 'MONTH' },
  { envVar: 'PAYPAL_PLAN_ORGANISATION_YEARLY', name: 'COLLIVRA Organisation Yearly', price: '290.00', unit: 'YEAR' },
]

if (!fs.existsSync(FILE)) {
  console.error(`Missing ${FILE}. Copy supabase/functions.env.example to it and fill in the PayPal keys first.`)
  process.exit(1)
}

const lines = fs.readFileSync(FILE, 'utf8').split(/\r?\n/)
const env = {}
for (const line of lines) {
  const m = line.match(/^[ \t]*([A-Z0-9_]+)[ \t]*=[ \t]*(.*?)[ \t]*$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

if ((env.PAYPAL_ENV || 'sandbox').toLowerCase() !== 'sandbox') {
  console.error('Refusing to create plans: PAYPAL_ENV must be sandbox. This script never creates Live plans.')
  process.exit(1)
}
if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
  console.error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be filled in first.')
  process.exit(1)
}

const BASE = 'https://api-m.sandbox.paypal.com'
const currency = (env.EVENT_PASS_CURRENCY || 'USD').toUpperCase()
if (!/^[A-Z]{3}$/.test(currency)) throw new Error('EVENT_PASS_CURRENCY must be a 3-letter currency code.')

async function request(path, token, body, requestId) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${data.message || data.name || 'unknown error'}; debug_id=${data.debug_id || 'n/a'}`)
  }
  return data
}

function setVar(name, value) {
  const index = lines.findIndex((line) => new RegExp(`^[ \\t]*${name}[ \\t]*=`).test(line))
  if (index >= 0) lines[index] = `${name}=${value}`
  else lines.push(`${name}=${value}`)
}

function saveEnv() {
  fs.writeFileSync(FILE, `${lines.join('\n').replace(/\n*$/, '')}\n`, { mode: 0o600 })
}

const tokenResponse = await fetch(`${BASE}/v1/oauth2/token`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
})
const tokenData = await tokenResponse.json().catch(() => ({}))
if (!tokenResponse.ok || !tokenData.access_token) {
  console.error('PayPal rejected the Sandbox Client ID / Secret:', tokenData.error_description || tokenData.error || 'No access token returned')
  process.exit(1)
}
const token = tokenData.access_token
const todo = PLANS.filter((plan) => force || !env[plan.envVar])

if (todo.length === 0) {
  console.log('All six Sandbox plan IDs are already present. No plans were created.')
} else {
  const product = await request('/v1/catalogs/products', token, {
    name: 'COLLIVRA Subscriptions',
    description: 'Student Premium, Institution and Organisation recurring subscriptions for COLLIVRA.',
    type: 'SERVICE',
    category: 'SOFTWARE',
  }, `collivra-subscription-product-${Date.now()}`)
  if (!product.id) throw new Error('PayPal created a product but did not return a product ID.')
  console.log(`Created PayPal Sandbox product: ${product.id}`)

  for (const [index, plan] of todo.entries()) {
    const created = await request('/v1/billing/plans', token, {
      product_id: product.id,
      name: plan.name,
      description: `${plan.name} subscription for COLLIVRA.`,
      status: 'ACTIVE',
      billing_cycles: [{
        frequency: { interval_unit: plan.unit, interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: plan.price, currency_code: currency } },
      }],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    }, `collivra-${plan.envVar.toLowerCase()}-${Date.now()}-${index}`)
    if (!created.id) throw new Error(`PayPal did not return a Plan ID for ${plan.envVar}.`)
    setVar(plan.envVar, created.id)
    saveEnv() // Persist each successful creation so a later API failure cannot lose its ID.
    console.log(`${plan.envVar}=${created.id} (${currency} ${plan.price}/${plan.unit.toLowerCase()})`)
  }
}

// Compatibility aliases: older code/configs used these names. Both point to
// the current Student yearly / Institution yearly plan; they are not extra plans.
const values = Object.fromEntries(lines.map((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
  return match ? [match[1], match[2]] : []
}))
if (values.PAYPAL_PLAN_PREMIUM_YEARLY) setVar('PAYPAL_PLAN_PREMIUM_YEARLY_V2', values.PAYPAL_PLAN_PREMIUM_YEARLY)
if (values.PAYPAL_PLAN_INSTITUTION_YEARLY) setVar('PAYPAL_PLAN_COLLEGE_YEARLY', values.PAYPAL_PLAN_INSTITUTION_YEARLY)

saveEnv()
console.log(`\nSaved PayPal Sandbox Plan IDs to ${FILE}.`)
console.log('Next: deploy these secrets with:')
console.log('  npx.cmd supabase secrets set --env-file supabase/functions.env')
console.log('Then redeploy the subscription-manage Edge Function.')
