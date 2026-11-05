/**
 * The Regulars module (GLOSSARY: **Regular**; docs/adr/0021). Import from
 * `@/services/regulars` only — never its internal files, and never SELECT
 * `upcoming_charges` elsewhere.
 *
 * Reads are projected here (docs/adr/0004): `regularsByMonth`,
 * `regularOccurrencesInMonth`, `dueSoonRegulars`, `reservedBeforePayday`
 * (+ `totalReserved`), `regularsWithFundingSource`, `essentialsLinkHints`,
 * `linkedPaymentsInMonth`, `regularsInMonth`, `regularOccurrencesPaidInMonth`.
 * One returns stored rows by design: `regularById` (the editor's anchor).
 *
 * Internals: `rows.ts` (the one SELECT), `projection.ts`, `reserved.ts`,
 * `funding.ts`, `linkedPayments.ts`, `month.ts`, `paid.ts`, `draft.ts`.
 *
 * Writes (#160): a draft (`blankDraft` / `draftFromRegular` /
 * `draftFromTransaction` / `draftFromSuggestion`) → `validateRegularDraft` →
 * `saveRegular`, which applies the stored-date rule and writes the bucket in
 * the same write; and `deleteRegular`. Mark paid (#214): `markOccurrencePaid`
 * / `unmarkOccurrencePaid`.
 */

import { getDb } from '@/db'
import { localDateString } from '@/lib/format'
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

export type { Regular } from './rows'
export {
  reservedBeforePayday,
  totalReserved,
  type ReservedItem,
} from './reserved'
export {
  regularsWithFundingSource,
  essentialsLinkHints,
  type RegularWithFundingSource,
  type EssentialsLinkHint,
} from './funding'
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
   * `ONCE` charges whose date has passed with no future occurrence (`#18`). They
   * need an explicit "was this paid?" resolution, so they are kept out of
   * `thisMonth` and `later`.
   */
  overdue: Regular[]
  /** Next occurrence (on or after today) falls in the current calendar month. */
  thisMonth: Regular[]
  /** Next occurrence falls after the current calendar month. */
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
 * Every Regular grouped by date as Overdue / This month / Later (#193), each
 * at its next occurrence on or after today. Date only: paid status doesn't
 * affect the grouping.
 */
export function regularsByMonth(): RegularsByMonth {
  const db = getDb()
  if (!db) return { overdue: [], thisMonth: [], later: [] }
  const overdue: Regular[] = []
  const thisMonth: Regular[] = []
  const later: Regular[] = []
  const today = localDateString()
  const currentMonth = today.slice(0, 7)
  const rows = readRegularsByStoredDate(db)
  for (const row of rows) {
    const nextOccurrence = firstOccurrenceOnOrAfter(
      row.next_charge_date,
      row.frequency,
      today,
      row.cancel_by_date
    )
    if (!nextOccurrence) {
      // A recurring charge with an exhausted / cancelled cycle is silently
      // dropped. A past ONCE charge has nowhere to roll to — surface it as
      // overdue (at its stored past date) for an explicit "was this paid?"
      // resolution (#18).
      if (row.frequency === 'ONCE') overdue.push({ ...row })
      continue
    }
    const projected = { ...row, next_charge_date: nextOccurrence }
    if (nextOccurrence.slice(0, 7) === currentMonth) {
      thisMonth.push(projected)
    } else {
      later.push(projected)
    }
  }
  overdue.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
  thisMonth.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
  later.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
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
