/**
 * Every Regular as it stands, with its occurrences dated in a calendar month
 * and the paid marks on them — the Regulars half of a **Month-end plan**
 * (#242, `@/services/monthEndPlan`).
 *
 * Occurrences are projected from the stored date only (docs/adr/0004), the
 * same projection `regularsInMonth` plans from. A mark is copied only when its
 * date is one of those occurrences: a stale mark (one whose date an edit moved
 * away from) is ignored by the paid read, so it isn't copied either.
 */

import { getDb } from '@/db'
import { calendarMonthDayBounds } from '@/lib/dateStr'
import { readPaidMarks, type RegularPaidMark } from './paid'
import { getProjectedOccurrencesInRange } from './projection'
import { readRegulars, type Regular } from './rows'

/**
 * A finished month's Regulars from its Month-end plan, read in place of the
 * live table (#243): the rows as frozen, their occurrences in the month and
 * the month's paid marks. Linked payments are still matched over live
 * transactions, against these rows.
 */
export interface RegularsPlanInput {
  /** As frozen; `next_charge_date` is the stored anchor. */
  rows: Regular[]
  /** Each Regular's occurrence dates in the month, as frozen. */
  occurrences: Map<number, string[]>
  /** The month's marks, as frozen (past-month marks live in the plan). */
  marks: RegularPaidMark[]
}

export interface RegularPlanInMonth {
  /** The Regular as stored (`next_charge_date` is the anchor, not projected). */
  regular: Regular
  /** Its occurrence dates in the month, oldest first (empty when none). */
  occurrences: string[]
  /** The marks on those occurrences, oldest first. */
  marks: RegularPaidMark[]
}

/** Every Regular, in id order, with its occurrences and marks in `month` (`YYYY-MM`). */
export function regularPlansInMonth(month: string): RegularPlanInMonth[] {
  const db = getDb()
  if (!db) return []
  const { first, last } = calendarMonthDayBounds(month)
  const marks = readPaidMarks()
  return readRegulars(db).map((regular) => {
    const occurrences = getProjectedOccurrencesInRange(regular, first, last)
      .map((o) => o.next_charge_date)
      .sort()
    const dates = new Set(occurrences)
    return {
      regular,
      occurrences,
      marks: marks.filter(
        (m) => m.regularId === regular.id && dates.has(m.occurrenceDate)
      ),
    }
  })
}
