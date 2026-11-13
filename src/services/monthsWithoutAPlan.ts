/**
 * **Months without a plan** (#282, Spec E; ADR 0025 amended by ADR 0027):
 * the finished months from the month the **Spending account** was opened up
 * to the month before the **First plannable month**. They're viewable on the
 * Budget Plan with no plan: Actual spending, Spending by category and Saved
 * from a Confirmed pay (`confirmedPay.ts`).
 *
 * - **Spending account** = the one open (`is_closed = 0`) `accounts` row with
 *   `account_type = 'TRANSACTIONAL'` and `ownership_type = 'INDIVIDUAL'`. A
 *   missing ownership type isn't assumed individual. When there isn't exactly
 *   one, there are no Months without a plan.
 * - **Opening month** = the calendar month of its `created_at` as Up dates
 *   it: the first 10 characters, the same rule as Display date
 *   (`displayDay.ts`), so it agrees with the transaction windows whatever
 *   the device's time zone. A Saver's `created_at` is never used: Up re-uses
 *   an underlying account when a Saver closes.
 * - **Range** = the opening month through the month before the First
 *   plannable month, with no cap. Empty when the First plannable month is
 *   unset or isn't after the opening month.
 * - **Closed Saver**: a month where a transaction on an account Vantura holds
 *   has a `transfer_account_id` that isn't in `accounts`. Up doesn't return
 *   closed Savers or their transactions, so that spending can't be seen and
 *   the month's Saved isn't worked out (`usedAClosedSaver`).
 */

import { getDb } from '@/db'
import { addMonthsToMonthStr, calendarMonthDayBounds } from '@/lib/dateStr'
import { displayDayBetweenSql, toDayBound } from '@/services/displayDay'
import { getFirstPlannableMonth } from '@/services/monthEndPlan'

export interface MonthsWithoutAPlan {
  /** The Spending account's opening day, local `YYYY-MM-DD`. */
  openingDate: string
  /** The opening month, `YYYY-MM`: the first Month without a plan. */
  firstMonth: string
  /** The month before the First plannable month, `YYYY-MM`. */
  lastMonth: string
}

/** True when `day` is a real calendar day, `YYYY-MM-DD`. */
function isDay(day: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return false
  const [y, m, d] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

/** The Spending account's opening day as Up dates it, or `null` when unknown. */
function spendingAccountOpeningDate(): string | null {
  const db = getDb()
  if (!db) return null
  const rows = db.exec(
    `SELECT created_at FROM accounts
     WHERE account_type = 'TRANSACTIONAL'
       AND ownership_type = 'INDIVIDUAL'
       AND is_closed = 0`
  )
  const values = rows[0]?.values ?? []
  if (values.length !== 1) return null
  const day = toDayBound(String(values[0][0]))
  return isDay(day) ? day : null
}

/** The range of Months without a plan, or `null` when it's empty. */
export function getMonthsWithoutAPlan(): MonthsWithoutAPlan | null {
  const firstPlannable = getFirstPlannableMonth()
  const openingDate = spendingAccountOpeningDate()
  if (firstPlannable === null || openingDate === null) return null
  const firstMonth = openingDate.slice(0, 7)
  if (firstPlannable <= firstMonth) return null
  return {
    openingDate,
    firstMonth,
    lastMonth: addMonthsToMonthStr(firstPlannable, -1),
  }
}

/** True when `month` (`YYYY-MM`) is in `range`. */
export function isInRange(
  month: string,
  range: MonthsWithoutAPlan | null
): range is MonthsWithoutAPlan {
  return range !== null && month >= range.firstMonth && month <= range.lastMonth
}

/**
 * True when a transaction in `month` (`YYYY-MM`, by Display date) on an
 * account Vantura holds transferred to or from an account it doesn't hold:
 * a Saver that has since closed.
 */
export function usedAClosedSaver(month: string): boolean {
  const db = getDb()
  if (!db) return false
  const { first, last } = calendarMonthDayBounds(month)
  const rows = db.exec(
    `SELECT 1 FROM transactions t
     WHERE t.account_id IN (SELECT id FROM accounts)
       AND t.transfer_account_id IS NOT NULL
       AND t.transfer_account_id NOT IN (SELECT id FROM accounts)
       AND ${displayDayBetweenSql('t')}
     LIMIT 1`,
    [first, last]
  )
  return rows.length > 0 && rows[0].values.length > 0
}
