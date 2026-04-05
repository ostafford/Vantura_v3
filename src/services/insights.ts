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
 *   Rego, etc.). Sum of (1) transactions whose transfer_account_id points at a SAVER account,
 *   plus (2) round_up_amount on rows with is_round_up = 1 (parent purchase lines where Up
 *   exposes roundUp; transfer_account_id is intentionally not set on those rows in sync).
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
import {
  buildMonthSpendingSeries,
  type MonthSpendingSeries,
  type MonthDailyInput,
} from '@/lib/monthSpendingSeries'
import {
  formatWeekStartLabel,
  monthNarrativePriorLabel,
  weekNarrativePriorLabel,
  yearNarrativePriorLabel,
} from '@/lib/monthLabels'

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
  // Savers: explicit transfers to savers + round-up amounts recorded on purchase lines
  const saverTransfers = runOne(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE transfer_account_id IN (SELECT id FROM accounts WHERE account_type = 'SAVER')
     AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [startStr, endStr]
  )
  const saverRoundUps = runOne(
    `SELECT COALESCE(SUM(round_up_amount), 0) FROM transactions
     WHERE is_round_up = 1
     AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [startStr, endStr]
  )
  const saverChanges = saverTransfers + saverRoundUps
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
    const label = formatWeekStartLabel(range.start)
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
    const label = formatWeekStartLabel(range.start)
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
  const saverTransfers = runOne(
    `SELECT COALESCE(SUM(amount), 0) FROM transactions
     WHERE transfer_account_id IN (SELECT id FROM accounts WHERE account_type = 'SAVER')
     AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [dateFrom, endStr]
  )
  const saverRoundUps = runOne(
    `SELECT COALESCE(SUM(round_up_amount), 0) FROM transactions
     WHERE is_round_up = 1
     AND COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?`,
    [dateFrom, endStr]
  )
  const saverChanges = saverTransfers + saverRoundUps
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

// ---------------------------------------------------------------------------
// Month-over-month comparison
// ---------------------------------------------------------------------------

export interface MonthDelta {
  current: number
  previous: number
  delta: number
  direction: 'up' | 'down' | 'flat'
}

export interface NarrativeInsight {
  label: string
  type: 'win' | 'challenge' | 'opportunity'
}

export interface MonthComparisonData {
  moneyIn: MonthDelta
  moneyOut: MonthDelta
  charges: MonthDelta
  currentTopCategory: CategoryBreakdownRow | null
  previousTopCategory: CategoryBreakdownRow | null
  narratives: NarrativeInsight[]
  hasPreviousData: boolean
}

function makeDelta(current: number, previous: number): MonthDelta {
  const delta = current - previous
  const direction: MonthDelta['direction'] =
    delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return { current, previous, delta, direction }
}

function fmtCentsDelta(cents: number): string {
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const remainder = abs % 100
  return `${dollars}.${String(remainder).padStart(2, '0')}`
}

/** Labels for period-over-period narratives (vs last month/year/week). */
export type NarrativePeriod = 'month' | 'year' | 'week'

function narrativePriorLabel(
  p: NarrativePeriod,
  currentFrom: string,
  previousFrom: string
): string {
  switch (p) {
    case 'month':
      return monthNarrativePriorLabel(previousFrom, currentFrom)
    case 'year':
      return yearNarrativePriorLabel(previousFrom)
    case 'week':
      return weekNarrativePriorLabel(previousFrom)
    default:
      return monthNarrativePriorLabel(previousFrom, currentFrom)
  }
}

/**
 * Compare two arbitrary periods (current vs previous date ranges) and derive the same
 * KPI deltas and narratives as the month card.
 */
export function getPeriodComparison(
  currentFrom: string,
  currentTo: string,
  previousFrom: string,
  previousTo: string,
  narrativePeriod: NarrativePeriod
): MonthComparisonData {
  const prior = narrativePriorLabel(narrativePeriod, currentFrom, previousFrom)

  const curInsights = getInsightsForDateRange(currentFrom, currentTo)
  const curCategories = getCategoryBreakdownForDateRange(currentFrom, currentTo)

  const prevInsights = getInsightsForDateRange(previousFrom, previousTo)
  const prevCategories = getCategoryBreakdownForDateRange(
    previousFrom,
    previousTo
  )

  const hasPreviousData =
    prevInsights.moneyIn !== 0 ||
    prevInsights.moneyOut !== 0 ||
    prevInsights.charges !== 0

  const moneyIn = makeDelta(curInsights.moneyIn, prevInsights.moneyIn)
  const moneyOut = makeDelta(curInsights.moneyOut, prevInsights.moneyOut)
  const charges = makeDelta(curInsights.charges, prevInsights.charges)

  const currentTopCategory = curCategories.length > 0 ? curCategories[0] : null
  const previousTopCategory =
    prevCategories.length > 0 ? prevCategories[0] : null

  const narratives: NarrativeInsight[] = []

  if (hasPreviousData) {
    if (moneyIn.direction === 'up') {
      narratives.push({
        label: `Income is up $${fmtCentsDelta(moneyIn.delta)} vs ${prior}`,
        type: 'win',
      })
    }

    if (moneyOut.direction === 'down') {
      narratives.push({
        label: `Spending is down $${fmtCentsDelta(Math.abs(moneyOut.delta))} vs ${prior}`,
        type: 'win',
      })
    } else if (moneyOut.direction === 'up') {
      narratives.push({
        label: `Spending is up $${fmtCentsDelta(moneyOut.delta)} vs ${prior}`,
        type: 'challenge',
      })
    }

    if (charges.direction === 'up') {
      narratives.push({
        label: `${charges.delta} more charges than ${prior}`,
        type: 'challenge',
      })
    } else if (charges.direction === 'down') {
      narratives.push({
        label: `${Math.abs(charges.delta)} fewer charges than ${prior}`,
        type: 'win',
      })
    }

    if (
      currentTopCategory &&
      previousTopCategory &&
      currentTopCategory.category_id === previousTopCategory.category_id &&
      currentTopCategory.total > previousTopCategory.total
    ) {
      narratives.push({
        label: `${currentTopCategory.category_name} spending trending higher — review for savings`,
        type: 'opportunity',
      })
    }

    if (
      currentTopCategory &&
      previousTopCategory &&
      currentTopCategory.category_id !== previousTopCategory.category_id
    ) {
      narratives.push({
        label: `Top category shifted from ${previousTopCategory.category_name} to ${currentTopCategory.category_name}`,
        type: 'opportunity',
      })
    }

    if (moneyIn.direction === 'down') {
      narratives.push({
        label: `Income is down $${fmtCentsDelta(Math.abs(moneyIn.delta))} — look for ways to supplement`,
        type: 'opportunity',
      })
    }
  }

  return {
    moneyIn,
    moneyOut,
    charges,
    currentTopCategory,
    previousTopCategory,
    narratives,
    hasPreviousData,
  }
}

function getPreviousMonthBounds(year: number, month: number) {
  let prevMonth = month - 1
  let prevYear = year
  if (prevMonth < 1) {
    prevMonth = 12
    prevYear -= 1
  }
  const from = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
  const lastDay = new Date(prevYear, prevMonth, 0).getDate()
  const to = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function getMonthLength(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function parseYearMonth(dateFrom: string): { year: number; month: number } {
  return {
    year: parseInt(dateFrom.slice(0, 4), 10),
    month: parseInt(dateFrom.slice(5, 7), 10),
  }
}

/** Calendar month bounds for `offset` from the current month (0 = this month, -1 = previous). */
export function getMonthBoundsForOffset(offset: number): {
  from: string
  to: string
  year: number
  month: number
} {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const y = target.getFullYear()
  const m = target.getMonth() + 1
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to, year: y, month: m }
}

/**
 * Compare current month metrics with the previous month and derive narrative
 * insights (wins, challenges, opportunities).
 */
export function getMonthComparison(
  currentFrom: string,
  currentTo: string
): MonthComparisonData {
  const year = parseInt(currentFrom.slice(0, 4), 10)
  const month = parseInt(currentFrom.slice(5, 7), 10)
  const prev = getPreviousMonthBounds(year, month)
  return getPeriodComparison(
    currentFrom,
    currentTo,
    prev.from,
    prev.to,
    'month'
  )
}

/**
 * Date ranges for comparing a calendar year to the prior year.
 * Past years: full Jan–Dec vs full prior year.
 * Current year: YTD (Jan 1–today) vs Jan 1–same calendar date in the prior year.
 */
export function getYearComparisonPeriods(year: number): {
  current: { from: string; to: string }
  previous: { from: string; to: string }
} {
  const now = new Date()
  const cy = now.getFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')

  if (year < cy) {
    return {
      current: {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      },
      previous: {
        from: `${year - 1}-01-01`,
        to: `${year - 1}-12-31`,
      },
    }
  }

  if (year === cy) {
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const day = now.getDate()
    const currentTo = `${y}-${pad(m)}-${pad(day)}`

    const endPrev = new Date(now)
    endPrev.setFullYear(endPrev.getFullYear() - 1)
    const py = endPrev.getFullYear()
    const pm = endPrev.getMonth() + 1
    const pd = endPrev.getDate()
    const previousTo = `${py}-${pad(pm)}-${pd}`

    return {
      current: { from: `${year}-01-01`, to: currentTo },
      previous: { from: `${year - 1}-01-01`, to: previousTo },
    }
  }

  // Future calendar year (edge): compare empty/full year to prior full year
  return {
    current: { from: `${year}-01-01`, to: `${year}-12-31` },
    previous: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` },
  }
}

/** Year-over-year KPI comparison for analytics (uses YTD when viewing the current year). */
export function getYearComparison(year: number): MonthComparisonData {
  const { current, previous } = getYearComparisonPeriods(year)
  return getPeriodComparison(
    current.from,
    current.to,
    previous.from,
    previous.to,
    'year'
  )
}

/** Week-over-week KPI comparison (this ISO week vs previous week). */
export function getWeekComparison(weekOffset: number): MonthComparisonData {
  const cur = getWeekRange(weekOffset)
  const prev = getWeekRange(weekOffset - 1)
  return getPeriodComparison(
    cur.startStr,
    cur.endStr,
    prev.startStr,
    prev.endStr,
    'week'
  )
}

// ---------------------------------------------------------------------------
// Month day-by-day series (current vs previous month)
// ---------------------------------------------------------------------------

function getDailyMoneyInOutForRange(
  dateFrom: string,
  dateTo: string
): MonthDailyInput | null {
  const db = getDb()
  if (!db) return null

  const endStr = dateTo.length <= 10 ? dateTo + 'T23:59:59.999Z' : dateTo

  const stmt = db.prepare(
    `SELECT strftime('%d', COALESCE(created_at, settled_at)) AS day,
       COALESCE(SUM(CASE WHEN amount > 0 AND transfer_account_id IS NULL THEN amount ELSE 0 END), 0) AS money_in,
       COALESCE(SUM(CASE WHEN amount < 0 AND transfer_account_id IS NULL THEN ABS(amount) ELSE 0 END), 0) AS money_out
     FROM transactions
     WHERE COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?
     GROUP BY day
     ORDER BY day`
  )
  stmt.bind([dateFrom, endStr])

  const byDay: Record<number, { moneyInCents: number; moneyOutCents: number }> =
    {}
  let maxDay = 0
  while (stmt.step()) {
    const row = stmt.get() as [string, number, number]
    const dayNum = parseInt(row[0], 10)
    if (!Number.isFinite(dayNum) || dayNum <= 0) continue
    byDay[dayNum] = {
      moneyInCents: row[1] ?? 0,
      moneyOutCents: row[2] ?? 0,
    }
    if (dayNum > maxDay) maxDay = dayNum
  }
  stmt.free()

  if (maxDay === 0) return null

  const { year, month } = parseYearMonth(dateFrom)
  const daysInMonth = getMonthLength(year, month)

  const input: MonthDailyInput = {
    daysInMonth,
    byDay,
  }
  return input
}

/**
 * Per-calendar-day money in/out (cents) for transactions in [dateFrom, dateToInclusive].
 * Used for week view where grouping by day-of-month is invalid.
 */
function getDailyMoneyInOutByDateInRange(
  dateFrom: string,
  dateToInclusive: string
): Map<string, { moneyInCents: number; moneyOutCents: number }> {
  const result = new Map<
    string,
    { moneyInCents: number; moneyOutCents: number }
  >()
  const db = getDb()
  if (!db) return result

  const endStr =
    dateToInclusive.length <= 10
      ? dateToInclusive + 'T23:59:59.999Z'
      : dateToInclusive

  const stmt = db.prepare(
    `SELECT date(COALESCE(created_at, settled_at)) AS d,
       COALESCE(SUM(CASE WHEN amount > 0 AND transfer_account_id IS NULL THEN amount ELSE 0 END), 0) AS money_in,
       COALESCE(SUM(CASE WHEN amount < 0 AND transfer_account_id IS NULL THEN ABS(amount) ELSE 0 END), 0) AS money_out
     FROM transactions
     WHERE COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?
     GROUP BY d
     ORDER BY d`
  )
  stmt.bind([dateFrom, endStr])

  while (stmt.step()) {
    const row = stmt.get() as [string | null, number, number]
    const key = row[0]
    if (!key) continue
    result.set(key, {
      moneyInCents: row[1] ?? 0,
      moneyOutCents: row[2] ?? 0,
    })
  }
  stmt.free()
  return result
}

function toDateOnlyLocal(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function buildWeekDailyInputFromRange(
  week: WeekRange,
  dailyMap: Map<string, { moneyInCents: number; moneyOutCents: number }>,
  daysToInclude: number
): MonthDailyInput {
  const byDay: Record<number, { moneyInCents: number; moneyOutCents: number }> =
    {}
  const d = new Date(week.start)
  for (let i = 1; i <= 7; i++) {
    const key = toDateOnlyLocal(d)
    const row = dailyMap.get(key)
    byDay[i] = row ?? { moneyInCents: 0, moneyOutCents: 0 }
    d.setDate(d.getDate() + 1)
  }
  return {
    daysInMonth: Math.min(7, Math.max(1, daysToInclude)),
    byDay,
  }
}

function getDaysElapsedInWeek(
  week: WeekRange,
  now: Date,
  weekOffset: number
): number {
  if (weekOffset !== 0) return 7
  const monday = new Date(week.start)
  monday.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - monday.getTime()) / 86400000)
  return Math.min(7, Math.max(1, diff + 1))
}

export interface MonthSeriesResult {
  series: MonthSpendingSeries
}

/**
 * Day-by-day cumulative series for the selected month vs its previous month,
 * using the same Money In/Out definitions as other insight helpers.
 */
export function getMonthDayByDaySeries(
  currentFrom: string,
  currentTo: string
): MonthSeriesResult {
  const { year, month } = parseYearMonth(currentFrom)
  const currentDays = getMonthLength(year, month)

  const prev = getPreviousMonthBounds(year, month)

  const currentInputRaw = getDailyMoneyInOutForRange(currentFrom, currentTo)
  const previousInput = getDailyMoneyInOutForRange(prev.from, prev.to)

  const now = new Date()
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1
  const currentInput =
    currentInputRaw && isCurrentMonth
      ? {
          ...currentInputRaw,
          daysInMonth: Math.min(currentInputRaw.daysInMonth, now.getDate()),
        }
      : currentInputRaw

  const series = buildMonthSpendingSeries(currentInput, previousInput)

  // Ensure maxDay at least spans the actual month length, even if there is
  // no data for later days yet.
  const maxDay = Math.max(series.maxDay, currentDays)
  if (maxDay !== series.maxDay) {
    // Extend points array with trailing days that have null values.
    const existing = new Map(series.points.map((p) => [p.day, p]))
    const points = []
    for (let day = 1; day <= maxDay; day += 1) {
      const found = existing.get(day)
      if (found) {
        points.push(found)
      } else {
        points.push({
          day,
          currentSpending: null,
          previousSpending: null,
          currentIncome: null,
          previousIncome: null,
          currentNet: null,
          previousNet: null,
        })
      }
    }
    return {
      series: {
        points,
        maxDay,
      },
    }
  }

  return { series }
}

/**
 * Mon–Sun cumulative series for the selected week vs the prior week.
 */
export function getWeekDayByDaySeries(weekOffset: number): MonthSeriesResult {
  const now = new Date()
  const currentWeek = getWeekRange(weekOffset)
  const previousWeek = getWeekRange(weekOffset - 1)

  const curMap = getDailyMoneyInOutByDateInRange(
    currentWeek.startStr,
    currentWeek.endStr
  )
  const prevMap = getDailyMoneyInOutByDateInRange(
    previousWeek.startStr,
    previousWeek.endStr
  )

  const elapsed = getDaysElapsedInWeek(currentWeek, now, weekOffset)
  const currentInput = buildWeekDailyInputFromRange(
    currentWeek,
    curMap,
    elapsed
  )
  const previousInput = buildWeekDailyInputFromRange(previousWeek, prevMap, 7)

  const series = buildMonthSpendingSeries(currentInput, previousInput)
  const maxDay = Math.max(series.maxDay, 7)
  if (maxDay !== series.maxDay) {
    const existing = new Map(series.points.map((p) => [p.day, p]))
    const points = []
    for (let day = 1; day <= maxDay; day += 1) {
      const found = existing.get(day)
      if (found) {
        points.push(found)
      } else {
        points.push({
          day,
          currentSpending: null,
          previousSpending: null,
          currentIncome: null,
          previousIncome: null,
          currentNet: null,
          previousNet: null,
        })
      }
    }
    return {
      series: {
        points,
        maxDay,
      },
    }
  }

  return { series }
}

// ---------------------------------------------------------------------------
// Calendar year: monthly totals (Jan–Dec)
// ---------------------------------------------------------------------------

/** One month within a calendar year; moneyIn/moneyOut in cents (same rules as getInsightsForDateRange). */
export interface YearMonthPoint {
  month: number
  moneyIn: number
  moneyOut: number
}

/**
 * Money in/out per calendar month for `year`, always 12 entries (months 1–12).
 * Missing months are zeros. Uses same transaction filters as getWeeklyInsights.
 */
export function getYearMonthlyTotals(year: number): YearMonthPoint[] {
  const db = getDb()
  const empty: YearMonthPoint[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    moneyIn: 0,
    moneyOut: 0,
  }))
  if (!db) return empty

  const from = `${year}-01-01`
  const to = `${year}-12-31T23:59:59.999Z`

  const stmt = db.prepare(
    `SELECT CAST(strftime('%m', COALESCE(created_at, settled_at)) AS INTEGER) AS m,
       COALESCE(SUM(CASE WHEN amount > 0 AND transfer_account_id IS NULL THEN amount ELSE 0 END), 0) AS money_in,
       COALESCE(SUM(CASE WHEN amount < 0 AND transfer_account_id IS NULL THEN ABS(amount) ELSE 0 END), 0) AS money_out
     FROM transactions
     WHERE COALESCE(created_at, settled_at) >= ? AND COALESCE(created_at, settled_at) <= ?
     GROUP BY m
     ORDER BY m`
  )
  stmt.bind([from, to])

  const byMonth = new Map<number, { moneyIn: number; moneyOut: number }>()
  while (stmt.step()) {
    const row = stmt.get() as [number, number, number]
    const m = row[0]
    if (!Number.isFinite(m) || m < 1 || m > 12) continue
    byMonth.set(m, { moneyIn: row[1] ?? 0, moneyOut: row[2] ?? 0 })
  }
  stmt.free()

  return empty.map((slot) => {
    const found = byMonth.get(slot.month)
    return found
      ? { month: slot.month, moneyIn: found.moneyIn, moneyOut: found.moneyOut }
      : slot
  })
}
