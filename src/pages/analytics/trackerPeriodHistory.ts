import {
  toPeriodCents,
  type BudgetDisplayPeriod,
} from '@/lib/monthlyEquivalent'
import { calendarPeriodBounds } from '@/lib/dateStr'
import { localDateString } from '@/lib/format'
import {
  getTrackerSpentInPeriod,
  type TrackerResetFrequency,
  type TrackerPeriodHistoryRow,
} from '@/services/trackers'

/**
 * Period-history rows for a *non-native* display period on the tracker detail
 * page: spend is re-summed over each calendar week / month / year and the
 * budget is scaled to that period with `toPeriodCents`. `offset` runs from
 * `-(periodsBack - 1)` … `0`, where `0` is the current period.
 *
 * "Today" is the **local** calendar date — the convention shared with
 * `services/trackers` and the Spendable calculation. It is handed to
 * `calendarPeriodBounds` as noon UTC because that helper reads a `Date`'s UTC
 * calendar fields; a raw `new Date()` would put a UTC+10/+11 user (i.e. every
 * Up Bank customer) opening the page before ~10am local into the previous
 * calendar period as "Current", with every row's bounds shifted a day (#56,
 * the same UTC/local class as #52).
 */
export function buildCalendarPeriodHistory(
  trackerId: number,
  displayPeriod: BudgetDisplayPeriod,
  periodsBack: number,
  trackerBudget: number,
  trackerFrequency: TrackerResetFrequency
): TrackerPeriodHistoryRow[] {
  const today = new Date(`${localDateString()}T12:00:00Z`)
  const normalizedBudget = toPeriodCents(
    trackerBudget,
    trackerFrequency,
    displayPeriod
  )
  const result: TrackerPeriodHistoryRow[] = []

  for (let offset = -periodsBack + 1; offset <= 0; offset++) {
    const { from, to } = calendarPeriodBounds(displayPeriod, offset, today)
    let label: string

    if (displayPeriod === 'WEEKLY') {
      label =
        offset === 0
          ? 'This week'
          : offset === -1
            ? 'Last week'
            : `${-offset} weeks ago`
    } else if (displayPeriod === 'MONTHLY') {
      label =
        offset === 0
          ? 'Current'
          : offset === -1
            ? 'Previous'
            : `${-offset} months ago`
    } else {
      // YEARLY
      label = offset === 0 ? 'Current' : from.slice(0, 4)
    }

    const spent = getTrackerSpentInPeriod(trackerId, from, to)
    const remaining = Math.max(0, normalizedBudget - spent)
    const progress = normalizedBudget > 0 ? (spent / normalizedBudget) * 100 : 0
    result.push({
      periodOffset: offset,
      periodLabel: label,
      periodStart: from,
      periodEnd: to,
      budget: normalizedBudget,
      spent,
      remaining,
      progress,
    })
  }
  return result
}
