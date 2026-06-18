import { formatMoney } from '@/lib/format'
import type { MonthDelta } from '@/services/insights'

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
