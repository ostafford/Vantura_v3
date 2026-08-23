/**
 * Forecast Spendable at next payday: current Spendable minus each active tracker's
 * remaining budget for its current period (no future resets, no pace extrapolation —
 * see docs/features/payday-spendable/ for why Reserved already covers upcoming charges).
 */
import { getSpendableBalance } from './balance'
import { getTrackersWithProgress } from './trackers'

export function calculateForecastSpendable(
  spendableNow: number,
  trackers: Array<{ remaining: number }>
): number {
  const totalRemaining = trackers.reduce((sum, t) => sum + t.remaining, 0)
  return spendableNow - totalRemaining
}

/**
 * DB wrapper around calculateForecastSpendable — loads current Spendable and active
 * trackers' remaining budgets, then delegates to the pure function.
 */
export function getForecastSpendable(): number {
  const spendableNow = getSpendableBalance()
  const trackers = getTrackersWithProgress()
  return calculateForecastSpendable(spendableNow, trackers)
}
