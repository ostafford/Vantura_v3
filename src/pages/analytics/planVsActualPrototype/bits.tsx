// PROTOTYPE — small shared bits for the plan-vs-actual variants.
import { money, type PvaItem } from './fixture'

export const muted = 'var(--bs-secondary-color)'
export const danger = 'var(--vantura-danger-text)'
export const success = 'var(--vantura-success-text)'
export const warning = 'var(--bs-warning-text-emphasis)'

/** "Left" / "over" for an item. Quiet when under, coloured only when over. */
export function LeftOrOver({
  item,
  done,
}: {
  item: Pick<PvaItem, 'plannedCents' | 'actualCents'>
  done: boolean
}) {
  if (item.actualCents == null) return <span style={{ color: muted }}>—</span>
  const diff = item.plannedCents - item.actualCents
  if (diff < 0)
    return (
      <span style={{ color: danger, fontWeight: 600 }}>
        {money(-diff)} over
      </span>
    )
  if (diff === 0) return <span style={{ color: muted }}>on plan</span>
  return (
    <span style={{ color: muted }}>
      {money(diff)} {done ? 'under' : 'left'}
    </span>
  )
}

export function StatusChip({ item }: { item: PvaItem }) {
  if (item.kind !== 'regular' || !item.status || item.status === 'paid')
    return null
  const map = {
    'not-paid': { text: 'not paid yet', color: muted, icon: 'mdi-clock-outline' },
    overdue: { text: 'overdue', color: warning, icon: 'mdi-alert-outline' },
    'no-link': {
      text: 'no actual figure · Mark paid',
      color: muted,
      icon: 'mdi-link-variant-off',
    },
  } as const
  const s = map[item.status]
  return (
    <span
      style={{
        fontSize: '0.7rem',
        color: s.color,
        whiteSpace: 'nowrap',
      }}
    >
      <i className={`mdi ${s.icon} me-1`} aria-hidden />
      {s.text}
    </span>
  )
}

export function KindIcon({ kind }: { kind: PvaItem['kind'] }) {
  return (
    <i
      className={`mdi ${kind === 'regular' ? 'mdi-calendar-sync-outline' : 'mdi-target'} me-1`}
      style={{ color: muted, fontSize: '0.85rem' }}
      title={kind === 'regular' ? 'Regular' : 'Tracker'}
      aria-hidden
    />
  )
}
