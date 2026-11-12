/**
 * **Confirmed pay** (#282, Spec E): the pay a Month without a plan's Saved is
 * worked out from, entered by the user for that month. Vantura never assumes
 * one: a month without a row reads "Pay not confirmed". Settings → Pay never
 * reads or writes these rows, so today's raise never rewrites last year.
 *
 * **Storage:** `confirmed_pays`, one row per month (`YYYY-MM`): the pay
 * amount in integer cents and the Pay frequency. Only months in the range of
 * Months without a plan (`getMonthsWithoutAPlan`) are written. A malformed
 * row (bad month, amount ≤ 0 or not a whole number of cents, or not a Pay
 * frequency) reads as no Confirmed pay.
 *
 * **Validation** matches Settings → Pay: the amount through
 * `parseAmountInput` and above zero, the frequency `WEEKLY` | `FORTNIGHTLY` |
 * `MONTHLY`. An unset frequency is refused, never assumed monthly.
 */

import { getDb, schedulePersist } from '@/db'
import { parseAmountInput } from '@/lib/amountInput'
import { addMonthsToMonthStr } from '@/lib/dateStr'
import { isPayFrequency, type PayFrequency } from '@/lib/payFrequency'
import type { Pay } from '@/services/budgetBuckets'
import { isMonth } from '@/services/monthEndPlan'
import { getMonthsWithoutAPlan } from '@/services/monthsWithoutAPlan'

/** The amount text as a pay, or `null` when Settings → Pay would refuse it. */
function payOf(amountText: string, frequency: unknown): Pay | null {
  const amount = parseAmountInput(amountText)
  if (!amount.ok || amount.cents === null || amount.cents <= 0) return null
  if (!isPayFrequency(frequency)) return null
  return { perPay: amount.cents, frequency }
}

/** A stored row's values as a pay, or `null` when malformed. */
function storedPay(cents: unknown, frequency: unknown): Pay | null {
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents <= 0) {
    return null
  }
  return isPayFrequency(frequency) ? { perPay: cents, frequency } : null
}

/** The Confirmed pay for `month` (`YYYY-MM`), or `null` when there's none. */
export function getConfirmedPay(month: string): Pay | null {
  const db = getDb()
  if (!db || !isMonth(month)) return null
  const rows = db.exec(
    `SELECT pay_amount_cents, pay_frequency FROM confirmed_pays WHERE month = ?`,
    [month]
  )
  const row = rows[0]?.values[0]
  return row ? storedPay(row[0], row[1]) : null
}

/**
 * **Bulk confirm:** writes the pay to every Month without a plan that has no
 * row, never overwriting one. Returns false, writing nothing, when the pay is
 * invalid or there are no Months without a plan.
 */
export function confirmPayForEarlierMonths(
  amountText: string,
  frequency: PayFrequency | null
): boolean {
  const db = getDb()
  const pay = payOf(amountText, frequency)
  const range = getMonthsWithoutAPlan()
  if (!db || !pay || !range) return false
  for (
    let month = range.firstMonth;
    month <= range.lastMonth;
    month = addMonthsToMonthStr(month, 1)
  ) {
    db.run(
      `INSERT OR IGNORE INTO confirmed_pays (month, pay_amount_cents, pay_frequency)
       VALUES (?, ?, ?)`,
      [month, pay.perPay, pay.frequency]
    )
  }
  schedulePersist()
  return true
}

/** True when `month` is a Month without a plan. */
function isMonthWithoutAPlan(month: string): boolean {
  const range = getMonthsWithoutAPlan()
  return (
    range !== null &&
    isMonth(month) &&
    month >= range.firstMonth &&
    month <= range.lastMonth
  )
}

/**
 * **Single-month change:** writes (or replaces) `month`'s Confirmed pay only.
 * Returns false, writing nothing, when the pay is invalid or `month` isn't a
 * Month without a plan.
 */
export function changePayForMonth(
  month: string,
  amountText: string,
  frequency: PayFrequency | null
): boolean {
  const db = getDb()
  const pay = payOf(amountText, frequency)
  if (!db || !pay || !isMonthWithoutAPlan(month)) return false
  db.run(
    `INSERT OR REPLACE INTO confirmed_pays (month, pay_amount_cents, pay_frequency)
     VALUES (?, ?, ?)`,
    [month, pay.perPay, pay.frequency]
  )
  schedulePersist()
  return true
}

/** A stored Confirmed pay, as the profile export carries it. */
export interface ConfirmedPayRow {
  month: string
  pay: Pay
}

/** Every well-formed Confirmed pay, oldest month first (malformed rows left out). */
export function readConfirmedPayRows(): ConfirmedPayRow[] {
  const db = getDb()
  if (!db) return []
  const rows = db.exec(
    `SELECT month, pay_amount_cents, pay_frequency FROM confirmed_pays ORDER BY month`
  )
  const out: ConfirmedPayRow[] = []
  for (const [month, cents, frequency] of rows[0]?.values ?? []) {
    const pay = storedPay(cents, frequency)
    if (isMonth(month) && pay) out.push({ month, pay })
  }
  return out
}

/** `cents` and `frequency` as a Confirmed pay, or `null` when either is invalid. */
export function parseConfirmedPay(
  cents: unknown,
  frequency: unknown
): Pay | null {
  return storedPay(cents, frequency)
}

/**
 * Replaces every Confirmed pay (a profile import). Must run inside the
 * import's transaction; it opens none. `rows` must already be validated.
 */
export function replaceConfirmedPays(rows: ConfirmedPayRow[]): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM confirmed_pays`)
  for (const { month, pay } of rows) {
    db.run(
      `INSERT INTO confirmed_pays (month, pay_amount_cents, pay_frequency)
       VALUES (?, ?, ?)`,
      [month, pay.perPay, pay.frequency]
    )
  }
}
