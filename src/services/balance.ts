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

export interface ReservedBreakdownItem {
  name: string
  projectedDate: string
  fullAmount: number
  reservedAmount: number
  occurrenceCount: number
  frequency: string
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

const PAYDAY_DAYS: Record<string, number> = {
  WEEKLY: 7,
  FORTNIGHTLY: 14,
  MONTHLY: 30,
}

interface ChargeReservedResult {
  reservedAmount: number
  occurrenceCount: number
  projectedDate: string
}

/**
 * Calculates the reserved amount for a single charge within the pay window.
 * Returns null if the charge has no qualifying occurrence before nextPayday.
 * Single source of truth — used by both calculateReservedAmount and calculateReservedBreakdown.
 */
function calcChargeReserved(
  charge: UpcomingChargeRow,
  nextPayday: string,
  paydayFrequency: string,
  today: string
): ChargeReservedResult | null {
  const projectedDate = firstOccurrenceOnOrAfter(
    charge.next_charge_date,
    charge.frequency,
    today,
    charge.cancel_by_date ?? null
  )
  if (!projectedDate || projectedDate > nextPayday) return null

  const daysUntilCharge = daysBetween(today, projectedDate)

  switch (charge.frequency) {
    case 'WEEKLY':
    case 'FORTNIGHTLY': {
      // Count every occurrence up to and including the payday date.
      // A 26-day window can contain 3–4 weekly or 2 fortnightly occurrences.
      const stepDays = charge.frequency === 'WEEKLY' ? 7 : 14
      let occDate = projectedDate
      let total = 0
      let count = 0
      while (occDate <= nextPayday) {
        if (charge.cancel_by_date && occDate > charge.cancel_by_date) break
        total += charge.amount
        count++
        const d = new Date(occDate + 'T12:00:00Z')
        d.setUTCDate(d.getUTCDate() + stepDays)
        occDate = d.toISOString().slice(0, 10)
      }
      return { reservedAmount: total, occurrenceCount: count, projectedDate }
    }
    case 'ONCE':
      return {
        reservedAmount: charge.amount,
        occurrenceCount: 1,
        projectedDate,
      }
    case 'MONTHLY':
    case 'QUARTERLY':
    case 'YEARLY': {
      const payPeriodDays = PAYDAY_DAYS[paydayFrequency] ?? 30
      const payPeriodsUntilCharge =
        payPeriodDays > 0 ? Math.ceil(daysUntilCharge / payPeriodDays) : 1
      const amountPerPeriod =
        payPeriodsUntilCharge > 0
          ? charge.amount / payPeriodsUntilCharge
          : charge.amount
      const portion = Math.round(Math.min(amountPerPeriod, charge.amount))
      return { reservedAmount: portion, occurrenceCount: 1, projectedDate }
    }
    default:
      return {
        reservedAmount: charge.amount,
        occurrenceCount: 1,
        projectedDate,
      }
  }
}

/**
 * Total reserved amount (cents) across all is_reserved charges due before next payday.
 */
export function calculateReservedAmount(
  upcomingCharges: UpcomingChargeRow[],
  nextPayday: string | null,
  paydayFrequency: string | null
): number {
  if (!nextPayday || !paydayFrequency) return 0
  const today = todayDateString()
  let total = 0
  for (const charge of upcomingCharges.filter((c) => c.is_reserved === 1)) {
    const result = calcChargeReserved(
      charge,
      nextPayday,
      paydayFrequency,
      today
    )
    if (result) total += result.reservedAmount
  }
  return Math.round(total)
}

/**
 * Same logic as calculateReservedAmount but returns per-charge detail rows.
 * Pure function — accepts charges array directly so it can be unit tested without a DB.
 */
export function calculateReservedBreakdown(
  charges: Array<UpcomingChargeRow & { name: string }>,
  nextPayday: string | null,
  paydayFrequency: string | null
): ReservedBreakdownItem[] {
  if (!nextPayday || !paydayFrequency) return []
  const today = todayDateString()
  const result: ReservedBreakdownItem[] = []
  for (const charge of charges.filter((c) => c.is_reserved === 1)) {
    const calc = calcChargeReserved(charge, nextPayday, paydayFrequency, today)
    if (!calc) continue
    result.push({
      name: charge.name,
      projectedDate: calc.projectedDate,
      fullAmount: charge.amount,
      reservedAmount: Math.round(calc.reservedAmount),
      occurrenceCount: calc.occurrenceCount,
      frequency: charge.frequency,
    })
  }
  return result
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
 * Informational only — Up Bank's API account balance already nets these out, so they are
 * NOT deducted from Spendable (doing so would double-count them).
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
 * Spendable = Available - Reserved (cents).
 * Up Bank's API account balance is already the net available balance (holds deducted at source),
 * so subtracting HELD transactions here would double-count them.
 */
export function getSpendableBalance(): number {
  const available = getAvailableBalance()
  const reserved = getReservedAmount()
  return available - reserved
}

/**
 * DB wrapper around calculateReservedBreakdown — loads charges from DB then delegates to the pure function.
 */
export function getReservedBreakdown(): ReservedBreakdownItem[] {
  const db = getDb()
  if (!db) return []
  const nextPayday = getAppSetting('next_payday')
  const paydayFrequency = getAppSetting('payday_frequency')
  const stmt = db.prepare(
    `SELECT name, next_charge_date, frequency, amount, is_reserved, cancel_by_date FROM upcoming_charges`
  )
  const rows: Array<UpcomingChargeRow & { name: string }> = []
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      string,
      string,
      number,
      number,
      string | null,
    ]
    rows.push({
      name: r[0],
      next_charge_date: r[1],
      frequency: r[2],
      amount: r[3],
      is_reserved: r[4],
      cancel_by_date: r[5],
    })
  }
  stmt.free()
  return calculateReservedBreakdown(rows, nextPayday, paydayFrequency)
}
