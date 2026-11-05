// Minimal PayPal REST client (Orders v2 + Subscriptions v1). Server-side only.
//
// PAYPAL_ENV=sandbox (default) uses fake money. Live requires PAYPAL_ENV=live explicitly.
// Money flows one way only: the organizer pays COLLIVRA. No payouts are implemented.

export class PayPalError extends Error {
  status: number
  issue: string
  debugId: string
  constructor(status: number, message: string, issue = '', debugId = '') {
    super(message)
    this.status = status
    this.issue = issue
    this.debugId = debugId
  }
}

export const IS_LIVE = (Deno.env.get('PAYPAL_ENV') ?? 'sandbox') === 'live'
const BASE = IS_LIVE ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

export const EVENT_PASS_CURRENCY = (Deno.env.get('EVENT_PASS_CURRENCY') ?? 'USD').toUpperCase()

async function accessToken(): Promise<string> {
  const id = Deno.env.get('PAYPAL_CLIENT_ID')
  const secret = Deno.env.get('PAYPAL_CLIENT_SECRET')
  if (!id || !secret) throw new PayPalError(500, 'PayPal credentials are not configured on the server.')
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  if (!res.ok) throw new PayPalError(res.status, data?.error_description || 'PayPal authentication failed.')
  return data.access_token
}

async function paypalFetch(
  path: string,
  init: { method: string; body?: unknown; requestId?: string; mockCode?: string },
) {
  const token = await accessToken()
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}),
      // Sandbox-only negative testing: PayPal returns this error instead of processing the call.
      ...(!IS_LIVE && init.mockCode ? { 'PayPal-Mock-Response': JSON.stringify({ mock_application_codes: init.mockCode }) } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const issue = data?.details?.[0]?.issue ?? data?.name ?? ''
    const detail = data?.details?.[0]?.description
    const debugId = String(data?.debug_id ?? '')
    // PayPal support asks for the debug_id, so keep it in the server logs.
    console.error(`PayPal ${init.method} ${path} failed: ${res.status} ${issue} debug_id=${debugId}`)
    throw new PayPalError(res.status, [data?.message, detail].filter(Boolean).join(' - ') || 'PayPal request failed.', issue, debugId)
  }
  return data
}

// ---------------------------------------------------------------------------
// Orders (checkout button)
// ---------------------------------------------------------------------------
export function createOrder(params: {
  eventId: string
  eventName: string
  amount: string
  requestId: string
}) {
  return paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    requestId: params.requestId,
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.eventId,
          custom_id: params.eventId,
          description: `COLLIVRA Event Pass: ${params.eventName}`.slice(0, 127),
          amount: { currency_code: EVENT_PASS_CURRENCY, value: params.amount },
        },
      ],
    },
  })
}

export function captureOrder(orderId: string) {
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    requestId: `capture-${orderId}`,
    body: {},
    // e.g. PAYPAL_MOCK_CAPTURE_ERROR=INSTRUMENT_DECLINED to demo a declined card (sandbox only).
    mockCode: Deno.env.get('PAYPAL_MOCK_CAPTURE_ERROR') || undefined,
  })
}

export function getOrder(orderId: string) {
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'GET' })
}

// ---------------------------------------------------------------------------
// Subscriptions (student Premium and College plans)
// ---------------------------------------------------------------------------
export function getSubscription(subscriptionId: string) {
  return paypalFetch(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET' })
}
export function createSubscription(params: {
  planId: string
  userId: string
  returnUrl: string
  cancelUrl: string
  requestId: string
}) {
  return paypalFetch('/v1/billing/subscriptions', {
    method: 'POST',
    requestId: params.requestId,
    body: {
      plan_id: params.planId,
      custom_id: params.userId,
      application_context: {
        brand_name: 'COLLIVRA',
        user_action: 'SUBSCRIBE_NOW',
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    },
  })
}
export function cancelSubscription(subscriptionId: string, reason: string) {
  return paypalFetch(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: 'POST',
    body: { reason: reason.slice(0, 128) },
  })
}
