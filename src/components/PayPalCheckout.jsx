import { useEffect, useRef, useState } from 'react'
import { capturePayPalOrder, createPayPalOrder } from '../lib/events'
import { loadPayPalSdk } from '../lib/paypalSdk'

const CURRENCY = import.meta.env.VITE_EVENT_PASS_CURRENCY || 'USD'

// PayPal Smart Buttons for the one-time Event Pass fee.
// The browser only asks the server for an order and then asks it to capture it.
// The price, the verification and the "paid" status all live on the server.
export default function PayPalCheckout({ eventId, onPaid }) {
  const containerRef = useRef(null)
  const onPaidRef = useRef(onPaid)
  const [state, setState] = useState({ status: 'loading', message: '' })

  useEffect(() => {
    onPaidRef.current = onPaid
  })

  useEffect(() => {
    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID
    if (!clientId) {
      setState({ status: 'error', message: 'PayPal is not configured (missing VITE_PAYPAL_CLIENT_ID).' })
      return undefined
    }

    let cancelled = false
    let buttons = null

    loadPayPalSdk('checkout', clientId, CURRENCY)
      .then((paypal) => {
        if (cancelled || !containerRef.current) return
        buttons = paypal.Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay' },
          createOrder: async () => {
            setState({ status: 'ready', message: '' })
            const { orderId } = await createPayPalOrder(eventId)
            return orderId
          },
          onApprove: async (data) => {
            setState({ status: 'capturing', message: 'Confirming your payment...' })
            try {
              await capturePayPalOrder(data.orderID)
              onPaidRef.current?.()
            } catch (err) {
              setState({ status: 'error', message: err.message })
            }
          },
          onCancel: () => setState({ status: 'ready', message: 'Payment cancelled. You can try again whenever you like.' }),
          onError: (err) => setState({ status: 'error', message: err?.message || 'Something went wrong with PayPal.' }),
        })
        return buttons.render(containerRef.current).then(() => {
          if (!cancelled) setState({ status: 'ready', message: '' })
        })
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err.message })
      })

    return () => {
      cancelled = true
      try {
        buttons?.close()
      } catch {
        /* already closed */
      }
    }
  }, [eventId])

  return (
    <div>
      {state.status === 'loading' && <div className="skeleton h-10 w-full" />}
      <div ref={containerRef} className={state.status === 'capturing' ? 'pointer-events-none opacity-50' : ''} />
      {state.message && (
        <p className={`mt-2 text-sm ${state.status === 'error' ? 'text-danger' : 'text-muted'}`}>{state.message}</p>
      )}
    </div>
  )
}
