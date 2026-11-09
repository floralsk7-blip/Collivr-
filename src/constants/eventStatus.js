export const EVENT_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING_PAYMENT: 'pending_payment',
  PAID: 'paid',
  PUBLISHED: 'published',
  TEAMS_FORMED: 'teams_formed',
})

export const EVENT_STATUS_META = Object.freeze({
  [EVENT_STATUS.DRAFT]: {
    label: 'Draft · payment required',
    style: 'bg-warning/10 text-warning',
  },
  [EVENT_STATUS.PENDING_PAYMENT]: {
    label: 'Awaiting payment',
    style: 'bg-warning/10 text-warning',
  },
  [EVENT_STATUS.PAID]: {
    label: 'Paid · ready to publish',
    style: 'bg-accent/10 text-accent',
  },
  [EVENT_STATUS.PUBLISHED]: {
    label: 'Published',
    style: 'bg-info/10 text-info',
  },
  [EVENT_STATUS.TEAMS_FORMED]: {
    label: 'Teams formed',
    style: 'bg-primary/10 text-primary',
  },
})