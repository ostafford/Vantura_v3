import { formatMoney } from '@/lib/format'
import type { MonthDelta } from '@/services/insights'

export function ComparisonDeltaBadge({
  delta,
  invert,
  vsPriorLabel = 'prev month',
}: {
  delta: MonthDelta
  invert?: boolean
  /** Short label for accessibility, e.g. "prev month", "last year". */
  vsPriorLabel?: string
}) {
  if (delta.direction === 'flat') return null
  const isUp = delta.direction === 'up'
  const positive = invert ? !isUp : isUp
  const icon = isUp ? 'mdi-arrow-up' : 'mdi-arrow-down'
  const cls = positive ? 'text-success' : 'text-danger'
  const absDelta = Math.abs(delta.delta)
  const isCount = Number.isInteger(delta.current) && absDelta < 10000
  const label = isCount ? String(absDelta) : `$${formatMoney(absDelta)}`
  return (
    <div
      className={`small ${cls}`}
      aria-label={`${delta.direction} ${label} vs ${vsPriorLabel}`}
      style={{ fontSize: '0.75rem', lineHeight: 1.3 }}
    >
      <i
        className={`mdi ${icon}`}
        aria-hidden
        style={{ fontSize: '0.65rem' }}
      />{' '}
      {label}
    </div>
  )
}
