/**
 * Each Regular's planned vs actual for a calendar month (#186, #191) — the
 * Regulars half of the month attribution read (`@/services/monthAttribution`).
 *
 * - **planned** = the sum of its occurrences dated in the month, projected
 *   forward from the stored date only (docs/adr/0004); a `ONCE` Regular plans
 *   its full amount in its own month only.
 * - **actual** = the sum of its Linked payments in the month
 *   (`linkedPaymentsInMonth`), or `null` — no actual figure — when it has no
 *   `match_description`.
 * - **not paid** (linked Regulars only): an occurrence in the month and no
 *   Linked payment in the month, or an overdue `ONCE` (see `isOverdueOnceIn`).
 *
 * Regulars use their current amount, description and frequency for the whole
 * month; a deleted Regular isn't listed. Computed on every call.
 */

import { getDb } from '@/db'
import { calendarMonthDayBounds } from '@/lib/dateStr'
import { localDateString } from '@/lib/format'
import { linkedPaymentsInMonth, type LinkedPayment } from './linkedPayments'
import {
  firstOccurrenceOnOrAfter,
  getProjectedOccurrencesInRange,
} from './projection'
import { readRegularBucketIds, readRegulars, type Regular } from './rows'

export interface RegularMonth {
  regularId: number
  /** Budget Plan bucket, or `null` when it isn't in a bucket. */
  bucketId: number | null
  /** Sum of its occurrences dated in the month (cents). */
  plannedCents: number
  /**
   * Sum of its Linked payments in the month, positive = money out; `null`
   * (no actual figure) when it has no `match_description`.
   */
  actualCents: number | null
  /**
   * `true` when it is not paid this month; `null` when Vantura can't know
   * (no `match_description`).
   */
  notPaid: boolean | null
  /** Its Linked payments in the month, oldest first (empty when unlinked). */
  payments: LinkedPayment[]
}

/**
 * An overdue `ONCE` — its date has passed with no future occurrence (the
 * Regulars list's Overdue group) — counts as overdue in the months from its
 * own month through the current month.
 */
function isOverdueOnceIn(row: Regular, month: string, today: string): boolean {
  if (row.frequency !== 'ONCE') return false
  const overdue =
    firstOccurrenceOnOrAfter(
      row.next_charge_date,
      row.frequency,
      today,
      row.cancel_by_date
    ) === null
  return (
    overdue &&
    row.next_charge_date.slice(0, 7) <= month &&
    month <= today.slice(0, 7)
  )
}

/** Every Regular, in id order, with its planned vs actual for `month` (`YYYY-MM`). */
export function regularsInMonth(month: string): RegularMonth[] {
  const { first, last } = calendarMonthDayBounds(month)
  const db = getDb()
  if (!db) return []
  const today = localDateString()
  const buckets = readRegularBucketIds(db)
  const linked = new Map(
    linkedPaymentsInMonth(month).map((l) => [l.regularId, l])
  )
  return readRegulars(db).map((row) => {
    const occurrences = getProjectedOccurrencesInRange(row, first, last)
    const plannedCents = occurrences.reduce((sum, o) => sum + o.amount, 0)
    const bucketId = buckets.get(row.id) ?? null
    const link = linked.get(row.id)
    if (!link || !link.linked) {
      return {
        regularId: row.id,
        bucketId,
        plannedCents,
        actualCents: null,
        notPaid: null,
        payments: [],
      }
    }
    const unpaid = link.payments.length === 0
    return {
      regularId: row.id,
      bucketId,
      plannedCents,
      actualCents: link.payments.reduce((sum, p) => sum - p.amount, 0),
      notPaid:
        unpaid &&
        (occurrences.length > 0 || isOverdueOnceIn(row, month, today)),
      payments: link.payments,
    }
  })
}
