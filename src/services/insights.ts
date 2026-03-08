/**
 * Weekly insights per 05_Calculation_logic 5.4 and 04_Core_Features 4.5.
 *
 * Term definitions (aligned with Up Bank app and product intent):
 *
 * - Money In: Real income only (salary, refunds, etc.). Excludes internal transfers
 *   (e.g. from a saver back to spending). Filter: amount > 0 AND transfer_account_id IS NULL.
 *
 * - Money Out: Spending only (purchases, charges). Excludes internal transfers out
 *   (e.g. to a saver). Filter: amount < 0 AND transfer_account_id IS NULL.
 *
 * - Savers: Net movement to/from any saver account (Loose Change, Investing, Bupa Insurance,
 *   Rego, etc.). Filter: transfer_account_id IN (accounts WHERE account_type = 'SAVER').
 *
 * - Charges: Count of spending transactions. Same rules as Money Out (negative, non-transfer).
 *   One charge per purchase (e.g. Coles, ALDI).
 *
 * - Payments made: Scheduled or manual payments to external parties (BPAY, PayID, bank transfer)
 *   where Up app shows Payment Method = Payment. Filter: transfer_type IS NOT NULL.
 *   Currently 0 because we do not set transfer_type from the API yet; reserved for future use.
 *
 * - Category chart: Spending by category (same as Money Out), no transfers. Same filter as
 *   Money Out, grouped by category_id.
 */

import { getDb } from '@/db'

export interface WeekRange {
  start: Date
  end: Date
  startStr: string
  endStr: string
}

/**
 * Week Monday–Sunday. Optional weekOffset: 0 = current week, -1 = previous week, etc.
 * start/end are local Date objects for display. startStr/endStr match the Transactions page
 * (date-only start, end with T23:59:59.999Z). Week range uses created_at (transaction first
 * encountered) for consistency with the Up app.
 */
function toDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth()
  const day = d.getDate()
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function getWeekRange(weekOffset?: number): WeekRange {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  if (weekOffset !== undefined && weekOffset !== 0) {
    const days = weekOffset * 7
    monday.setDate(monday.getDate() + days)
    sunday.setDate(sunday.getDate() + days)
  }
  monday.setHours(0, 0, 0, 0)
  const endOfSundayLocal = new Date(sunday)
  endOfSundayLocal.setHours(23, 59, 59, 999)
  const startStr = toDateOnly(monday)
  const endStr = toDateOnly(sunday) + 'T23:59:59.999Z'
  return {
    start: monday,
    end: endOfSundayLocal,
    startStr,
    endStr,
  }
}

/**
 * Raw count of transactions in the week range (no filters). For debug only.
 */
export function getWeeklyInsightsRawCount(weekRange?: WeekRange): number {
  const db = getDb()
  if (!db) return 0
  const { startStr, endStr } = weekRange ?? getWeekRange()
  const stmt = db.prepare(
    `SELECT COUNT(*) FROM transactions WHERE COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`
  )
  stmt.bind([startStr, endStr])
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
}

/** Debug breakdown: counts by filter so we can see why charges/money out might be 0. Dev only. */
export interface WeeklyInsightsDebugCounts {
  /** Same as Charges in Weekly Insights: spending transactions (negative, transfer_account_id IS NULL). */
  charges: number
  /** Transactions with is_round_up = 1 (round-up credits to savers). */
  roundUps: number
  /** Transactions with transfer_account_id set (includes round-ups and explicit transfers). */
  transfers: number
}

export function getWeeklyInsightsDebugCounts(
  weekRange?: WeekRange
): WeeklyInsightsDebugCounts {
  const db = getDb()
  if (!db) return { charges: 0, roundUps: 0, transfers: 0 }
  const { startStr, endStr } = weekRange ?? getWeekRange()
  const bounds = `COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`
  const params = [startStr, endStr]
  const run = (where: string, p: (string | number)[] = params) => {
    const stmt = db.prepare(`SELECT COUNT(*) FROM transactions WHERE ${where}`)
    stmt.bind(p)
    stmt.step()
    const row = stmt.get()
    stmt.free()
    return row ? Number(row[0]) : 0
  }
  return {
    charges: run(`amount < 0 AND transfer_account_id IS NULL AND ${bounds}`),
    roundUps: run(`is_round_up = 1 AND ${bounds}`),
    transfers: run(`transfer_account_id IS NOT NULL AND ${bounds}`),
  }
}

/**
 * Weekly insight metrics. See file-level comment for definition of each term.
 */
export interface WeeklyInsightsData {
  /** Real income only (no internal transfers). */
  moneyIn: number
  /** Spending only (purchases/charges; no internal transfers out). */
  moneyOut: number
  /** Net movement to/from saver accounts (Loose Change, Investing, etc.). */
  saverChanges: number
  /** Count of spending transactions (same set as moneyOut). */
  charges: number
  /** Count of external payments (BPAY, PayID, etc.); 0 until transfer_type is set from API. */
  payments: number
}

/**
 * Returns weekly insight metrics for the given week. See file-level comment and WeeklyInsightsData
 * for definitions of moneyIn, moneyOut, saverChanges, charges, and payments.
 */
export function getWeeklyInsights(weekRange?: WeekRange): WeeklyInsightsData {
  const db = getDb()
  if (!db)
    return { moneyIn: 0, moneyOut: 0, saverChanges: 0, charges: 0, payments: 0 }
  const { startStr, endStr } = weekRange ?? getWeekRange()

  const runOne = (sql: string, params: (string | number)[]): number => {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    stmt.step()
    const row = stmt.get()
    stmt.free()
    return row ? Number(row[0]) : 0
  }

  // Money In: real income; exclude internal transfers
  const moneyIn = runOne(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE amount > 0 AND transfer_account_id IS NULL AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [startStr, endStr]
  )
  // Money Out: spending only; exclude internal transfers (e.g. to savers)
  const moneyOut = runOne(
    `SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions
     WHERE amount < 0 AND transfer_account_id IS NULL
     AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [startStr, endStr]
  )
  // Savers: net movement to/from any saver account
  const saverChanges = runOne(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE transfer_account_id IN (SELECT id FROM accounts WHERE account_type = 'SAVER')
     AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [startStr, endStr]
  )
  // Charges: count of spending transactions (same filter as Money Out)
  const charges = runOne(
    `SELECT COUNT(*) FROM transactions
     WHERE amount < 0 AND transfer_account_id IS NULL AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [startStr, endStr]
  )
  // Payments made: external payments (BPAY, PayID, etc.); transfer_type set when API supports it
  const payments = runOne(
    `SELECT COUNT(*) FROM transactions
     WHERE transfer_type IS NOT NULL AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [startStr, endStr]
  )

  return { moneyIn, moneyOut, saverChanges, charges, payments }
}

export interface CategoryBreakdownRow {
  category_id: string
  category_name: string
  total: number
}

/**
 * Multi-week insights history for analytics. Returns array from oldest to newest.
 */
export interface InsightsHistoryRow {
  weekOffset: number
  weekLabel: string
  weekStart: string
  weekEnd: string
  moneyIn: number
  moneyOut: number
  saverChanges: number
  charges: number
}

export function getInsightsHistory(weeksBack: number): InsightsHistoryRow[] {
  const result: InsightsHistoryRow[] = []
  for (let offset = -weeksBack + 1; offset <= 0; offset++) {
    const range = getWeekRange(offset)
    const insights = getWeeklyInsights(range)
    const startStr = range.startStr
    const endStr = range.endStr.slice(0, 10)
    const label =
      offset === 0
        ? 'This week'
        : offset === -1
          ? 'Last week'
          : `${-offset} weeks ago`
    result.push({
      weekOffset: offset,
      weekLabel: label,
      weekStart: startStr,
      weekEnd: endStr,
      moneyIn: insights.moneyIn,
      moneyOut: insights.moneyOut,
      saverChanges: insights.saverChanges,
      charges: insights.charges,
    })
  }
  return result
}

/**
 * Per-category spending for a category over multiple weeks (for trend comparison).
 */
export interface CategoryBreakdownHistoryRow {
  weekOffset: number
  weekLabel: string
  weekStart: string
  total: number
}

export function getCategoryBreakdownHistory(
  categoryId: string,
  weeksBack: number
): CategoryBreakdownHistoryRow[] {
  const result: CategoryBreakdownHistoryRow[] = []
  for (let offset = -weeksBack + 1; offset <= 0; offset++) {
    const range = getWeekRange(offset)
    const rows = getWeeklyCategoryBreakdown(range)
    const row = rows.find((r) => r.category_id === categoryId)
    const label =
      offset === 0
        ? 'This week'
        : offset === -1
          ? 'Last week'
          : `${-offset}w ago`
    result.push({
      weekOffset: offset,
      weekLabel: label,
      weekStart: range.startStr,
      total: row?.total ?? 0,
    })
  }
  return result
}

/**
 * Spending by category for the week. Same definition as Money Out (spending only, no transfers),
 * grouped by category. Used for the Weekly Insights bar chart.
 */
export function getWeeklyCategoryBreakdown(
  weekRange?: WeekRange
): CategoryBreakdownRow[] {
  const db = getDb()
  if (!db) return []
  const { startStr, endStr } = weekRange ?? getWeekRange()
  // Same filter as Money Out: spending only, no internal transfers
  const stmt = db.prepare(
    `SELECT t.category_id, c.name, COALESCE(SUM(ABS(t.amount)), 0) as total
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.amount < 0 AND t.transfer_account_id IS NULL
     AND COALESCE(t.created_at, t.settled_at) >= ? AND COALESCE(t.created_at, t.settled_at) <= ?
     GROUP BY t.category_id ORDER BY total DESC LIMIT 15`
  )
  stmt.bind([startStr, endStr])
  const list: CategoryBreakdownRow[] = []
  while (stmt.step()) {
    const row = stmt.get() as [string, string | null, number]
    list.push({
      category_id: row[0],
      category_name: row[1] ?? 'Uncategorised',
      total: row[2],
    })
  }
  stmt.free()
  return list
}

/**
 * Spending by category for an arbitrary date range. Same filter as Money Out.
 * Used for Reports page.
 */
export function getCategoryBreakdownForDateRange(
  dateFrom: string,
  dateTo: string
): CategoryBreakdownRow[] {
  const db = getDb()
  if (!db) return []
  const endStr = dateTo.length <= 10 ? dateTo + 'T23:59:59.999Z' : dateTo
  const stmt = db.prepare(
    `SELECT t.category_id, c.name, COALESCE(SUM(ABS(t.amount)), 0) as total
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.amount < 0 AND t.transfer_account_id IS NULL
     AND COALESCE(t.created_at, t.settled_at) >= ? AND COALESCE(t.created_at, t.settled_at) <= ?
     GROUP BY t.category_id ORDER BY total DESC LIMIT 20`
  )
  stmt.bind([dateFrom, endStr])
  const list: CategoryBreakdownRow[] = []
  while (stmt.step()) {
    const row = stmt.get() as [string, string | null, number]
    list.push({
      category_id: row[0],
      category_name: row[1] ?? 'Uncategorised',
      total: row[2],
    })
  }
  stmt.free()
  return list
}

/**
 * Money In (real income, no internal transfers) for a date range. For Reports Sankey.
 */
export function getMoneyInForDateRange(
  dateFrom: string,
  dateTo: string
): number {
  const db = getDb()
  if (!db) return 0
  const endStr = dateTo.length <= 10 ? dateTo + 'T23:59:59.999Z' : dateTo
  const stmt = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE amount > 0 AND transfer_account_id IS NULL
     AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`
  )
  stmt.bind([dateFrom, endStr])
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
}

/**
 * Data for Reports Sankey: income and spending by category in a date range.
 */
export interface ReportsSankeyData {
  moneyIn: number
  categories: CategoryBreakdownRow[]
}

export function getReportsSankeyData(
  dateFrom: string,
  dateTo: string
): ReportsSankeyData {
  return {
    moneyIn: getMoneyInForDateRange(dateFrom, dateTo),
    categories: getCategoryBreakdownForDateRange(dateFrom, dateTo),
  }
}

/**
 * Insight metrics for an arbitrary date range (e.g. a month). Same definitions as WeeklyInsightsData.
 */
export function getInsightsForDateRange(
  dateFrom: string,
  dateTo: string
): WeeklyInsightsData {
  const db = getDb()
  if (!db)
    return { moneyIn: 0, moneyOut: 0, saverChanges: 0, charges: 0, payments: 0 }
  const endStr = dateTo.length <= 10 ? dateTo + 'T23:59:59.999Z' : dateTo

  const runOne = (sql: string, params: (string | number)[]): number => {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    stmt.step()
    const row = stmt.get()
    stmt.free()
    return row ? Number(row[0]) : 0
  }

  const moneyIn = runOne(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE amount > 0 AND transfer_account_id IS NULL AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [dateFrom, endStr]
  )
  const moneyOut = runOne(
    `SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions
     WHERE amount < 0 AND transfer_account_id IS NULL
     AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [dateFrom, endStr]
  )
  const saverChanges = runOne(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE transfer_account_id IN (SELECT id FROM accounts WHERE account_type = 'SAVER')
     AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [dateFrom, endStr]
  )
  const charges = runOne(
    `SELECT COUNT(*) FROM transactions
     WHERE amount < 0 AND transfer_account_id IS NULL AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [dateFrom, endStr]
  )
  const payments = runOne(
    `SELECT COUNT(*) FROM transactions
     WHERE transfer_type IS NOT NULL AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [dateFrom, endStr]
  )
  return { moneyIn, moneyOut, saverChanges, charges, payments }
}
