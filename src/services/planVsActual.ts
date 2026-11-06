/**
 * The Budget Plan's **plan vs actual read** (#240, Spec D #239) for one
 * calendar month. This slice covers the **current month on the live plan**;
 * any other month declines (`null`) until the Month-end plan exists (#242,
 * #243).
 *
 * Built only on `getMonthAttribution` (#191), `getHeadroom` (#215) and
 * `regularOccurrencesPaidInMonth` (#214), so the Budget Plan, Headroom and
 * Spec B agree:
 *
 * - **Free spending so far** = Income − total Actual spending to date
 *   (Headroom's figure), or `null` when Income isn't set.
 * - **Spent on plan** = actual over every Regular (where not null) and every
 *   Tracker, Not in a bucket included. **Spent unplanned** = Unplanned's
 *   total. Together they are total Actual spending (ADR 0022).
 * - **Still to go out** = Headroom's figure, `null` when Headroom's is.
 * - **If the rest goes to plan** = Income − Actual − Still to go out, `null`
 *   when either is.
 * - **Committed** = planned over the items in a bucket: Regular occurrences
 *   dated in the month plus Tracker `plannedCents`. Not in a bucket, and a
 *   Tracker with no planned figure, add nothing. **Unallocated** = Income −
 *   Committed.
 * - **Pace** (Trackers) = planned × elapsed days ÷ days in month, the 1st
 *   through today inclusive, rounded to the cent.
 *
 * A Regular's state follows the paid rule (`regularOccurrencesPaidInMonth`),
 * not the attribution read's `notPaid`. Until every occurrence in the month
 * is paid it shows a chip: *overdue* when an unpaid one is dated before
 * today, else *no actual figure* when it has no `match_description`, else
 * *not paid yet*. Once all are paid: *under* or *over* by actual − planned,
 * or *paid* when there's no actual figure to compare. With no occurrence in
 * the month it is *not due*, unless a Linked payment still lands in the month
 * (then *over* by that actual).
 *
 * Computed on every call. Nothing is cached.
 */

import { calendarMonthDayBounds } from '@/lib/dateStr'
import { getBuckets, getMonthlyIncomeCents } from '@/services/budgetBuckets'
import { getHeadroom } from '@/services/headroom'
import {
  getMonthAttribution,
  type Unplanned,
} from '@/services/monthAttribution'
import {
  regularById,
  regularOccurrencesPaidInMonth,
  type RegularOccurrencePaid,
} from '@/services/regulars'
import { getTrackersList } from '@/services/trackers'

export type TrackerPlanState =
  /** `max(0, planned − actual)`. */
  | { kind: 'left'; cents: number }
  /** `actual − planned`, when actual is above planned. */
  | { kind: 'over'; cents: number }
  /** Planned is `null` (a cadence the attribution read can't price). */
  | { kind: 'no-planned-figure' }

export type RegularPlanState =
  | { kind: 'not-paid-yet' }
  | { kind: 'overdue' }
  /** No `match_description`, so Vantura can't see it paid: Mark paid. */
  | { kind: 'no-actual-figure' }
  /** Every occurrence paid, but there's no actual figure to compare. */
  | { kind: 'paid' }
  /** No occurrence dated in the month and no Linked payment in it. */
  | { kind: 'not-due' }
  /** `planned − actual`, when actual is at or below planned. */
  | { kind: 'under'; cents: number }
  /** `actual − planned`, when actual is above planned. */
  | { kind: 'over'; cents: number }

export interface TrackerPlanItem {
  type: 'tracker'
  trackerId: number
  name: string
  /** From the attribution read; `null` when it can't be priced. */
  plannedCents: number | null
  /** From the attribution read. Positive = money out; may be negative. */
  actualCents: number
  /** Where actual would be today if spread evenly; `null` when planned is. */
  paceCents: number | null
  state: TrackerPlanState
}

export interface RegularPlanItem {
  type: 'regular'
  regularId: number
  name: string
  /** Its occurrences dated in the month (from the attribution read). */
  plannedCents: number
  /** Its Linked payments in the month; `null` when it has no actual figure. */
  actualCents: number | null
  state: RegularPlanState
  /** Its unpaid occurrence dates in the month, oldest first (for Mark paid). */
  unpaidDates: string[]
}

export type PlanItem = TrackerPlanItem | RegularPlanItem

export interface PlanBucket {
  bucketId: number
  name: string
  icon: string
  /** Sum of its items' planned (a `null` Tracker planned adds nothing). */
  plannedCents: number
  /** Sum of its items' actual (a `null` Regular actual adds nothing). */
  actualCents: number
  /** By name, then Regulars before Trackers, then id. */
  items: PlanItem[]
}

export interface NotInABucket {
  /** Its items' planned, shown on the rows; adds nothing to Committed. */
  plannedCents: number
  /** Counts as Spent on plan. */
  actualCents: number
  items: PlanItem[]
}

export interface PlanVsActual {
  /** `YYYY-MM`. */
  month: string
  state: 'in-progress'
  /** Today, `YYYY-MM-DD` (local). */
  today: string
  /** Day N of M. */
  dayOfMonth: number
  daysInMonth: number
  /** Income − total Actual spending to date; `null` when Income isn't set. */
  freeSpendingSoFarCents: number | null
  bar: {
    spentOnPlanCents: number
    spentUnplannedCents: number
    /** Headroom's figure; `null` when it declines. */
    stillToGoOutCents: number | null
    /** `null` when Income or Still to go out is. */
    ifTheRestGoesToPlanCents: number | null
  }
  figures: {
    incomeCents: number | null
    committedCents: number
    /** `null` when Income isn't set. */
    unallocatedCents: number | null
    /** Total Actual spending to date. */
    actualCents: number
  }
  /** Every bucket, in Budget Plan order (empty buckets included). */
  buckets: PlanBucket[]
  notInABucket: NotInABucket
  unplanned: Unplanned
}

function trackerState(
  planned: number | null,
  actual: number
): TrackerPlanState {
  if (planned === null) return { kind: 'no-planned-figure' }
  return actual > planned
    ? { kind: 'over', cents: actual - planned }
    : { kind: 'left', cents: planned - actual }
}

function regularState(
  planned: number,
  actual: number | null,
  occurrences: RegularOccurrencePaid[],
  today: string
): RegularPlanState {
  if (occurrences.length === 0) {
    return actual !== null && actual > 0
      ? { kind: 'over', cents: actual - planned }
      : { kind: 'not-due' }
  }
  const unpaid = occurrences.filter((o) => !o.paid)
  if (unpaid.length > 0) {
    if (unpaid.some((o) => o.date < today)) return { kind: 'overdue' }
    if (actual === null) return { kind: 'no-actual-figure' }
    return { kind: 'not-paid-yet' }
  }
  if (actual === null) return { kind: 'paid' }
  return actual > planned
    ? { kind: 'over', cents: actual - planned }
    : { kind: 'under', cents: planned - actual }
}

const byItemOrder = (a: PlanItem, b: PlanItem) =>
  a.name.localeCompare(b.name) ||
  (a.type === b.type ? 0 : a.type === 'regular' ? -1 : 1) ||
  (a.type === 'regular' ? a.regularId : a.trackerId) -
    (b.type === 'regular' ? b.regularId : b.trackerId)

const itemPlanned = (i: PlanItem) => i.plannedCents ?? 0
const itemActual = (i: PlanItem) => i.actualCents ?? 0

/**
 * Plan vs actual for `month` (`YYYY-MM`), or `null` when it isn't the current
 * calendar month (past months need the Month-end plan, #242).
 */
export function getPlanVsActual(month: string): PlanVsActual | null {
  const headroom = getHeadroom()
  if (month !== headroom.month) return null
  const { today } = headroom

  const attribution = getMonthAttribution(month)
  const occurrences = regularOccurrencesPaidInMonth(month)
  const income = getMonthlyIncomeCents()
  const daysInMonth = Number(calendarMonthDayBounds(month).last.slice(8, 10))
  const dayOfMonth = Number(today.slice(8, 10))

  const buckets = getBuckets()
  const knownBucket = new Set(buckets.map((b) => b.id))
  const itemsByBucket = new Map<number | null, PlanItem[]>()
  const place = (bucketId: number | null, item: PlanItem) => {
    // A bucket id that no longer names a bucket is treated as not in one.
    const key = bucketId !== null && knownBucket.has(bucketId) ? bucketId : null
    const list = itemsByBucket.get(key) ?? []
    list.push(item)
    itemsByBucket.set(key, list)
  }

  for (const line of attribution.regulars) {
    const own = occurrences.filter((o) => o.regular.id === line.regularId)
    place(line.bucketId, {
      type: 'regular',
      regularId: line.regularId,
      name: own[0]?.regular.name ?? regularById(line.regularId)?.name ?? '',
      plannedCents: line.plannedCents,
      actualCents: line.actualCents,
      state: regularState(line.plannedCents, line.actualCents, own, today),
      unpaidDates: own.filter((o) => !o.paid).map((o) => o.date),
    })
  }

  const trackerNames = new Map(getTrackersList().map((t) => [t.id, t.name]))
  for (const line of attribution.trackers) {
    place(line.bucketId, {
      type: 'tracker',
      trackerId: line.trackerId,
      name: trackerNames.get(line.trackerId) ?? '',
      plannedCents: line.plannedCents,
      actualCents: line.actualCents,
      paceCents:
        line.plannedCents === null
          ? null
          : Math.round((line.plannedCents * dayOfMonth) / daysInMonth),
      state: trackerState(line.plannedCents, line.actualCents),
    })
  }

  const group = (bucketId: number | null) => {
    const items = (itemsByBucket.get(bucketId) ?? []).sort(byItemOrder)
    return {
      items,
      plannedCents: items.reduce((sum, i) => sum + itemPlanned(i), 0),
      actualCents: items.reduce((sum, i) => sum + itemActual(i), 0),
    }
  }
  const planBuckets: PlanBucket[] = buckets.map((b) => ({
    bucketId: b.id,
    name: b.name,
    icon: b.icon,
    ...group(b.id),
  }))
  const notInABucket = group(null)

  const spentOnPlanCents =
    planBuckets.reduce((sum, b) => sum + b.actualCents, 0) +
    notInABucket.actualCents
  const actualCents = attribution.totalActualSpendingCents
  const committedCents = planBuckets.reduce((sum, b) => sum + b.plannedCents, 0)
  const { stillToGoOutCents } = headroom

  return {
    month,
    state: 'in-progress',
    today,
    dayOfMonth,
    daysInMonth,
    freeSpendingSoFarCents: headroom.freeSpendingSoFarCents,
    bar: {
      spentOnPlanCents,
      spentUnplannedCents: attribution.unplanned.totalCents,
      stillToGoOutCents,
      ifTheRestGoesToPlanCents:
        income === null || stillToGoOutCents === null
          ? null
          : income - actualCents - stillToGoOutCents,
    },
    figures: {
      incomeCents: income,
      committedCents,
      unallocatedCents: income === null ? null : income - committedCents,
      actualCents,
    },
    buckets: planBuckets,
    notInABucket,
    unplanned: attribution.unplanned,
  }
}
