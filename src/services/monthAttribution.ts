/**
 * The **month attribution read** (#186 / #191): given a calendar month, where
 * every Actual spending transaction counts, with planned vs actual per line.
 *
 * Each counted transaction (`actualSpending.ts`) goes to exactly one place:
 * 1. a Regular, when it is that Regular's Linked payment (docs/adr/0020);
 * 2. else the active Tracker whose config in effect on the transaction's
 *    Display date includes its category (docs/adr/0003, docs/adr/0014);
 * 3. else **Unplanned**, by Up parent category → subcategory, or
 *    Uncategorised.
 * Refunds are never Linked payments, so they skip step 1.
 *
 * So Regular actuals + Tracker actuals + Unplanned = total Actual spending,
 * always. Everything is computed on read; nothing is cached or stored.
 */

import { getDb } from '@/db'
import { addDaysToDateStr, calendarMonthDayBounds } from '@/lib/dateStr'
import { toPeriodCents } from '@/lib/monthlyEquivalent'
import { actualSpendingWhere } from '@/services/actualSpending'
import { displayDaySql } from '@/services/displayDay'
import {
  regularsInMonth,
  type RegularMonth,
  type RegularsPlanInput,
} from '@/services/regulars'
import {
  getTracker,
  getTrackerConfigHistory,
  getTrackersList,
  TRACKER_RESET_FREQUENCY_ORDER,
  type TrackerConfigVersion,
} from '@/services/trackers'

/** A Regular's line for the month (from the Regulars module). */
export type RegularMonthLine = RegularMonth

export interface TrackerMonthLine {
  trackerId: number
  /** Budget Plan bucket, or `null` when it isn't in a bucket. */
  bucketId: number | null
  /**
   * Monthly equivalent of each config version's budget, weighted by the days
   * of the month that version was in effect (cents). A day before the
   * Tracker's first config version plans nothing. `null` — no planned figure
   * — when a version in effect this month is in a cadence Vantura can't price
   * (not a tracker reset frequency): the read declines rather than guess.
   */
  plannedCents: number | null
  /**
   * Actual spending in the category set in effect on each transaction's
   * Display date, Linked payments excluded. Positive = money out; may be
   * negative.
   */
  actualCents: number
}

export interface UnplannedSubcategoryRow {
  categoryId: string
  /** Net Actual spending, positive = money out. May be negative. */
  totalCents: number
}

export interface UnplannedParentRow {
  /** Up parent category id. */
  parentCategoryId: string
  /** Net Actual spending across the parent, positive = money out. May be negative. */
  totalCents: number
  /** Ordered by category id. */
  subcategories: UnplannedSubcategoryRow[]
}

export interface Unplanned {
  /** Net Actual spending on Unplanned, positive = money out. May be negative. */
  totalCents: number
  /** One row per Up parent category with Unplanned spending, by id. */
  parents: UnplannedParentRow[]
  /** Uncategorised debits (an uncategorised positive never counts). */
  uncategorisedCents: number
}

export interface MonthAttribution {
  /** `YYYY-MM`. */
  month: string
  /** Total Actual spending in the month, positive = money out. Equals Money out. */
  totalActualSpendingCents: number
  /** Every Regular, in id order. */
  regulars: RegularMonthLine[]
  /** Every active Tracker, in id order. A deactivated one drops out. */
  trackers: TrackerMonthLine[]
  unplanned: Unplanned
}

/**
 * A finished month's plan, read in place of the live one (#243): a Month-end
 * plan's Regulars and Trackers (`planInputOf` in `@/services/monthEndPlan`).
 * Transactions are always live, so actuals stay live.
 */
export interface MonthPlanInput {
  regulars: RegularsPlanInput
  trackers: TrackerMonthPlan[]
}

interface CountedTransaction {
  id: string
  /** Signed cents as stored: a debit is negative, a refund positive. */
  amount: number
  /** Display date's local day, `YYYY-MM-DD`. */
  day: string
  categoryId: string | null
  parentCategoryId: string | null
}

function readCountedTransactions(
  from: string,
  to: string
): CountedTransaction[] {
  const db = getDb()
  if (!db) return []
  const { sql, params } = actualSpendingWhere({ from, to }, 't')
  const stmt = db.prepare(
    `SELECT t.id, t.amount, ${displayDaySql('t')}, t.category_id,
       COALESCE(t.parent_category_id, c.parent_id)
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${sql}
     ORDER BY t.id`
  )
  stmt.bind(params)
  const out: CountedTransaction[] = []
  while (stmt.step()) {
    const r = stmt.get()
    out.push({
      id: String(r[0]),
      amount: Number(r[1]),
      day: String(r[2]),
      categoryId: r[3] == null ? null : String(r[3]),
      parentCategoryId: r[4] == null ? null : String(r[4]),
    })
  }
  stmt.free()
  return out
}

/**
 * An active Tracker's plan for a calendar month: its planned figure and the
 * category set in effect on each day. The Trackers half of the month
 * attribution read, and of a Month-end plan (#242).
 */
export interface TrackerMonthPlan {
  trackerId: number
  name: string
  /** Budget Plan bucket, or `null` when it isn't in a bucket. */
  bucketId: number | null
  /** As `TrackerMonthLine.plannedCents`. */
  plannedCents: number | null
  /**
   * The category ids of the config in effect on each day of the month
   * (`YYYY-MM-DD` → ids, sorted). Empty on a day before its first config
   * version: nothing is claimed that day.
   */
  categoryIdsByDay: Map<string, string[]>
}

/** Every day of `[first, last]`, `YYYY-MM-DD`. */
function daysOf(first: string, last: string): string[] {
  const days: string[] = []
  for (let d = first; d <= last; d = addDaysToDateStr(d, 1)) days.push(d)
  return days
}

/**
 * Every active Tracker, in id order, with its planned figure and its config
 * in effect per day of `month` (`YYYY-MM`) ("config as of day D" = the version
 * with the greatest `effective_from <= D`, docs/adr/0014). A version's budget
 * is denominated in its own `reset_frequency`, or the Tracker's when that is
 * null (#38). A cadence that isn't a tracker reset frequency can't be priced,
 * so the Tracker gets no planned figure for the month (its actual still
 * counts).
 */
export function trackerPlansInMonth(month: string): TrackerMonthPlan[] {
  const { first, last } = calendarMonthDayBounds(month)
  const days = daysOf(first, last)
  const out: TrackerMonthPlan[] = []
  for (const { id } of getTrackersList()) {
    const tracker = getTracker(id)
    if (!tracker) continue
    const history = getTrackerConfigHistory(id)
    const categoryIdsByDay = new Map<string, string[]>()
    let weighted = 0
    let unpriceable = false
    for (const day of days) {
      let version: TrackerConfigVersion | null = null
      for (const v of history) {
        if (v.effective_from <= day) version = v
        else break
      }
      categoryIdsByDay.set(day, version ? [...version.category_ids].sort() : [])
      if (version) {
        const cadence = version.reset_frequency ?? tracker.reset_frequency
        if (
          !(TRACKER_RESET_FREQUENCY_ORDER as readonly string[]).includes(
            cadence
          )
        ) {
          unpriceable = true
          continue
        }
        weighted += toPeriodCents(version.budget_amount, cadence, 'MONTHLY')
      }
    }
    out.push({
      trackerId: id,
      name: tracker.name,
      bucketId: tracker.bucket_id,
      plannedCents: unpriceable ? null : Math.round(weighted / days.length),
      categoryIdsByDay,
    })
  }
  return out.sort((a, b) => a.trackerId - b.trackerId)
}

function buildUnplanned(transactions: CountedTransaction[]): Unplanned {
  let uncategorisedCents = 0
  const parentTotals = new Map<string, number>()
  const subTotals = new Map<string, Map<string, number>>()
  for (const tx of transactions) {
    const spent = -tx.amount
    if (tx.categoryId === null) {
      uncategorisedCents += spent
      continue
    }
    // Up categorises transactions to subcategories. A category with no parent
    // is itself a parent: its spending sits on that parent row directly.
    const parentId = tx.parentCategoryId ?? tx.categoryId
    parentTotals.set(parentId, (parentTotals.get(parentId) ?? 0) + spent)
    const subs = subTotals.get(parentId) ?? new Map<string, number>()
    if (tx.parentCategoryId !== null) {
      subs.set(tx.categoryId, (subs.get(tx.categoryId) ?? 0) + spent)
    }
    subTotals.set(parentId, subs)
  }
  const byId = <T>([a]: [string, T], [b]: [string, T]) =>
    a < b ? -1 : a > b ? 1 : 0
  const parents = [...parentTotals.entries()]
    .sort(byId)
    .map(([parentCategoryId, totalCents]) => ({
      parentCategoryId,
      totalCents,
      subcategories: [...(subTotals.get(parentCategoryId) ?? [])]
        .sort(byId)
        .map(([categoryId, cents]) => ({ categoryId, totalCents: cents })),
    }))
  return {
    totalCents:
      uncategorisedCents + parents.reduce((sum, p) => sum + p.totalCents, 0),
    parents,
    uncategorisedCents,
  }
}

/**
 * Where every Actual spending transaction in `month` (`YYYY-MM`) counts, with
 * planned vs actual per Regular and Tracker. Computed on every call. `plan`
 * judges the month against a Month-end plan instead of the live plan (#243):
 * its Linked payment matches, Tracker category sets and bucket membership.
 */
export function getMonthAttribution(
  month: string,
  plan?: MonthPlanInput
): MonthAttribution {
  const { first, last } = calendarMonthDayBounds(month)
  const counted = readCountedTransactions(first, last)
  const totalActualSpendingCents = counted.reduce(
    (sum, tx) => sum - tx.amount,
    0
  )

  // 1. Linked payments go to their Regular.
  const regulars = regularsInMonth(month, plan?.regulars)
  const countedIds = new Set(counted.map((tx) => tx.id))
  const linkedIds = new Set<string>()
  for (const line of regulars) {
    for (const payment of line.payments) {
      // Linked payments are read with the same Actual spending predicate, so
      // this can only fire if the two definitions drift apart.
      if (!countedIds.has(payment.transactionId)) {
        throw new Error(
          `Linked payment ${payment.transactionId} is not Actual spending`
        )
      }
      linkedIds.add(payment.transactionId)
    }
  }
  const rest = counted.filter((tx) => !linkedIds.has(tx.id))

  // 2. The active Tracker whose config in effect on the Display date includes
  // the category. 3. Else Unplanned.
  const trackers = (plan?.trackers ?? trackerPlansInMonth(month)).map(
    (tracker) => ({
      plan: tracker,
      line: {
        trackerId: tracker.trackerId,
        bucketId: tracker.bucketId,
        plannedCents: tracker.plannedCents,
        actualCents: 0,
      } satisfies TrackerMonthLine,
    })
  )
  const unplanned: CountedTransaction[] = []
  for (const tx of rest) {
    const owners =
      tx.categoryId === null
        ? []
        : trackers.filter((t) =>
            t.plan.categoryIdsByDay.get(tx.day)?.includes(tx.categoryId!)
          )
    // Exactly one owner takes it. Two Trackers claiming the same category on
    // the same day (ADR 0003 forbids sharing a category, but a back-dated
    // config row can overlap another Tracker's last days) is ambiguous, so
    // both decline and it goes to Unplanned — the same fail-safe as a payment
    // inside two Regulars' bands linking to neither (ADR 0020).
    if (owners.length === 1) owners[0].line.actualCents -= tx.amount
    else unplanned.push(tx)
  }

  return {
    month,
    totalActualSpendingCents,
    regulars,
    trackers: trackers.map((t) => t.line),
    unplanned: buildUnplanned(unplanned),
  }
}
