// Loads the PayPal JS SDK. Checkout (one-time payments) and subscriptions need different SDK
// settings, so each gets its own namespace and can be loaded on different pages safely.
const MODES = {
  checkout: { namespace: 'paypalCheckout', params: 'intent=capture' },
  subscription: { namespace: 'paypalSubscription', params: 'vault=true&intent=subscription' },
}
const loading = {}

export function loadPayPalSdk(mode, clientId, currency = 'USD') {
  const cfg = MODES[mode]
  if (!cfg) return Promise.reject(new Error('Unknown PayPal mode.'))
  if (window[cfg.namespace]) return Promise.resolve(window[cfg.namespace])
  if (loading[mode]) return loading[mode]

  loading[mode] = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${currency}&${cfg.params}`
    script.setAttribute('data-namespace', cfg.namespace)
    script.async = true
    script.onload = () => {
      if (window[cfg.namespace]) return resolve(window[cfg.namespace])
      delete loading[mode]
      reject(new Error('PayPal did not load. Check the PayPal client id.'))
    }
    script.onerror = () => {
      delete loading[mode]
      reject(new Error('Could not load PayPal. Check your connection and the PayPal client id.'))
    }
    document.head.appendChild(script)
  })
  return loading[mode]
}
