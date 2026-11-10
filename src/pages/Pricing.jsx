
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useSubscription } from '../hooks/useSubscription'
import PaymentHistory from '../components/PaymentHistory'
import AppShell from '../components/AppShell'
import PlanCard from '../components/PlanCard'
import PayPalSubscribe from '../components/PayPalSubscribe'
import { PLAN_COPY, PLAN_DEFS, TIER_LABEL } from '../lib/plans'
import { TIERS, EVENT_PASS_FEATURES } from '../lib/pricing'
import { cancelSubscription, getBillingConfig, syncSubscription } from '../lib/subscriptions'

const FIELD = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none'
const ORG_TYPES = ['College / University', 'Company / Organisation', 'NGO', 'Other']
const isOrganiserAccount = (type) => ['organiser', 'organisation', 'institution'].includes(type)

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null
}

function CurrentPlan({ sub, onCancel, busy, accountType, customContractActive, contractUntil }) {
  if (sub.loading) return <div className="skeleton h-24 w-full" />

  const cancelled = sub.status === 'CANCELLED'
  const date = formatDate(sub.accessUntil)
  const def = PLAN_DEFS[sub.planKey]
  const organiserAccount = isOrganiserAccount(accountType)
  const visibleTier = accountType === 'student' ? sub.tier : organiserAccount ? (sub.tier === 'college' ? 'college' : 'free') : 'free'
  const visiblePlanName = accountType === 'student'
    ? (visibleTier === 'free' ? 'Student Free' : def?.name || TIER_LABEL[visibleTier])
    : organiserAccount
      ? (customContractActive ? 'Enterprise custom' : visibleTier === 'college' ? (def?.name || 'Legacy organiser subscription') : 'Event Organiser — pay per published event')
      : 'Account setup required'

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your plan</p>
          <h2 className="mt-1 text-2xl font-bold text-text">{visiblePlanName}</h2>
          {(visibleTier !== 'free' || customContractActive) && (
            <p className="mt-1 text-sm text-textSecondary">
              {customContractActive ? `Custom contract active through ${formatDate(contractUntil) || 'the agreed period'}.` : cancelled ? `Cancelled. You keep access until ${date || 'the end of the paid period'}.` : date ? `Renews on ${date}.` : 'Active.'}
            </p>
          )}
        </div>

        <div className="text-right">
          {accountType === 'student' && <p className="text-sm text-textSecondary">
            AI actions this month: <span className="font-semibold text-text">{sub.aiUsed} of {sub.aiLimit}</span>
          </p>}
          {visibleTier !== 'free' && !cancelled && sub.subscriptionId && (
            <button onClick={() => onCancel(sub.subscriptionId)} disabled={busy} className="mt-3 rounded-lg border border-danger/40 px-3.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-50">
              {busy ? 'Cancelling...' : 'Cancel subscription'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Subscribe({
  planKey,
  planId,
  sub,
  userId,
  onActivated,
  configLoading,
}) {
  if (sub.tier !== 'free') {
    return (
      <p className="rounded-lg bg-surface2 px-3 py-2.5 text-center text-xs text-textSecondary">
        Cancel your current plan first to switch.
      </p>
    )
  }

  if (configLoading) {
    return <div className="skeleton h-10 w-full rounded-lg" />
  }

  if (!planId) {
    return (
      <p className="rounded-lg bg-warning/10 px-3 py-2.5 text-xs text-warning">
        This plan is not set up yet. Please contact support.
      </p>
    )
  }

  return (
    <PayPalSubscribe
      planKey={planKey}
      planId={planId}
      userId={userId}
      onActivated={onActivated}
    />
  )
}

function QuoteForm({ userId, defaultEmail }) {
  const [form, setForm] = useState({ org_name: '', org_type: 'Startup', contact_email: defaultEmail || '', message: '' })
  const [state, setState] = useState({ sending: false, done: false, error: '' })
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  async function submit(e) {
    e.preventDefault()
    if (form.org_name.trim().length < 2) return setState({ sending: false, done: false, error: 'Enter your organization name.' })
    if (!/^\S+@\S+\.\S+$/.test(form.contact_email.trim())) return setState({ sending: false, done: false, error: 'Enter a valid contact email.' })
    setState({ sending: true, done: false, error: '' })
    const { error } = await supabase.from('plan_inquiries').insert({
      user_id: userId,
      org_name: form.org_name.trim(),
      org_type: form.org_type,
      contact_email: form.contact_email.trim(),
      message: form.message.trim() || null,
    })
    setState(error ? { sending: false, done: false, error: error.message } : { sending: false, done: true, error: '' })
  }

  if (state.done) return <p className="rounded-lg bg-accent/10 px-3 py-3 text-sm text-accent">Thank you. We will contact you at {form.contact_email}.</p>

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <input className={FIELD} placeholder="Organization name" value={form.org_name} onChange={(e) => update('org_name', e.target.value)} maxLength={120} />
      <select className={FIELD} value={form.org_type} onChange={(e) => update('org_type', e.target.value)}>
        {ORG_TYPES.map((t) => <option key={t}>{t}</option>)}
      </select>
      <input className={FIELD} placeholder="Contact email" value={form.contact_email} onChange={(e) => update('contact_email', e.target.value)} maxLength={200} />
      <textarea className={FIELD} rows={2} placeholder="What do you need? (optional)" value={form.message} onChange={(e) => update('message', e.target.value)} maxLength={1500} />
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
      <button type="submit" disabled={state.sending} className="w-full rounded-lg border border-borderStrong py-2.5 text-sm font-semibold text-text hover:bg-surface2 disabled:opacity-50">
        {state.sending ? 'Sending...' : 'Request a quote'}
      </button>
    </form>
  )
}

export default function Pricing() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const sub = useSubscription()
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [yearly, setYearly] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true

    async function init() {
      try {
        const cfg = await getBillingConfig()
        if (!active) return
        setConfig(cfg)
        if (cfg.entitlement) sub.apply(cfg.entitlement)

        // Refresh from PayPal so renewals and cancellations made elsewhere show up.
        if (cfg.entitlement?.subscriptionId) {
          const synced = await syncSubscription()
          if (active && synced?.entitlement) sub.apply(synced.entitlement)
        }
      } catch (err) {
        if (active) setError(err.message)
      }
    }

    init()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const planIds = Object.fromEntries((config?.plans || []).map((p) => [p.key, p.planId]))
  const premiumKey = yearly ? 'premium_yearly' : 'premium_monthly'
  const premium = PLAN_DEFS[premiumKey]
  const isSandbox = import.meta.env.VITE_PAYPAL_ENV !== 'live'
  const accountType = profile?.account_type || user?.user_metadata?.account_type || null
  const isStudent = accountType === 'student'
  const isOrganiser = isOrganiserAccount(accountType)
  const showEventPass = isOrganiser

  async function handleCancel(subscriptionId) {
    if (!window.confirm('Cancel your subscription? You keep access until the end of the period you already paid for.')) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const result = await cancelSubscription(subscriptionId)
      setNotice('Your subscription is cancelled. You keep access until the end of the paid period.')
      if (result?.entitlement) sub.apply(result.entitlement)
      else await sub.refresh()
    } catch (err) {
      setError(err.message)
    }

    setBusy(false)
  }

  async function handleActivated() {
    setNotice('Thank you! Your plan is active.')
    setError('')
    await sub.refresh()
  }

  return (
    <AppShell breadcrumb={<span>Plans & Billing</span>}>
      <div className="mx-auto max-w-content px-6 py-8 md:px-9">
        <h1 className="text-3xl font-bold text-text">Plans & billing</h1>
        <p className="mt-1 text-textSecondary">Plans are matched to your account type. Paid features unlock only after server-side payment or contract verification.</p>

        {error && <p role="alert" className="mt-5 rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
        {notice && <p className="mt-5 rounded-lg bg-accent/10 px-4 py-2.5 text-sm text-accent">{notice}</p>}

        <div className="mt-6">
          <CurrentPlan sub={sub} onCancel={handleCancel} busy={busy} accountType={accountType} customContractActive={false} contractUntil={null} />
        </div>

        <div className="mt-10 flex items-center justify-between">
          <h2 className="text-xl font-bold text-text">{isOrganiser ? 'Event publishing fees' : 'Choose a plan'}</h2>
          {isStudent && <div className="flex rounded-lg bg-surface2 p-1 text-xs font-medium">
            <button onClick={() => setYearly(false)} className={`rounded-md px-3.5 py-1.5 ${!yearly ? 'bg-surface text-text shadow-sm' : 'text-muted'}`}>Monthly</button>
            <button onClick={() => setYearly(true)} className={`rounded-md px-3.5 py-1.5 ${yearly ? 'bg-surface text-text shadow-sm' : 'text-muted'}`}>Yearly</button>
          </div>}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {isStudent && (
            <>
              <PlanCard name={PLAN_COPY.free.name} tag={PLAN_COPY.free.tag} price="$0" per="forever" blurb={PLAN_COPY.free.blurb} features={PLAN_COPY.free.features}>
                <p className="rounded-lg bg-surface2 px-3 py-2.5 text-center text-xs text-textSecondary">
                  {sub.tier === 'free' ? 'Your current plan' : 'Included with every account'}
                </p>
              </PlanCard>
              <PlanCard
                name={PLAN_COPY.premium.name}
                tag={PLAN_COPY.premium.tag}
                price={`$${premium.price}`}
                per={yearly ? '/ year' : '/ month'}
                blurb={PLAN_COPY.premium.blurb}
                features={PLAN_COPY.premium.features}
                highlight
                badge={sub.tier === 'premium' ? 'Current plan' : 'Popular'}
              >
                {sub.tier === 'premium'
                  ? <p className="rounded-lg bg-accent/10 px-3 py-2.5 text-center text-xs font-medium text-accent">You have Premium</p>
                  : <Subscribe planKey={premiumKey} planId={planIds[premiumKey]} sub={sub} userId={user?.id} onActivated={handleActivated} configLoading={!config} />}
              </PlanCard>
            </>
          )}
          {isOrganiser && (
            <PlanCard
              name={PLAN_COPY.organization.name}
              tag={PLAN_COPY.organization.tag}
              price="Custom"
              per="pricing"
              blurb="For colleges, universities and companies running larger event programmes."
              features={[
                'Custom event volume and contract terms',
                'Tailored onboarding',
                'Dedicated agreement and support',
              ]}
            >
              <QuoteForm userId={user?.id} defaultEmail={user?.email} />
            </PlanCard>
          )}
          {!isStudent && !isOrganiser && (
            <p className="text-sm text-muted">Complete your account profile to see the plans available for your account type.</p>
          )}
          {showEventPass && (
            <PlanCard
              name={PLAN_COPY.hackathon.name}
              tag={PLAN_COPY.hackathon.tag}
              price={`$${TIERS[0].price.replace('.00', '')} to $${TIERS[TIERS.length - 1].price.replace('.00', '')}`}
              per="/ event"
              blurb="Choose a one-time Event Pass for each event. Drafting and previewing are free; payment is required only when you publish."
              features={[
                'Create and save event drafts for free',
                'Choose a pass based on the event workflow',
                'Pay once for that event through PayPal',
                'Successful verified payment unlocks publishing',
              ]}
            >
              <div className="mb-4 grid gap-2 sm:grid-cols-3">
                {TIERS.map((t) => (
                  <div key={t.label} className="rounded-xl bg-surface2 px-3 py-2.5">
                    <p className="font-display text-xl font-bold text-text">${t.price.replace('.00', '')}</p>
                    <p className="text-[11px] text-textSecondary">{t.label}</p>
                  </div>
                ))}
              </div>
              <Link to="/events" className="block rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-white hover:bg-primaryHover">Go to events</Link>
            </PlanCard>
          )}
        </div>

        {showEventPass && (
          <section className="mt-7 rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-lg font-bold text-text">Event Pass feature comparison</h2>
            <p className="mt-1 text-sm text-muted">These are enforced capabilities and limits for each event, not just labels.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs text-muted"><th className="py-3 pr-4">Feature</th><th className="px-3 py-3">Standard · $9</th><th className="px-3 py-3">Advanced · $19</th><th className="px-3 py-3">Complex · $39</th></tr></thead>
                <tbody>{EVENT_PASS_FEATURES.map((feature) => <tr key={feature.label} className="border-b border-border/60"><td className="py-3 pr-4 font-medium text-text">{feature.label}</td>{feature.values.map((value, index) => <td key={index} className="px-3 py-3 text-textSecondary">{value}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">Automatic advancement runs after an organiser closes a stage. Complex weighted judging scores are calculated and validated by the database.</p>
          </section>
        )}

        <div className="mt-10">
          <PaymentHistory />
        </div>

        {isSandbox && (
          <p className="mt-5 text-xs text-muted">
            Test mode: payments use PayPal sandbox accounts, so no real money is charged. Sign in to PayPal with a sandbox buyer account.
          </p>
        )}
      </div>
    </AppShell>
  )
}
