import { formatMoney } from '@/lib/format'
import type { MonthDelta } from '@/services/insights'

export function ComparisonDeltaBadge({
  delta,
  invert,
  vsPriorLabel = 'prev month',
  monetary,
}: {
  delta: MonthDelta
  invert?: boolean
  /** Short label for accessibility, e.g. "prev month", "last year". */
  vsPriorLabel?: string
  /** Force dollar formatting — use when delta values are in cents but small enough to trigger the count heuristic. */
  monetary?: boolean
}) {
  if (delta.direction === 'flat') return null
  const isUp = delta.direction === 'up'
  const positive = invert ? !isUp : isUp
  const icon = isUp ? 'mdi-arrow-up' : 'mdi-arrow-down'
  const cls = positive ? 'text-success' : 'text-danger'
  const absDelta = Math.abs(delta.delta)
  const isCount =
    !monetary && Number.isInteger(delta.current) && absDelta < 10000
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

/** Shared helper: build the two-line tooltip content for a MonthDelta. */
export function buildDeltaTooltip(
  delta: MonthDelta,
  vsPriorLabel: string,
  monetary?: boolean
): { amount: string; line1rest: string; line2: string } | null {
  if (delta.direction === 'flat') return null
  const absDelta = Math.abs(delta.delta)
  const isCount =
    !monetary && Number.isInteger(delta.current) && absDelta < 10000
  const fmt = (v: number) =>
    isCount ? String(Math.abs(v)) : `$${formatMoney(Math.abs(v))}`
  const isUp = delta.direction === 'up'
  return {
    amount: fmt(delta.delta),
    line1rest: `${isUp ? 'more' : 'less'} than ${vsPriorLabel}`,
    line2: `${vsPriorLabel} total: ${fmt(delta.previous)}`,
  }
}
