/**
 * The Budget Plan's **plan vs actual read** (#240, Spec D #239) for one
 * calendar month: the **current month on the live plan** (in progress), or a
 * **finished month judged against its Month-end plan** (#243). Its actuals
 * stay live; only the plan is frozen. A month after the current one, or a
 * finished month with no Month-end plan, declines (`null`).
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
 * **A finished month** (#243) reads the same way over its Month-end plan's
 * buckets, Regulars, Trackers, marks and pay, with these differences:
 * - **Saved** = Income − total Actual spending; negative is Overspent. There
 *   is no Free spending so far, Still to go out, *If the rest goes to plan*
 *   or pace.
 * - A Tracker is *under* or *over*, never *left*.
 * - An unpaid Regular is *no payment found* (Mark paid writes to the plan).
 *
 * **A Month without a plan** (#282, `monthsWithoutAPlan.ts`) has no plan to
 * judge: Actual spending, **Spending by category** (the attribution read on
 * an empty plan, so every counted transaction lands in it and it adds up to
 * Actual spending), Income from its **Confirmed pay** (`confirmedPay.ts`)
 * and Saved = Income − Actual. Saved is `null` with a reason, in this order:
 * the opening month (*Part month*), a transfer to an account Vantura doesn't
 * hold (*Closed Saver*), no Confirmed pay (*Pay not confirmed*). A month on
 * or after the First plannable month never falls back to this read.
 *
 * Computed on every call. Nothing is cached.
 */

import { calendarMonthDayBounds } from '@/lib/dateStr'
import {
  getBuckets,
  getMonthlyIncomeCents,
  monthlyIncomeFromPay,
  type Pay,
} from '@/services/budgetBuckets'
import { getConfirmedPay } from '@/services/confirmedPay'
import { getHeadroom } from '@/services/headroom'
import {
  getMonthAttribution,
  type MonthAttribution,
  type MonthPlanInput,
  type Unplanned,
} from '@/services/monthAttribution'
import { getMonthEndPlan, isMonth, planInputOf } from '@/services/monthEndPlan'
import {
  getMonthsWithoutAPlan,
  isInRange,
  usedAClosedSaver,
  type MonthsWithoutAPlan,
} from '@/services/monthsWithoutAPlan'
import {
  regularById,
  regularOccurrencesPaidInMonth,
  type RegularOccurrencePaid,
} from '@/services/regulars'
import { getTrackersList } from '@/services/trackers'

export type TrackerPlanState =
  /** In progress: `planned − actual`, when actual is at or below planned. */
  | { kind: 'left'; cents: number }
  /** Finished: `planned − actual`, when actual is at or below planned. */
  | { kind: 'under'; cents: number }
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
  /** Finished month: an occurrence is still unpaid. Mark paid writes to the plan. */
  | { kind: 'no-payment-found' }

export interface TrackerPlanItem {
  type: 'tracker'
  trackerId: number
  name: string
  /** From the attribution read; `null` when it can't be priced. */
  plannedCents: number | null
  /** From the attribution read. Positive = money out; may be negative. */
  actualCents: number
  /**
   * Where actual would be today if spread evenly; `null` when planned is, and
   * always `null` in a finished month.
   */
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

interface PlanVsActualBase {
  /** `YYYY-MM`. */
  month: string
  /** Today, `YYYY-MM-DD` (local). */
  today: string
  daysInMonth: number
  figures: {
    incomeCents: number | null
    committedCents: number
    /** `null` when Income isn't set. */
    unallocatedCents: number | null
    /** Total Actual spending (to date, while in progress). */
    actualCents: number
  }
  /** Every bucket, in Budget Plan order (empty buckets included). */
  buckets: PlanBucket[]
  notInABucket: NotInABucket
  unplanned: Unplanned
}

/** The current month, on the live plan. */
export interface PlanVsActualInProgress extends PlanVsActualBase {
  state: 'in-progress'
  /** Day N of M. */
  dayOfMonth: number
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
}

/** A finished month, judged against its Month-end plan (#243). */
export interface PlanVsActualFinished extends PlanVsActualBase {
  state: 'finished'
  /**
   * Income − total Actual spending: Saved, or Overspent when negative.
   * `null` when the plan has no Income.
   */
  savedCents: number | null
  bar: {
    spentOnPlanCents: number
    spentUnplannedCents: number
    /** As `savedCents`. */
    savedCents: number | null
  }
}

/** Why a Month without a plan has no Saved, in precedence order. */
export type NoSavedReason =
  /** The opening month: a part month isn't measured against a full pay. */
  | 'part-month'
  /** A transfer to an account Vantura doesn't hold: a since-closed Saver. */
  | 'closed-saver'
  /** No Confirmed pay for the month. */
  | 'pay-not-confirmed'

/**
 * A **Month without a plan** (#282): a finished month before the First
 * plannable month. No buckets, Committed, Unallocated, Spent on plan or
 * Unplanned; only Actual spending, Spending by category and Saved.
 */
export interface PlanVsActualNoPlan {
  state: 'no-plan'
  /** `YYYY-MM`. */
  month: string
  /** Today, `YYYY-MM-DD` (local). */
  today: string
  daysInMonth: number
  /** The Spending account's opening day, local `YYYY-MM-DD`. */
  openingDate: string
  figures: {
    /** From the Confirmed pay; `null` without one. */
    incomeCents: number | null
    /** Total Actual spending (ADR 0022). */
    actualCents: number
  }
  /**
   * Every counted transaction by parent category, subcategory and
   * Uncategorised (the attribution read on an empty plan). Its total is
   * Actual spending.
   */
  spendingByCategory: Unplanned
  /** The month's Confirmed pay, `null` when there's none. */
  confirmedPay: Pay | null
  /** Income − Actual spending (negative is Overspent); `null` with a reason. */
  savedCents: number | null
  /** Set exactly when `savedCents` is `null`. */
  noSavedReason: NoSavedReason | null
}

/** A month read against a plan: the live plan or its Month-end plan. */
export type PlanVsActualWithPlan = PlanVsActualInProgress | PlanVsActualFinished

export type PlanVsActual = PlanVsActualWithPlan | PlanVsActualNoPlan

type MonthState = Exclude<PlanVsActual['state'], 'no-plan'>

function trackerState(
  planned: number | null,
  actual: number,
  month: MonthState
): TrackerPlanState {
  if (planned === null) return { kind: 'no-planned-figure' }
  if (actual > planned) return { kind: 'over', cents: actual - planned }
  return {
    kind: month === 'finished' ? 'under' : 'left',
    cents: planned - actual,
  }
}

function regularState(
  planned: number,
  actual: number | null,
  occurrences: RegularOccurrencePaid[],
  today: string,
  month: MonthState
): RegularPlanState {
  if (occurrences.length === 0) {
    return actual !== null && actual > 0
      ? { kind: 'over', cents: actual - planned }
      : { kind: 'not-due' }
  }
  const unpaid = occurrences.filter((o) => !o.paid)
  if (unpaid.length > 0) {
    if (month === 'finished') return { kind: 'no-payment-found' }
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

interface Groups {
  buckets: PlanBucket[]
  notInABucket: NotInABucket
  spentOnPlanCents: number
  committedCents: number
}

/**
 * Places every Regular and Tracker line in its bucket (a bucket id that names
 * no bucket counts as not in one), with its state, and totals the groups.
 */
function buildGroups(input: {
  month: MonthState
  today: string
  dayOfMonth: number
  daysInMonth: number
  attribution: MonthAttribution
  occurrences: RegularOccurrencePaid[]
  buckets: { id: number; name: string; icon: string }[]
  regularName: (id: number) => string
  trackerName: (id: number) => string
}): Groups {
  const { month, today, attribution, occurrences } = input
  const knownBucket = new Set(input.buckets.map((b) => b.id))
  const itemsByBucket = new Map<number | null, PlanItem[]>()
  const place = (bucketId: number | null, item: PlanItem) => {
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
      name: own[0]?.regular.name ?? input.regularName(line.regularId),
      plannedCents: line.plannedCents,
      actualCents: line.actualCents,
      state: regularState(
        line.plannedCents,
        line.actualCents,
        own,
        today,
        month
      ),
      unpaidDates: own.filter((o) => !o.paid).map((o) => o.date),
    })
  }

  for (const line of attribution.trackers) {
    place(line.bucketId, {
      type: 'tracker',
      trackerId: line.trackerId,
      name: input.trackerName(line.trackerId),
      plannedCents: line.plannedCents,
      actualCents: line.actualCents,
      paceCents:
        month === 'finished' || line.plannedCents === null
          ? null
          : Math.round(
              (line.plannedCents * input.dayOfMonth) / input.daysInMonth
            ),
      state: trackerState(line.plannedCents, line.actualCents, month),
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
  const buckets: PlanBucket[] = input.buckets.map((b) => ({
    bucketId: b.id,
    name: b.name,
    icon: b.icon,
    ...group(b.id),
  }))
  const notInABucket = group(null)
  return {
    buckets,
    notInABucket,
    spentOnPlanCents:
      buckets.reduce((sum, b) => sum + b.actualCents, 0) +
      notInABucket.actualCents,
    committedCents: buckets.reduce((sum, b) => sum + b.plannedCents, 0),
  }
}

const daysIn = (month: string) =>
  Number(calendarMonthDayBounds(month).last.slice(8, 10))

/**
 * Plan vs actual for `month` (`YYYY-MM`): the current month in progress on
 * the live plan, a finished month against its Month-end plan, or a Month
 * without a plan. `null` for a month after this one, a malformed month, a
 * month before the range of Months without a plan, or a finished month on or
 * after the First plannable month with no readable Month-end plan.
 */
export function getPlanVsActual(month: string): PlanVsActual | null {
  const headroom = getHeadroom()
  if (month === headroom.month) return readInProgress(month, headroom)
  if (!isMonth(month) || month > headroom.month) return null
  const noPlanRange = getMonthsWithoutAPlan()
  if (isInRange(month, noPlanRange)) {
    return readNoPlan(month, headroom.today, noPlanRange)
  }
  return readFinished(month, headroom.today)
}

/** The attribution read's plan input with no Regulars and no Trackers. */
const EMPTY_PLAN: MonthPlanInput = {
  regulars: { rows: [], occurrences: new Map(), marks: [] },
  trackers: [],
}

function readNoPlan(
  month: string,
  today: string,
  range: MonthsWithoutAPlan
): PlanVsActualNoPlan {
  const attribution = getMonthAttribution(month, EMPTY_PLAN)
  const actualCents = attribution.totalActualSpendingCents
  const pay = getConfirmedPay(month)
  const income = pay ? monthlyIncomeFromPay(pay) : null
  const noSavedReason: NoSavedReason | null =
    month === range.firstMonth
      ? 'part-month'
      : usedAClosedSaver(month)
        ? 'closed-saver'
        : income === null
          ? 'pay-not-confirmed'
          : null
  return {
    state: 'no-plan',
    month,
    today,
    daysInMonth: daysIn(month),
    openingDate: range.openingDate,
    figures: { incomeCents: income, actualCents },
    spendingByCategory: attribution.unplanned,
    confirmedPay: pay,
    savedCents:
      noSavedReason === null && income !== null ? income - actualCents : null,
    noSavedReason,
  }
}

function readInProgress(
  month: string,
  headroom: ReturnType<typeof getHeadroom>
): PlanVsActualInProgress {
  const { today } = headroom
  const attribution = getMonthAttribution(month)
  const income = getMonthlyIncomeCents()
  const daysInMonth = daysIn(month)
  const dayOfMonth = Number(today.slice(8, 10))
  const trackerNames = new Map(getTrackersList().map((t) => [t.id, t.name]))
  const groups = buildGroups({
    month: 'in-progress',
    today,
    dayOfMonth,
    daysInMonth,
    attribution,
    occurrences: regularOccurrencesPaidInMonth(month),
    buckets: getBuckets(),
    regularName: (id) => regularById(id)?.name ?? '',
    trackerName: (id) => trackerNames.get(id) ?? '',
  })
  const actualCents = attribution.totalActualSpendingCents
  const { stillToGoOutCents } = headroom

  return {
    month,
    state: 'in-progress',
    today,
    dayOfMonth,
    daysInMonth,
    freeSpendingSoFarCents: headroom.freeSpendingSoFarCents,
    bar: {
      spentOnPlanCents: groups.spentOnPlanCents,
      spentUnplannedCents: attribution.unplanned.totalCents,
      stillToGoOutCents,
      ifTheRestGoesToPlanCents:
        income === null || stillToGoOutCents === null
          ? null
          : income - actualCents - stillToGoOutCents,
    },
    figures: {
      incomeCents: income,
      committedCents: groups.committedCents,
      unallocatedCents: income === null ? null : income - groups.committedCents,
      actualCents,
    },
    buckets: groups.buckets,
    notInABucket: groups.notInABucket,
    unplanned: attribution.unplanned,
  }
}

function readFinished(
  month: string,
  today: string
): PlanVsActualFinished | null {
  const plan = getMonthEndPlan(month)
  if (!plan) return null
  const input = planInputOf(plan)
  const attribution = getMonthAttribution(month, input)
  const income = plan.pay ? monthlyIncomeFromPay(plan.pay) : null
  const daysInMonth = daysIn(month)
  const regularNames = new Map(plan.regulars.map((r) => [r.id, r.name]))
  const trackerNames = new Map(plan.trackers.map((t) => [t.id, t.name]))
  const groups = buildGroups({
    month: 'finished',
    today,
    dayOfMonth: daysInMonth,
    daysInMonth,
    attribution,
    occurrences: regularOccurrencesPaidInMonth(month, input.regulars),
    buckets: plan.buckets,
    regularName: (id) => regularNames.get(id) ?? '',
    trackerName: (id) => trackerNames.get(id) ?? '',
  })
  const actualCents = attribution.totalActualSpendingCents
  const savedCents = income === null ? null : income - actualCents

  return {
    month,
    state: 'finished',
    today,
    daysInMonth,
    savedCents,
    bar: {
      spentOnPlanCents: groups.spentOnPlanCents,
      spentUnplannedCents: attribution.unplanned.totalCents,
      savedCents,
    },
    figures: {
      incomeCents: income,
      committedCents: groups.committedCents,
      unallocatedCents: income === null ? null : income - groups.committedCents,
      actualCents,
    },
    buckets: groups.buckets,
    notInABucket: groups.notInABucket,
    unplanned: attribution.unplanned,
  }
}
