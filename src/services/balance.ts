/**
 * Spendable balance: available (transactional accounts) minus reserved (prorated upcoming charges).
 * Reserved calculation per Arch_Docs 05_Calculation_logic.md Section 5.2.
 */

import { getDb, getAppSetting } from '@/db'
import type { PaydayFrequency } from '@/lib/payday'
import { firstOccurrenceOnOrAfter } from './upcoming'

export type { PaydayFrequency }

export interface UpcomingChargeRow {
  next_charge_date: string
  frequency: string
  amount: number
  is_reserved: number
  cancel_by_date?: string | null
}

function todayDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(dateStrA: string, dateStrB: string): number {
  const a = new Date(dateStrA + 'T12:00:00Z').getTime()
  const b = new Date(dateStrB + 'T12:00:00Z').getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

/**
 * Prorated reserved amount (cents) from upcoming charges before next payday.
 * Only charges with next_charge_date before nextPayday and in the future; filter by is_reserved = 1 at call site.
 */
export function calculateReservedAmount(
  upcomingCharges: UpcomingChargeRow[],
  nextPayday: string | null,
  paydayFrequency: string | null
): number {
  if (!nextPayday || !paydayFrequency) return 0
  const charges = upcomingCharges.filter((c) => c.is_reserved === 1)
  let totalReserved = 0
  const paydayDays: Record<string, number> = {
    WEEKLY: 7,
    FORTNIGHTLY: 14,
    MONTHLY: 30,
  }
  const today = todayDateString()

  for (const charge of charges) {
    const projectedChargeDate = firstOccurrenceOnOrAfter(
      charge.next_charge_date,
      charge.frequency,
      today,
      charge.cancel_by_date ?? null
    )
    if (!projectedChargeDate) continue
    // Include charges due ON the payday — Up Bank sees them as needing current funds.
    // Previously used >=, which excluded payday-date charges.
    if (projectedChargeDate > nextPayday) continue

    const daysUntilCharge = daysBetween(today, projectedChargeDate)

    switch (charge.frequency) {
      case 'WEEKLY':
      case 'FORTNIGHTLY': {
        // Loop through every occurrence up to (and including) the payday date.
        // A 26-day pay window can contain 3–4 weekly or 2 fortnightly occurrences;
        // previously only the first occurrence was counted.
        const stepDays = charge.frequency === 'WEEKLY' ? 7 : 14
        let occDate = projectedChargeDate
        while (occDate <= nextPayday) {
          if (charge.cancel_by_date && occDate > charge.cancel_by_date) break
          totalReserved += charge.amount
          const d = new Date(occDate + 'T12:00:00Z')
          d.setUTCDate(d.getUTCDate() + stepDays)
          occDate = d.toISOString().slice(0, 10)
        }
        break
      }
      case 'ONCE':
        totalReserved += charge.amount
        break
      case 'MONTHLY':
      case 'QUARTERLY':
      case 'YEARLY': {
        const payPeriodDays = paydayDays[paydayFrequency] ?? 30
        const payPeriodsUntilCharge =
          payPeriodDays > 0 ? Math.ceil(daysUntilCharge / payPeriodDays) : 1
        const amountPerPeriod =
          payPeriodsUntilCharge > 0
            ? charge.amount / payPeriodsUntilCharge
            : charge.amount
        const portionToReserve = Math.min(amountPerPeriod, charge.amount)
        totalReserved += portionToReserve
        break
      }
      default:
        totalReserved += charge.amount
    }
  }
  return Math.round(totalReserved)
}

/**
 * Pay amount per pay period (cents) from app_settings. Returns null when not set or invalid.
 */
export function getPayAmountCents(): number | null {
  const raw = getAppSetting('pay_amount_cents')
  if (raw == null || raw === '') return null
  const cents = parseInt(raw, 10)
  return Number.isNaN(cents) || cents < 0 ? null : cents
}

/**
 * Sum of absolute amounts (cents) of all HELD (authorised but not yet settled) transactions.
 * Up Bank deducts these from their displayed Spendable; Vantura's stored account balance may
 * not yet reflect them depending on when the API last settled them.
 */
export function getHeldTransactionTotal(): number {
  const db = getDb()
  if (!db) return 0
  const stmt = db.prepare(
    `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions WHERE status = 'HELD' AND amount < 0`
  )
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
}

/**
 * Sum of balances (cents) of all transactional accounts.
 */
export function getAvailableBalance(): number {
  const db = getDb()
  if (!db) return 0
  const stmt = db.prepare(
    `SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE account_type = 'TRANSACTIONAL' AND is_closed = 0`
  )
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
}

/**
 * Reserved amount (cents) from upcoming_charges using 5.2 proration.
 */
export function getReservedAmount(): number {
  const db = getDb()
  if (!db) return 0
  const nextPayday = getAppSetting('next_payday')
  const paydayFrequency = getAppSetting('payday_frequency')
  const stmt = db.prepare(
    `SELECT next_charge_date, frequency, amount, is_reserved, cancel_by_date FROM upcoming_charges`
  )
  const charges: UpcomingChargeRow[] = []
  while (stmt.step()) {
    const row = stmt.get() as [string, string, number, number, string | null]
    charges.push({
      next_charge_date: row[0],
      frequency: row[1],
      amount: row[2],
      is_reserved: row[3],
      cancel_by_date: row[4] ?? null,
    })
  }
  stmt.free()
  return calculateReservedAmount(charges, nextPayday, paydayFrequency)
}

/**
 * Spendable = Available - Held - Reserved (cents).
 * HELD transactions are authorised but unsettled; Up Bank's API returns the gross ledger balance
 * so these must be subtracted here to match what Up Bank displays as Spendable.
 */
export function getSpendableBalance(): number {
  const available = getAvailableBalance()
  const reserved = getReservedAmount()
  const held = getHeldTransactionTotal()
  return available - reserved - held
}
