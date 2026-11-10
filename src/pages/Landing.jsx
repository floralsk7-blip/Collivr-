import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Logo from '../components/Logo'
import Icon from '../components/Icon'
import PlanCard from '../components/PlanCard'
import { PLAN_COPY, PLAN_DEFS } from '../lib/plans'
import { TIERS } from '../lib/pricing'

const STEPS = [
  { n: '01', title: 'Describe', text: 'Write your project in plain language and list the skills you need.' },
  { n: '02', title: 'Understand', text: 'AI identifies the roles you need and the skill gaps.' },
  { n: '03', title: 'Match', text: 'AI reviews the best candidates on top of transparent scoring.' },
  { n: '04', title: 'Decide', text: 'See exactly why a team scores the way it does, then invite them.' },
]

const FEATURES = [
  { icon: 'sparkle', title: 'AI-assisted matching', text: 'Every match comes with a reason, built on skills, experience, interest and availability.' },
  { icon: 'layers', title: 'Team workspace', text: 'Tasks, milestones and team chat once your team is formed.' },
  { icon: 'ticket', title: 'Events for colleges', text: 'Form balanced teams for a whole hackathon or class in one go.' },
  { icon: 'shield', title: 'Payments through PayPal', text: 'Subscriptions and event passes are handled and verified by PayPal.' },
]

const SAMPLE = [
  ['Skills', 92],
  ['Interest', 80],
  ['Availability', 78],
  ['Experience', 100],
]

export default function Landing() {
  const { user, loading } = useAuth()
  const [premiumBilling, setPremiumBilling] = useState('monthly')
  const premiumPlan = premiumBilling === 'yearly' ? PLAN_DEFS.premium_yearly : PLAN_DEFS.premium_monthly
  if (!loading && user) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="mx-auto flex max-w-content items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-5 text-sm">
          <a href="#how" className="hidden text-textSecondary hover:text-text sm:block">How it works</a>
          <a href="#pricing" className="hidden text-textSecondary hover:text-text sm:block">Pricing</a>
          <Link to="/login" className="font-medium text-text hover:text-primary">Sign in</Link>
          <Link to="/login?mode=signup" className="rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-primaryHover">Get started</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-content items-center gap-12 px-6 pb-20 pt-10 md:grid-cols-2 md:pt-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">For student projects, hackathons and colleges</p>
          <h1 className="mt-4 text-4xl font-bold leading-[1.1] md:text-5xl">Build the right team, not just a full one.</h1>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-textSecondary">
            Describe your project. COLLIVRA's AI finds the people whose skills fit, picks the strongest team and explains every recommendation.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login?mode=signup" className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primaryHover">
              Get started free <Icon name="arrow" className="h-4 w-4" />
            </Link>
            <a href="#pricing" className="rounded-lg border border-borderStrong px-6 py-3 text-sm font-semibold text-text hover:bg-surface">See pricing</a>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-lift">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Example team</p>
              <h2 className="mt-1 text-xl font-bold">Smart Waste Management</h2>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-gold bg-goldSoft font-display text-lg font-bold text-sidebarBg">93</div>
          </div>
          <div className="mt-5 space-y-3">
            {SAMPLE.map(([label, value]) => (
              <div key={label} className="flex items-center gap-3 text-xs">
                <span className="w-24 shrink-0 text-textSecondary">{label}</span>
                <div className="h-2 flex-1 rounded-full bg-surface2"><div className="h-2 rounded-full bg-primary" style={{ width: `${value}%` }} /></div>
                <span className="w-8 text-right font-semibold">{value}%</span>
              </div>
            ))}
          </div>
          <p className="mt-5 rounded-lg bg-surface2 px-3 py-2 text-[13px] text-textSecondary">Covers 4 of 4 required skills. Strongest area: experience mix.</p>
        </div>
      </section>

      <section id="how" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-content px-6 py-16">
          <h2 className="text-3xl font-bold">How it works</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n}>
                <p className="font-display text-3xl font-bold text-gold">{s.n}</p>
                <h3 className="mt-2 text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-textSecondary">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-6 py-16">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-goldSoft text-sidebarBg"><Icon name={f.icon} className="h-5 w-5" /></span>
              <h3 className="mt-4 text-base font-bold">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-textSecondary">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-t border-border bg-bgHero">
        <div className="mx-auto max-w-content px-6 py-16">
          <h2 className="text-3xl font-bold">Simple pricing</h2>
          <p className="mt-2 text-textSecondary">Free for students. Upgrade when your projects get serious.</p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-textSecondary">Choose monthly or yearly billing for Student Premium.</p>
            <div className="inline-flex rounded-lg bg-surface2 p-1 text-xs font-medium" role="group" aria-label="Student Premium billing period">
              <button
                type="button"
                aria-pressed={premiumBilling === 'monthly'}
                onClick={() => setPremiumBilling('monthly')}
                className={`rounded-md px-3.5 py-1.5 transition ${premiumBilling === 'monthly' ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'}`}
              >
                Monthly
              </button>
              <button
                type="button"
                aria-pressed={premiumBilling === 'yearly'}
                onClick={() => setPremiumBilling('yearly')}
                className={`rounded-md px-3.5 py-1.5 transition ${premiumBilling === 'yearly' ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'}`}
              >
                Yearly
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <PlanCard name={PLAN_COPY.free.name} tag={PLAN_COPY.free.tag} price="$0" per="forever" blurb={PLAN_COPY.free.blurb} features={PLAN_COPY.free.features}>
              <Link to="/login?mode=signup" className="block rounded-lg border border-borderStrong py-2.5 text-center text-sm font-semibold text-text hover:bg-surface2">Start free</Link>
            </PlanCard>
            <PlanCard name={PLAN_COPY.premium.name} tag={PLAN_COPY.premium.tag} price={`$${premiumPlan.price}`} per={premiumBilling === 'yearly' ? '/ year' : '/ month'} blurb={PLAN_COPY.premium.blurb} features={PLAN_COPY.premium.features} highlight badge="Popular">
              <p className="mb-3 text-xs text-textSecondary">
                {premiumBilling === 'yearly' ? 'Billed once per year.' : 'Billed monthly.'}
              </p>
              <Link to="/login?mode=signup" className="block rounded-lg bg-primary py-2.5 text-center text-sm font-semibold text-white hover:bg-primaryHover">Get Premium</Link>
            </PlanCard>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <PlanCard name={PLAN_COPY.hackathon.name} tag={PLAN_COPY.hackathon.tag} price={`$${TIERS[0].price.replace('.00', '')} to $${TIERS[TIERS.length - 1].price.replace('.00', '')}`} per="/ event" blurb={PLAN_COPY.hackathon.blurb} features={PLAN_COPY.hackathon.features}>
              <div className="mb-4 grid gap-2 sm:grid-cols-3">
                {TIERS.map((t) => (
                  <div key={t.label} className="rounded-xl bg-surface2 px-3 py-2.5">
                    <p className="font-display text-xl font-bold">${t.price.replace('.00', '')}</p>
                    <p className="text-[11px] text-textSecondary">{t.label}</p>
                  </div>
                ))}
              </div>
              <Link to="/login?mode=signup" className="block rounded-lg border border-borderStrong py-2.5 text-center text-sm font-semibold text-text hover:bg-surface2">Plan an event</Link>
            </PlanCard>
            <PlanCard name={PLAN_COPY.organization.name} tag={PLAN_COPY.organization.tag} price="Custom" blurb={PLAN_COPY.organization.blurb} features={PLAN_COPY.organization.features}>
              <Link to="/login?mode=signup" className="block rounded-lg border border-borderStrong py-2.5 text-center text-sm font-semibold text-text hover:bg-surface2">Request a quote</Link>
            </PlanCard>
          </div>
          <p className="mt-4 text-xs text-muted">Payments run through PayPal. In this version they use the PayPal sandbox, so no real money is charged.</p>
        </div>
      </section>

      <footer className="border-t border-border bg-sidebarBg">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-sidebarText">
          <Logo dark />
          <p>Built by Team Asterisk* for the PayPal AI Hackathon</p>
        </div>
      </footer>
    </div>
  )
}
