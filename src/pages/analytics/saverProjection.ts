/**
 * Pure projection math for the Savers page, extracted from `AnalyticsSavers.tsx`
 * so it is unit-testable (same reason `trackerPeriodHistory.ts` was split out).
 */
import type {
  SaverBalanceSnapshot,
  SaverMonthlyFlowPoint,
} from '@/services/accounts'

const MONTH_MAP: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
}

/**
 * Reconstruct end-of-month balances from flow data, working backwards from the
 * current balance so both saver charts share one source and time window.
 */
export function deriveMonthlyBalances(
  flow: SaverMonthlyFlowPoint[],
  saverId: string,
  currentBalance: number
): SaverBalanceSnapshot[] {
  const result: SaverBalanceSnapshot[] = []
  let b = currentBalance
  for (let i = flow.length - 1; i >= 0; i--) {
    const p = flow[i]
    // "Jun '26" → "2026-06-01"
    const [mon, yr] = p.monthLabel.split(' ')
    const date = `20${yr.slice(1)}-${MONTH_MAP[mon]}-01`
    result.unshift({
      saver_id: saverId,
      snapshot_date: date,
      balance_cents: Math.max(0, b),
    })
    // balance at end of previous month = balance at end of this month + this month's flow
    b += p.flowCents
  }
  return result
}

export interface ProjectionResult {
  onTrack: boolean
  lastMonthCents: number
  projectedBalanceCents: number
  monthsRemaining: number
  requiredMonthlyCents: number
  /** Whole months at the current rate to close the gap (rounded up). null when there is no positive rate. */
  monthsToGoal: number | null
  /** monthsRemaining − monthsToGoal: positive = reached this many months before the target. null when monthsToGoal is null. */
  monthsEarly: number | null
  /** ISO date the goal is projected to be reached at the current rate. null when monthsToGoal is null. */
  projectedReachDate: string | null
}

export function computeProjection(
  currentBalanceCents: number,
  goalCents: number,
  monthlyFlow: SaverMonthlyFlowPoint[],
  goalDate: string,
  now: Date = new Date()
): ProjectionResult {
  // Use the most recent complete month as the projected rate — matches Up Bank's
  // payday-split behaviour where each month's contribution is consistent and
  // the latest month is the most representative of the ongoing rate.
  const complete = monthlyFlow.slice(0, -1)
  const lastMonth = complete[complete.length - 1]
  // flowCents is negative for savings; negate to get positive = monthly saving rate
  const lastMonthCents = lastMonth ? -lastMonth.flowCents : 0

  const target = new Date(goalDate)
  const monthsRemaining = Math.max(
    0,
    (target.getFullYear() - now.getFullYear()) * 12 +
      (target.getMonth() - now.getMonth())
  )

  const projectedBalanceCents =
    currentBalanceCents + lastMonthCents * monthsRemaining
  const requiredMonthlyCents =
    monthsRemaining > 0
      ? (goalCents - currentBalanceCents) / monthsRemaining
      : Infinity

  // How long until the goal is reached at the current rate — solve for months,
  // rounded up (the line is crossed partway through that month). 0 if already
  // covered; null if there is no positive rate to project from.
  const gapCents = goalCents - currentBalanceCents
  const monthsToGoal =
    gapCents <= 0
      ? 0
      : lastMonthCents > 0
        ? Math.ceil(gapCents / lastMonthCents)
        : null
  const monthsEarly =
    monthsToGoal != null ? monthsRemaining - monthsToGoal : null
  let projectedReachDate: string | null = null
  if (monthsToGoal != null) {
    const reach = new Date(now)
    reach.setMonth(reach.getMonth() + monthsToGoal)
    projectedReachDate = reach.toISOString()
  }

  return {
    onTrack: projectedBalanceCents >= goalCents,
    lastMonthCents,
    projectedBalanceCents,
    monthsRemaining,
    requiredMonthlyCents,
    monthsToGoal,
    monthsEarly,
    projectedReachDate,
  }
}
