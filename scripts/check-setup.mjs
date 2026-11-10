// Checks your local setup WITHOUT printing any secret values. Run: npm run check:setup
import fs from 'node:fs'

function parseEnv(path) {
  if (!fs.existsSync(path)) return null
  const out = {}
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role
  } catch {
    return null
  }
}

let problems = 0
let warnings = 0
const bad = (msg) => (problems++, console.log(`  FAIL  ${msg}`))
const warn = (msg) => (warnings++, console.log(`  WARN  ${msg}`))
const good = (msg) => console.log(`  ok    ${msg}`)

console.log('\nFrontend (.env)')
const fe = parseEnv('.env')
if (!fe) {
  bad('.env not found. Copy .env.example to .env and fill it in.')
} else {
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_PAYPAL_CLIENT_ID']) {
    fe[key] ? good(`${key} is set`) : bad(`${key} is empty`)
  }
  if (fe.VITE_SUPABASE_ANON_KEY && jwtRole(fe.VITE_SUPABASE_ANON_KEY) === 'service_role') {
    bad('VITE_SUPABASE_ANON_KEY is a service_role key. Use the anon/publishable key. Never put service_role in the frontend.')
  }
  if (fe.VITE_SUPABASE_URL && !/^https:\/\/.+\.supabase\.co/.test(fe.VITE_SUPABASE_URL)) {
    warn('VITE_SUPABASE_URL does not look like https://<project>.supabase.co')
  }
}

console.log('\nEdge function secrets (supabase/functions.env)')
const fn = parseEnv('supabase/functions.env')
if (!fn) {
  bad('supabase/functions.env not found. Copy supabase/functions.env.example and fill it in.')
} else {
  for (const key of ['GEMINI_API_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']) {
    fn[key] ? good(`${key} is set`) : bad(`${key} is empty`)
  }
  if ((fn.PAYPAL_ENV || 'sandbox') !== 'sandbox') warn('PAYPAL_ENV is not "sandbox". Real money would be used.')
  else good('PAYPAL_ENV is sandbox (fake money)')
  for (const key of ['PAYPAL_PLAN_PREMIUM_MONTHLY', 'PAYPAL_PLAN_PREMIUM_YEARLY', 'PAYPAL_PLAN_INSTITUTION_MONTHLY', 'PAYPAL_PLAN_INSTITUTION_YEARLY', 'PAYPAL_PLAN_ORGANISATION_MONTHLY', 'PAYPAL_PLAN_ORGANISATION_YEARLY']) {
    fn[key] ? good(`${key} is set`) : warn(`${key} is empty. Run: npm.cmd run setup:plans`)
  }
  if (fn.PAYPAL_PLAN_PREMIUM_YEARLY_V2 && fn.PAYPAL_PLAN_PREMIUM_YEARLY && fn.PAYPAL_PLAN_PREMIUM_YEARLY_V2 !== fn.PAYPAL_PLAN_PREMIUM_YEARLY) {
    warn('PAYPAL_PLAN_PREMIUM_YEARLY_V2 differs from the current yearly plan. Check whether a legacy subscription still uses it.')
  }
  if (fn.PAYPAL_MOCK_CAPTURE_ERROR) warn(`PAYPAL_MOCK_CAPTURE_ERROR=${fn.PAYPAL_MOCK_CAPTURE_ERROR} makes payments fail on purpose. Clear it for normal use.`)
  if (fe?.VITE_PAYPAL_CLIENT_ID && fn.PAYPAL_CLIENT_ID && fe.VITE_PAYPAL_CLIENT_ID !== fn.PAYPAL_CLIENT_ID) {
    bad('VITE_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_ID differ. They must come from the SAME PayPal app.')
  }
}

console.log(`\n${problems} problem(s), ${warnings} warning(s).\n`)
process.exit(problems ? 1 : 0)
