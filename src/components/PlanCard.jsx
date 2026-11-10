import Icon from './Icon'

// One plan on the pricing grid. Children render the call to action at the bottom.
export default function PlanCard({ name, tag, price, per, blurb, features, highlight = false, badge, children }) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        highlight ? 'border-gold bg-surface shadow-lift' : 'border-border bg-surface shadow-card'
      }`}
    >
      {badge && (
        <span className="absolute -top-3 left-6 rounded-full bg-gold px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sidebarBg">{badge}</span>
      )}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-text">{name}</h3>
        {tag && <span className="shrink-0 rounded-full bg-surface2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">{tag}</span>}
      </div>
      <p className="mt-1 min-h-[40px] text-[13px] text-textSecondary">{blurb}</p>
      <p className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-4xl font-bold text-text">{price}</span>
        {per && <span className="text-sm text-muted">{per}</span>}
      </p>
      <ul className="mt-5 flex-1 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13.5px] text-text">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">{children}</div>
    </div>
  )
}
