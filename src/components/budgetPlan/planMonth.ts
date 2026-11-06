/**
 * Which month the Budget Plan and bucket page show (#243), and where ‹ / ›
 * go. The month is carried in the URL as `?month=YYYY-MM`; with none, the
 * page shows the current month, so it always opens there.
 *
 * - **›** is disabled on the current month.
 * - **‹** is disabled on the first plannable month (#242): Vantura never
 *   shows a month it can't judge. With no first plannable month stored (it
 *   is set at onboarding or first boot), there is no earlier month.
 * - A `?month=` outside that range, or malformed, shows the current month.
 */

import { addMonthsToMonthStr } from '@/lib/dateStr'
import { localDateString } from '@/lib/format'
import { getBucket } from '@/services/budgetBuckets'
import {
  getFirstPlannableMonth,
  getMonthEndPlan,
  isMonth,
} from '@/services/monthEndPlan'

export interface PlanMonth {
  /** The month shown, `YYYY-MM`. */
  month: string
  /** The current calendar month (local). */
  current: string
  isCurrent: boolean
  /** Where ‹ goes, or `null` when it's disabled. */
  prev: string | null
  /** Where › goes, or `null` when it's disabled. */
  next: string | null
}

export function resolvePlanMonth(
  requested: string | null,
  today: string,
  firstPlannable: string | null
): PlanMonth {
  const current = today.slice(0, 7)
  const first =
    firstPlannable !== null && firstPlannable < current
      ? firstPlannable
      : current
  const month =
    isMonth(requested) && requested >= first && requested <= current
      ? requested
      : current
  return {
    month,
    current,
    isCurrent: month === current,
    prev: month > first ? addMonthsToMonthStr(month, -1) : null,
    next: month < current ? addMonthsToMonthStr(month, 1) : null,
  }
}

/** The query string for `month`: none for the current month. */
export function planMonthSearch(month: string, current: string): string {
  return month === current ? '' : `?month=${month}`
}

/**
 * The bucket page's month from its query string (`location.search`), for the
 * breadcrumb and page title: the month the page shows, and the bucket's name
 * in it (frozen in a finished month's plan, so a renamed or deleted bucket
 * keeps its name there). `null` name when the bucket isn't in that month.
 */
export function bucketInMonth(
  bucketId: number,
  search: string,
  today: string = localDateString()
): { name: string | null; search: string } {
  const pm = resolvePlanMonth(
    new URLSearchParams(search).get('month'),
    today,
    getFirstPlannableMonth()
  )
  const name = pm.isCurrent
    ? (getBucket(bucketId)?.name ?? null)
    : (getMonthEndPlan(pm.month)?.buckets.find((b) => b.id === bucketId)
        ?.name ?? null)
  return { name, search: planMonthSearch(pm.month, pm.current) }
}
