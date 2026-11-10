
import { useEffect, useRef, useState } from 'react'
import { loadPayPalSdk } from '../lib/paypalSdk'
import {
  createSubscription,
  activateSubscription,
} from '../lib/subscriptions'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default function PayPalSubscribe({
  planKey,
  planId,
  userId,
  onActivated,
}) {
  const containerRef = useRef(null)
  const callbackRef = useRef(onActivated)
  const [state, setState] = useState({
    status: 'loading',
    message: '',
  })

  useEffect(() => {
    callbackRef.current = onActivated
  }, [onActivated])

  useEffect(() => {
    let cancelled = false
    let buttons = null

    loadPayPalSdk(
      'subscription',
      import.meta.env.VITE_PAYPAL_CLIENT_ID,
      import.meta.env.VITE_EVENT_PASS_CURRENCY || 'USD'
    )
      .then((paypal) => {
        if (cancelled || !containerRef.current) return

        buttons = paypal.Buttons({
          style: {
            layout: 'vertical',
            shape: 'rect',
            color: 'gold',
            label: 'subscribe',
          },

          createSubscription: async () => {
            const result = await createSubscription(planKey)

            if (!result?.subscriptionId) {
              throw new Error('PayPal did not create a subscription.')
            }

            return result.subscriptionId
          },

          onApprove: async (data) => {
            setState({
              status: 'working',
              message: 'Confirming your subscription...',
            })

            try {
              let result = await activateSubscription(
                data.subscriptionID,
                planKey
              )

              for (let i = 0; result.pending && i < 5; i++) {
                await sleep(3000)
                result = await activateSubscription(
                  data.subscriptionID,
                  planKey
                )
              }

              if (cancelled) return

              setState({
                status: 'ready',
                message: result.pending
                  ? 'PayPal is still processing. Please refresh shortly.'
                  : '',
              })

              callbackRef.current?.()
            } catch (err) {
              if (!cancelled) {
                setState({
                  status: 'error',
                  message: err.message || 'Subscription verification failed.',
                })
              }
            }
          },

          onCancel: () => {
            setState({
              status: 'ready',
              message: 'Checkout cancelled. You were not charged.',
            })
          },

          onError: (err) => {
            setState({
              status: 'error',
              message: err?.message || 'Something went wrong with PayPal.',
            })
          },
        })

        return buttons.render(containerRef.current).then(() => {
          if (!cancelled) {
            setState({ status: 'ready', message: '' })
          }
        })
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err.message || 'Unable to load PayPal.',
          })
        }
      })

    return () => {
      cancelled = true
      try {
        buttons?.close()
      } catch {
        // PayPal button already closed.
      }
    }
  }, [planKey, planId, userId])

  return (
    <div>
      {state.status === 'loading' && (
        <div className="skeleton h-10 w-full" />
      )}

      <div
        ref={containerRef}
        className={
          state.status === 'working'
            ? 'pointer-events-none opacity-50'
            : ''
        }
      />

      {state.message && (
        <p
          className={`mt-2 text-xs ${
            state.status === 'error' ? 'text-danger' : 'text-muted'
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  )
}
