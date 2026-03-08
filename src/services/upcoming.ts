/**
 * Upcoming charges: CRUD, group by Next pay / Later (Option A: edit/delete only, no auto-advance).
 */

import { getDb, getAppSetting, schedulePersist } from '@/db'

export interface UpcomingChargeRow {
  id: number
  name: string
  amount: number
  frequency: string
  next_charge_date: string
  category_id: string | null
  is_reserved: number
  /** Remind me this many days before next charge (null = no reminder). */
  reminder_days_before: number | null
  /** 1 if subscription (e.g. streaming); 0 otherwise. */
  is_subscription: number
  /** Optional date by which to cancel (for subscriptions). */
  cancel_by_date: string | null
}

export interface UpcomingGrouped {
  nextPay: UpcomingChargeRow[]
  later: UpcomingChargeRow[]
  nextPayday: string | null
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getUpcomingChargesGrouped(): UpcomingGrouped {
  const db = getDb()
  if (!db) return { nextPay: [], later: [], nextPayday: null }
  const nextPayday = getAppSetting('next_payday')
  const stmt = db.prepare(
    `SELECT id, name, amount, frequency, next_charge_date, category_id, is_reserved,
      reminder_days_before, is_subscription, cancel_by_date
     FROM upcoming_charges ORDER BY next_charge_date`
  )
  const nextPay: UpcomingChargeRow[] = []
  const later: UpcomingChargeRow[] = []
  const today = todayDateString()
  while (stmt.step()) {
    const row = stmt.get() as [
      number,
      string,
      number,
      string,
      string,
      string | null,
      number,
      number | null,
      number,
      string | null,
    ]
    const charge: UpcomingChargeRow = {
      id: row[0],
      name: row[1],
      amount: row[2],
      frequency: row[3],
      next_charge_date: row[4],
      category_id: row[5],
      is_reserved: row[6],
      reminder_days_before: row[7] ?? null,
      is_subscription: row[8] ?? 0,
      cancel_by_date: row[9] ?? null,
    }
    if (charge.next_charge_date < today) {
      continue
    }
    if (nextPayday && charge.next_charge_date < nextPayday) {
      nextPay.push(charge)
    } else {
      later.push(charge)
    }
  }
  stmt.free()
  return { nextPay, later, nextPayday }
}

export function createUpcomingCharge(
  name: string,
  amountCents: number,
  frequency: string,
  nextChargeDate: string,
  categoryId: string | null,
  isReserved: boolean,
  reminderDaysBefore: number | null = null,
  isSubscription: boolean = false,
  cancelByDate: string | null = null
): number {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, category_id, is_reserved, reminder_days_before, is_subscription, cancel_by_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      amountCents,
      frequency,
      nextChargeDate,
      categoryId,
      isReserved ? 1 : 0,
      reminderDaysBefore ?? null,
      isSubscription ? 1 : 0,
      cancelByDate ?? null,
      now,
    ]
  )
  const result = db.exec('SELECT last_insert_rowid()')
  const id = (result[0]?.values?.[0]?.[0] as number) ?? 0
  schedulePersist()
  return id
}

export function updateUpcomingCharge(
  id: number,
  name: string,
  amountCents: number,
  frequency: string,
  nextChargeDate: string,
  categoryId: string | null,
  isReserved: boolean,
  reminderDaysBefore: number | null = null,
  isSubscription: boolean = false,
  cancelByDate: string | null = null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(
    `UPDATE upcoming_charges SET name = ?, amount = ?, frequency = ?, next_charge_date = ?, category_id = ?, is_reserved = ?, reminder_days_before = ?, is_subscription = ?, cancel_by_date = ? WHERE id = ?`,
    [
      name,
      amountCents,
      frequency,
      nextChargeDate,
      categoryId,
      isReserved ? 1 : 0,
      reminderDaysBefore ?? null,
      isSubscription ? 1 : 0,
      cancelByDate ?? null,
      id,
    ]
  )
  schedulePersist()
}

export function deleteUpcomingCharge(id: number): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM upcoming_charges WHERE id = ?`, [id])
  schedulePersist()
}

/**
 * Charges whose next_charge_date falls in the given month (for calendar view).
 * month is 1-12, year is full year.
 */
export function getUpcomingChargesForMonth(
  year: number,
  month: number
): UpcomingChargeRow[] {
  const db = getDb()
  if (!db) return []
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const stmt = db.prepare(
    `SELECT id, name, amount, frequency, next_charge_date, category_id, is_reserved,
      reminder_days_before, is_subscription, cancel_by_date
     FROM upcoming_charges
     WHERE next_charge_date >= ? AND next_charge_date <= ?
     ORDER BY next_charge_date`
  )
  stmt.bind([start, end])
  const list: UpcomingChargeRow[] = []
  while (stmt.step()) {
    const row = stmt.get() as [
      number,
      string,
      number,
      string,
      string,
      string | null,
      number,
      number | null,
      number,
      string | null,
    ]
    list.push({
      id: row[0],
      name: row[1],
      amount: row[2],
      frequency: row[3],
      next_charge_date: row[4],
      category_id: row[5],
      is_reserved: row[6],
      reminder_days_before: row[7] ?? null,
      is_subscription: row[8] ?? 0,
      cancel_by_date: row[9] ?? null,
    })
  }
  stmt.free()
  return list
}

/** Days until next charge; negative if past. Used for "Due in N days" reminder. */
export function daysUntilCharge(nextChargeDate: string): number {
  const today = todayDateString()
  const a = new Date(today + 'T12:00:00Z').getTime()
  const b = new Date(nextChargeDate.slice(0, 10) + 'T12:00:00Z').getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

/**
 * Charges that are within their reminder window (due_days <= reminder_days_before).
 * Sorted by next_charge_date ascending (soonest first).
 */
export function getDueSoonCharges(): UpcomingChargeRow[] {
  const db = getDb()
  if (!db) return []
  const today = todayDateString()
  const stmt = db.prepare(
    `SELECT id, name, amount, frequency, next_charge_date, category_id, is_reserved,
      reminder_days_before, is_subscription, cancel_by_date
     FROM upcoming_charges
     WHERE reminder_days_before IS NOT NULL AND next_charge_date >= ?
     ORDER BY next_charge_date`
  )
  stmt.bind([today])
  const list: UpcomingChargeRow[] = []
  while (stmt.step()) {
    const row = stmt.get() as [
      number,
      string,
      number,
      string,
      string,
      string | null,
      number,
      number | null,
      number,
      string | null,
    ]
    const charge: UpcomingChargeRow = {
      id: row[0],
      name: row[1],
      amount: row[2],
      frequency: row[3],
      next_charge_date: row[4],
      category_id: row[5],
      is_reserved: row[6],
      reminder_days_before: row[7] ?? null,
      is_subscription: row[8] ?? 0,
      cancel_by_date: row[9] ?? null,
    }
    const days = daysUntilCharge(charge.next_charge_date)
    if (
      days >= 0 &&
      charge.reminder_days_before != null &&
      days <= charge.reminder_days_before
    ) {
      list.push(charge)
    }
  }
  stmt.free()
  return list
}
