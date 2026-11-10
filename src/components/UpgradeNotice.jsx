import { Link } from 'react-router-dom'

// Shown when a feature needs a paid plan or a monthly limit has been reached.
export default function UpgradeNotice({ message, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/50 bg-goldSoft px-4 py-3 ${className}`}>
      <p className="text-sm text-text">{message}</p>
      <Link to="/pricing" className="shrink-0 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primaryHover">
        See plans
      </Link>
    </div>
  )
}
