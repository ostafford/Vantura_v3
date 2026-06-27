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
  /** 'EXPENSE' (default) reduces net worth; 'LIABILITY_REPAYMENT' is asset-liability neutral. */
  charge_type: 'EXPENSE' | 'LIABILITY_REPAYMENT'
  /** Links a LIABILITY_REPAYMENT charge to a manual_accounts row. */
  linked_manual_account_id: number | null
  /** raw_text fingerprint of a linked transaction — used for sticky notification settlement detection. */
  match_raw_text: string | null
}

export interface UpcomingGrouped {
  nextPay: UpcomingChargeRow[]
  later: UpcomingChargeRow[]
  nextPayday: string | null
}

function todayDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr.slice(0, 10) + 'T12:00:00Z')
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const monthIndex = month + months
  const targetYear = year + Math.floor(monthIndex / 12)
  const targetMonth = ((monthIndex % 12) + 12) % 12
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate()
  const targetDay = Math.min(day, daysInTargetMonth)
  return new Date(Date.UTC(targetYear, targetMonth, targetDay, 12, 0, 0))
}

function stepOccurrence(dateStr: string, frequency: string): string | null {
  const d = parseDate(dateStr)
  switch (frequency) {
    case 'WEEKLY':
      return formatDate(addDays(d, 7))
    case 'FORTNIGHTLY':
      return formatDate(addDays(d, 14))
    case 'MONTHLY':
      return formatDate(addMonthsClamped(d, 1))
    case 'QUARTERLY':
      return formatDate(addMonthsClamped(d, 3))
    case 'YEARLY':
      return formatDate(addMonthsClamped(d, 12))
    case 'ONCE':
      return null
    default:
      return null
  }
}

export function firstOccurrenceOnOrAfter(
  nextChargeDate: string,
  frequency: string,
  targetDate: string,
  cancelByDate: string | null
): string | null {
  const base = nextChargeDate.slice(0, 10)
  const target = targetDate.slice(0, 10)
  const cancelBy = cancelByDate ? cancelByDate.slice(0, 10) : null
  if (cancelBy && target > cancelBy) return null
  if (frequency === 'ONCE') {
    if (base < target) return null
    if (cancelBy && base > cancelBy) return null
    return base
  }

  if (frequency === 'WEEKLY' || frequency === 'FORTNIGHTLY') {
    const stepDays = frequency === 'WEEKLY' ? 7 : 14
    const baseDate = parseDate(base)
    const targetDateObj = parseDate(target)
    const diffDays = Math.max(
      0,
      Math.ceil(
        (targetDateObj.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000)
      )
    )
    const jumps = Math.ceil(diffDays / stepDays)
    const occurrence = formatDate(addDays(baseDate, jumps * stepDays))
    if (cancelBy && occurrence > cancelBy) return null
    return occurrence
  }

  let occurrence = base
  let guard = 0
  while (occurrence < target && guard < 1000) {
    const next = stepOccurrence(occurrence, frequency)
    if (!next) return null
    occurrence = next
    guard += 1
  }
  if (cancelBy && occurrence > cancelBy) return null
  return occurrence >= target ? occurrence : null
}

function getProjectedOccurrencesInRange(
  row: UpcomingChargeRow,
  startDate: string,
  endDate: string
): UpcomingChargeRow[] {
  const list: UpcomingChargeRow[] = []
  let occurrence = firstOccurrenceOnOrAfter(
    row.next_charge_date,
    row.frequency,
    startDate,
    row.cancel_by_date
  )
  while (occurrence && occurrence <= endDate) {
    list.push({ ...row, next_charge_date: occurrence })
    const next = stepOccurrence(occurrence, row.frequency)
    if (!next) break
    if (row.cancel_by_date && next > row.cancel_by_date.slice(0, 10)) break
    occurrence = next
  }
  return list
}

export const __test__ = {
  stepOccurrence,
  firstOccurrenceOnOrAfter,
  getProjectedOccurrencesInRange,
}

function readUpcomingRows(
  db: NonNullable<ReturnType<typeof getDb>>
): UpcomingChargeRow[] {
  const stmt = db.prepare(
    `SELECT id, name, amount, frequency, next_charge_date, category_id, is_reserved,
      reminder_days_before, is_subscription, cancel_by_date,
      COALESCE(charge_type, 'EXPENSE'), linked_manual_account_id, match_raw_text
     FROM upcoming_charges ORDER BY next_charge_date`
  )
  const rows: UpcomingChargeRow[] = []
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
      string,
      number | null,
      string | null,
    ]
    rows.push({
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
      charge_type: (row[10] as 'EXPENSE' | 'LIABILITY_REPAYMENT') ?? 'EXPENSE',
      linked_manual_account_id: row[11] ?? null,
      match_raw_text: row[12] ?? null,
    })
  }
  stmt.free()
  return rows
}

export function getUpcomingChargesGrouped(): UpcomingGrouped {
  const db = getDb()
  if (!db) return { nextPay: [], later: [], nextPayday: null }
  const nextPayday = getAppSetting('next_payday')
  const nextPay: UpcomingChargeRow[] = []
  const later: UpcomingChargeRow[] = []
  const today = todayDateString()
  const rows = readUpcomingRows(db)
  for (const row of rows) {
    const nextOccurrence = firstOccurrenceOnOrAfter(
      row.next_charge_date,
      row.frequency,
      today,
      row.cancel_by_date
    )
    // Past ONCE charges are shown as overdue until the user explicitly deletes them.
    // All other frequencies (recurring) are silently dropped once their cycle is exhausted or cancelled.
    if (!nextOccurrence && row.frequency !== 'ONCE') continue
    const projected = {
      ...row,
      next_charge_date: nextOccurrence ?? row.next_charge_date,
    }
    if (nextPayday && projected.next_charge_date < nextPayday) {
      nextPay.push(projected)
    } else {
      later.push(projected)
    }
  }
  nextPay.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
  later.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
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
  cancelByDate: string | null = null,
  chargeType: 'EXPENSE' | 'LIABILITY_REPAYMENT' = 'EXPENSE',
  linkedManualAccountId: number | null = null,
  matchRawText: string | null = null
): number {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO upcoming_charges
       (name, amount, frequency, next_charge_date, category_id, is_reserved,
        reminder_days_before, is_subscription, cancel_by_date, created_at,
        charge_type, linked_manual_account_id, match_raw_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      chargeType,
      linkedManualAccountId ?? null,
      matchRawText ?? null,
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
  cancelByDate: string | null = null,
  chargeType: 'EXPENSE' | 'LIABILITY_REPAYMENT' = 'EXPENSE',
  linkedManualAccountId: number | null = null,
  matchRawText: string | null = null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(
    `UPDATE upcoming_charges SET
       name = ?, amount = ?, frequency = ?, next_charge_date = ?, category_id = ?,
       is_reserved = ?, reminder_days_before = ?, is_subscription = ?, cancel_by_date = ?,
       charge_type = ?, linked_manual_account_id = ?, match_raw_text = ?
     WHERE id = ?`,
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
      chargeType,
      linkedManualAccountId ?? null,
      matchRawText ?? null,
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
  const list: UpcomingChargeRow[] = []
  const rows = readUpcomingRows(db)
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
      reminder_days_before, is_subscription, cancel_by_date,
      COALESCE(charge_type, 'EXPENSE'), linked_manual_account_id, match_raw_text
     FROM upcoming_charges
     WHERE reminder_days_before IS NOT NULL
       AND (charge_type IS NULL OR charge_type = 'EXPENSE')
     ORDER BY next_charge_date`
  )
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
      string,
      number | null,
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
      charge_type: (row[10] as 'EXPENSE' | 'LIABILITY_REPAYMENT') ?? 'EXPENSE',
      linked_manual_account_id: row[11] ?? null,
      match_raw_text: row[12] ?? null,
    }
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
  stmt.free()
  list.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
  return list
}
