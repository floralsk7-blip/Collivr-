// Tests for the checks that decide whether PayPal money unlocks anything. Run: npm run test:payments
import assert from 'node:assert/strict'
import { verifySubscription, verifyCapture } from '../supabase/functions/_shared/paymentChecks.ts'

const PLAN = 'P-PREMIUM-MONTHLY'
const USER = '11111111-1111-1111-1111-111111111111'
const sub = (over = {}) => ({ id: 'I-ABC', plan_id: PLAN, custom_id: USER, status: 'ACTIVE', billing_info: { next_billing_time: '2026-12-02T10:00:00Z' }, ...over })

// --- subscriptions ---
assert.deepEqual(verifySubscription(sub(), PLAN, USER), { result: 'active', accessUntil: '2026-12-02T10:00:00Z' })
assert.equal(verifySubscription(sub({ billing_info: undefined }), PLAN, USER).accessUntil, null)
// wrong plan: someone subscribed to a cheaper plan and claims the expensive one
let v = verifySubscription(sub({ plan_id: 'P-CHEAP' }), PLAN, USER)
assert.equal(v.result, 'reject'); assert.equal(v.status, 402)
// someone else's subscription id
v = verifySubscription(sub({ custom_id: '22222222-2222-2222-2222-222222222222' }), PLAN, USER)
assert.equal(v.result, 'reject'); assert.equal(v.status, 403)
v = verifySubscription(sub({ custom_id: undefined }), PLAN, USER)
assert.equal(v.result, 'reject'); assert.equal(v.status, 403)
// not paid yet
assert.equal(verifySubscription(sub({ status: 'APPROVAL_PENDING' }), PLAN, USER).result, 'pending')
assert.equal(verifySubscription(sub({ status: 'APPROVED' }), PLAN, USER).result, 'pending')
// never unlocks
for (const status of ['SUSPENDED', 'CANCELLED', 'EXPIRED', '', undefined]) {
  assert.equal(verifySubscription(sub({ status }), PLAN, USER).result, 'reject', String(status))
}
assert.equal(verifySubscription(null, PLAN, USER).result, 'reject')
assert.equal(verifySubscription('nonsense', PLAN, USER).result, 'reject')

// --- Event Pass capture ---
const EVENT = '33333333-3333-3333-3333-333333333333'
const expected = { event_id: EVENT, amount: '19.00', currency: 'USD' }
const cap = (over = {}, amount = { currency_code: 'USD', value: '19.00' }) => ({
  status: 'COMPLETED',
  purchase_units: [{ custom_id: EVENT, payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', custom_id: EVENT, amount, ...over }] } }],
})
assert.deepEqual(verifyCapture(cap(), expected), [])
assert.deepEqual(verifyCapture(cap({}, { currency_code: 'USD', value: '19' }), { ...expected, amount: 19 }), []) // numeric compare
// underpaid, wrong currency, wrong event, pending capture, not completed order
assert.deepEqual(verifyCapture(cap({}, { currency_code: 'USD', value: '1.00' }), expected), ['amount mismatch'])
assert.deepEqual(verifyCapture(cap({}, { currency_code: 'EUR', value: '19.00' }), expected), ['currency mismatch'])
assert.deepEqual(verifyCapture(cap({ custom_id: 'other' }), expected), ['event mismatch'])
assert.ok(verifyCapture(cap({ status: 'PENDING' }), expected).includes('capture not completed'))
assert.ok(verifyCapture({ ...cap(), status: 'APPROVED' }, expected).includes('order not completed'))
// garbage in, failures out (never an exception, never an empty list)
assert.ok(verifyCapture(undefined, expected).length >= 4)
assert.ok(verifyCapture({}, expected).length >= 4)

console.log('ok - subscription and payment verification (including tampered responses)')
