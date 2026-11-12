/**
 * **Months without a plan** (#282, Spec E; ADR 0025 amended by ADR 0027):
 * the finished months from the month the **Spending account** was opened up
 * to the month before the **First plannable month**. They're viewable on the
 * Budget Plan with no plan: Actual spending, Spending by category and Saved
 * from a Confirmed pay (`confirmedPay.ts`).
 *
 * - **Spending account** = the one `accounts` row with `account_type =
 *   'TRANSACTIONAL'` and an individual (not `JOINT`) `ownership_type`. When
 *   there isn't exactly one, there are no Months without a plan.
 * - **Opening month** = the local calendar month of its `created_at`. A
 *   Saver's `created_at` is never used: Up re-uses an underlying account when
 *   a Saver closes.
 * - **Range** = the opening month through the month before the First
 *   plannable month, with no cap. Empty when the First plannable month is
 *   unset or isn't after the opening month.
 * - **Closed Saver**: a month where a transaction on an account Vantura holds
 *   has a `transfer_account_id` that isn't in `accounts`. Up doesn't return
 *   closed Savers or their transactions, so that spending can't be seen and
 *   the month's Saved isn't worked out (`usedAClosedSaver`).
 */

import { getDb } from '@/db'
import { addDaysToDateStr, calendarMonthDayBounds } from '@/lib/dateStr'
import { localDateString } from '@/lib/format'
import { displayDayBetweenSql } from '@/services/displayDay'
import { getFirstPlannableMonth } from '@/services/monthEndPlan'

export interface MonthsWithoutAPlan {
  /** The Spending account's opening day, local `YYYY-MM-DD`. */
  openingDate: string
  /** The opening month, `YYYY-MM`: the first Month without a plan. */
  firstMonth: string
  /** The month before the First plannable month, `YYYY-MM`. */
  lastMonth: string
}

/** The Spending account's opening day (local), or `null` when unknown. */
function spendingAccountOpeningDate(): string | null {
  const db = getDb()
  if (!db) return null
  const rows = db.exec(
    `SELECT created_at FROM accounts
     WHERE account_type = 'TRANSACTIONAL'
       AND COALESCE(ownership_type, '') <> 'JOINT'`
  )
  const values = rows[0]?.values ?? []
  if (values.length !== 1) return null
  const opened = new Date(String(values[0][0]))
  return Number.isNaN(opened.getTime()) ? null : localDateString(opened)
}

/** The month before `month` (`YYYY-MM`). */
function previousMonth(month: string): string {
  return addDaysToDateStr(calendarMonthDayBounds(month).first, -1).slice(0, 7)
}

/** The range of Months without a plan, or `null` when it's empty. */
export function getMonthsWithoutAPlan(): MonthsWithoutAPlan | null {
  const firstPlannable = getFirstPlannableMonth()
  const openingDate = spendingAccountOpeningDate()
  if (firstPlannable === null || openingDate === null) return null
  const firstMonth = openingDate.slice(0, 7)
  if (firstPlannable <= firstMonth) return null
  return { openingDate, firstMonth, lastMonth: previousMonth(firstPlannable) }
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
