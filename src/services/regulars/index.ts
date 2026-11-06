/**
 * The Regulars module (GLOSSARY: **Regular**; docs/adr/0021). Import from
 * `@/services/regulars` only — never its internal files, and never SELECT
 * `upcoming_charges` elsewhere.
 *
 * Reads are projected here (docs/adr/0004): `regularsByMonth`,
 * `regularOccurrencesInMonth`, `dueSoonRegulars`, `linkedPaymentsInMonth`,
 *, `regularsInMonth`, `regularOccurrencesPaidInMonth`.
 * One returns stored rows by design: `regularById` (the editor's anchor).
 *
 * Internals: `rows.ts` (the one SELECT), `projection.ts`,
 * `linkedPayments.ts`, `month.ts`, `paid.ts`, `draft.ts`.
 *
 * Writes (#160): a draft (`blankDraft` / `draftFromRegular` /
 * `draftFromTransaction` / `draftFromSuggestion`) → `validateRegularDraft` →
 * `saveRegular`, which applies the stored-date rule and writes the bucket in
 * the same write; and `deleteRegular`. Mark paid (#214): `markOccurrencePaid`
 * / `unmarkOccurrencePaid`.
 */

import { getDb } from '@/db'
import { localDateString } from '@/lib/format'
import { addDaysToDateStr, calendarMonthDayBounds } from '@/lib/dateStr'
import {
  readRegulars,
  readRegularById,
  byStoredDate,
  type Regular,
} from './rows'
import {
  nthOccurrence,
  firstOccurrenceOnOrAfter,
  getProjectedOccurrencesInRange,
} from './projection'
import { regularOccurrencesPaidInMonth } from './paid'

export type { Regular } from './rows'
export {
  blankDraft,
  draftFromRegular,
  draftFromTransaction,
  draftFromSuggestion,
  validateRegularDraft,
  saveRegular,
  deleteRegular,
  type RegularDraft,
  type RegularDraftErrors,
  type RegularDraftField,
  type DraftSourceTransaction,
  type DraftSourceSuggestion,
} from './draft'
export {
  linkedPaymentsInMonth,
  type LinkedPayment,
  type RegularLinkedPayments,
} from './linkedPayments'
export { regularsInMonth, type RegularMonth } from './month'
export {
  regularOccurrencesPaidInMonth,
  markOccurrencePaid,
  unmarkOccurrencePaid,
  readPaidMarks,
  type RegularOccurrencePaid,
  type RegularPaidMark,
} from './paid'
export {
  nextChargeDateFromAnchor,
  firstOccurrenceOnOrAfter,
} from './projection'

export interface RegularsByMonth {
  /**
   * Regulars whose earliest unpaid occurrence this calendar month is before
   * today, at that occurrence; plus a past-month `ONCE` that isn't paid, at its
   * stored date (#18). Oldest first.
   */
  overdue: Regular[]
  /** Earliest unpaid occurrence this month is today or later, at that date. */
  thisMonth: Regular[]
  /**
   * No unpaid occurrence this month (none dated this month, or all paid), at
   * its first occurrence after this month.
   */
  later: Regular[]
}

export const __test__ = {
  nthOccurrence,
  firstOccurrenceOnOrAfter,
  getProjectedOccurrencesInRange,
}

/** Every Regular in stored-date order (ties by id), the order the list views use. */
function readRegularsByStoredDate(
  db: NonNullable<ReturnType<typeof getDb>>
): Regular[] {
  return readRegulars(db).sort(byStoredDate)
}

/**
 * Every Regular, one row each, placed by its **earliest unpaid occurrence**
 * (#183 decision 4, #217), so Upcoming agrees with Still to go out:
 *
 * - **Overdue:** before today, in this calendar month. Past months' unpaid
 *   occurrences don't count, except a past-month `ONCE`, which stays Overdue
 *   at its stored date until it's paid (#18).
 * - **This month:** from today to month end.
 * - **Later:** no unpaid occurrence this month (none dated this month, or all
 *   paid), at its first occurrence after this month. A Regular with no
 *   occurrence after this month is dropped then (a paid `ONCE`, or a recurring
 *   one past its cancel-by date), never deleted.
 *
 * Paid is the per-occurrence read (`regularOccurrencesPaidInMonth`).
 */
export function regularsByMonth(): RegularsByMonth {
  const db = getDb()
  if (!db) return { overdue: [], thisMonth: [], later: [] }
  const overdue: Regular[] = []
  const thisMonth: Regular[] = []
  const later: Regular[] = []
  const today = localDateString()
  const currentMonth = today.slice(0, 7)
  const nextMonthFirst = addDaysToDateStr(
    calendarMonthDayBounds(currentMonth).last,
    1
  )

  // Earliest unpaid occurrence this month, per Regular (the read is in date
  // order, so the first unpaid one seen is the earliest).
  const earliestUnpaid = new Map<number, string>()
  for (const o of regularOccurrencesPaidInMonth(currentMonth)) {
    if (!o.paid && !earliestUnpaid.has(o.regular.id)) {
      earliestUnpaid.set(o.regular.id, o.date)
    }
  }
  // Past-month ONCE: paid in its own month's read, memoised per month.
  const paidByMonth = new Map<string, Set<number>>()
  const isPaidOnceIn = (row: Regular): boolean => {
    const month = row.next_charge_date.slice(0, 7)
    let paid = paidByMonth.get(month)
    if (!paid) {
      paid = new Set(
        regularOccurrencesPaidInMonth(month)
          .filter((o) => o.paid)
          .map((o) => o.regular.id)
      )
      paidByMonth.set(month, paid)
    }
    return paid.has(row.id)
  }

  for (const row of readRegularsByStoredDate(db)) {
    const unpaid = earliestUnpaid.get(row.id)
    if (unpaid) {
      const projected = { ...row, next_charge_date: unpaid }
      if (unpaid < today) overdue.push(projected)
      else thisMonth.push(projected)
      continue
    }
    if (
      row.frequency === 'ONCE' &&
      row.next_charge_date.slice(0, 7) < currentMonth
    ) {
      if (!isPaidOnceIn(row)) overdue.push({ ...row })
      continue
    }
    const next = firstOccurrenceOnOrAfter(
      row.next_charge_date,
      row.frequency,
      nextMonthFirst,
      row.cancel_by_date
    )
    if (next) later.push({ ...row, next_charge_date: next })
  }
  const byDate = (a: Regular, b: Regular) =>
    a.next_charge_date.localeCompare(b.next_charge_date)
  overdue.sort(byDate)
  thisMonth.sort(byDate)
  later.sort(byDate)
  return { overdue, thisMonth, later }
}

/** A single charge by id (raw stored row, no date projection), or null. */
export function regularById(id: number): Regular | null {
  const db = getDb()
  if (!db) return null
  return readRegularById(db, id)
}

/**
 * Charges whose next_charge_date falls in the given month (for calendar view).
 * month is 1-12, year is full year.
 */
export function regularOccurrencesInMonth(
  year: number,
  month: number
): Regular[] {
  const db = getDb()
  if (!db) return []
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const list: Regular[] = []
  const rows = readRegularsByStoredDate(db)
  for (const row of rows) {
    list.push(...getProjectedOccurrencesInRange(row, start, end))
  }
  list.sort((a, b) => {
    const byDate = a.next_charge_date.localeCompare(b.next_charge_date)
    if (byDate !== 0) return byDate
    return a.id - b.id
  })
  return list
}

/** Days until next charge; negative if past. Used for "Due in N days" reminder. */
export function daysUntilCharge(nextChargeDate: string): number {
  const today = localDateString()
  const a = new Date(today + 'T12:00:00Z').getTime()
  const b = new Date(nextChargeDate.slice(0, 10) + 'T12:00:00Z').getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

/**
 * Charges that are within their reminder window (due_days <= reminder_days_before).
 * Sorted by next_charge_date ascending (soonest first).
 */
export function dueSoonRegulars(): Regular[] {
  const db = getDb()
  if (!db) return []
  const today = localDateString()
  const candidates = readRegularsByStoredDate(db).filter(
    (c) => c.reminder_days_before != null
  )
  const list: Regular[] = []
  for (const charge of candidates) {
    const nextOccurrence = firstOccurrenceOnOrAfter(
      charge.next_charge_date,
      charge.frequency,
      today,
      charge.cancel_by_date
    )
    if (!nextOccurrence) continue
    const projected = { ...charge, next_charge_date: nextOccurrence }
    const days = daysUntilCharge(projected.next_charge_date)
    if (
      days >= 0 &&
      projected.reminder_days_before != null &&
      days <= projected.reminder_days_before
    ) {
      list.push(projected)
    }
  }
  list.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
  return list
}
