import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { activateSubscription, syncSubscription } from '../lib/subscriptions'
import { useSubscription } from '../hooks/useSubscription'

export default function PaymentSuccess() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState('Verifying your PayPal subscription...')
  const [error, setError] = useState('')
  const { apply, refresh } = useSubscription()

  useEffect(() => {
    let cancelled = false

    async function verify() {
      const subscriptionId = params.get('subscription_id')
      const planKey = params.get('planKey')

      if (!subscriptionId || !planKey) {
        setError('Missing subscription details. Please contact support.')
        return
      }

      try {
        let result = await activateSubscription(subscriptionId, planKey)

        for (let i = 0; result.pending && i < 5; i++) {
          if (cancelled) return
          setMessage('PayPal is confirming your subscription...')
          await new Promise(resolve => setTimeout(resolve, 3000))
          const synced = await syncSubscription()
          if (synced?.entitlement?.tier && synced.entitlement.tier !== 'free') apply(synced.entitlement)
          result = await activateSubscription(subscriptionId, planKey)
        }

        // Publish the authoritative entitlement to the whole app straight away, then confirm.
        if (result.entitlement) apply(result.entitlement)
        refresh()

        if (cancelled) return

        if (result.pending) {
          setMessage('Your payment is still processing. Please check your subscription status shortly.')
        } else {
          setMessage('Your subscription is active! Welcome to COLLIVRA Premium.')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Subscription verification failed.')
      }
    }

    verify()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-center">
      <h1 className="text-2xl font-bold">COLLIVRA Subscription</h1>
      {error ? (
        <p className="mt-4 text-danger">{error}</p>
      ) : (
        <p className="mt-4">{message}</p>
      )}
      <button
        onClick={() => navigate('/pricing')}
        className="mt-6 rounded-lg bg-primary px-6 py-3 text-white"
      >
        Back to Pricing
      </button>
    </div>
  )
}