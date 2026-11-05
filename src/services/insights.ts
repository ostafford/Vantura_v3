/**
 * Money in / out, saver movement and category spend over a window of local
 * days, plus the month and year comparisons built on them.
 *
 * Term definitions (aligned with Up Bank app and product intent):
 *
 * - Money In: Up money that arrived with no Up category (pay, interest, money
 *   from people). Excludes internal transfers (e.g. from a saver back to
 *   spending) and categorised positives, which are refunds that Money Out
 *   already subtracts (#200). Filter: `MONEY_IN` below.
 *
 * - Money Out: total Actual spending (#187) — the one definition in
 *   `actualSpending.ts`. Debits net of categorised refunds; signed, never clamped.
 *
 * - Savers: Net movement to/from any saver account (Loose Change, Investing, etc.).
 *   Computed from the SAVER account side: negated SUM(amount) for transactions whose
 *   account_id is a SAVER and either transfer_account_id IS NOT NULL (explicit transfer) or
 *   transaction_type = 'Round Up' (a Round Up row, which may carry no transfer account; Up
 *   never sets round_up_parent_id on the saver side, #177/#202). Negating flips the sign so that a credit
 *   into a saver (positive amount) yields a negative saverChanges value (saving), and a debit
 *   out of a saver yields a positive value (withdrawal).
 *
 * - Charges: Count of the debits in Money Out (refunds aren't charges).
 *   One charge per purchase (e.g. Coles, ALDI).
 *
 * - Category breakdowns: Money Out split by Up category — net Actual spending per
 *   category_id (refunds net; uncategorised debits are one row). Signed, never
 *   clamped, so a category can be negative and the rows sum to Money Out.
 */

import { getDb } from '@/db'
import { formatMoney, formatSignedMoney } from '@/lib/format'
import { changePercent } from '@/lib/spendingPercent'
import {
  displayDaySql,
  displayDayBetweenSql,
  toDayBound,
} from '@/services/displayDay'
import {
  actualSpendingSql,
  actualSpendingWhere,
  getActualSpending,
} from '@/services/actualSpending'

/** Local-day window predicates (#149) — bind two `YYYY-MM-DD` days. */
const DISPLAY_DAY_BETWEEN = displayDayBetweenSql()
/** Actual spending predicate (#187) — Money Out's one definition. */
const ACTUAL_SPENDING = actualSpendingSql()
/**
 * Money In predicate (#200): Up-sourced positives that aren't own-account
 * transfers and have no Up category. A categorised positive is a refund, which
 * Actual spending already subtracts, so leaving it out here means Net counts
 * each refund once.
 */
const MONEY_IN =
  "amount > 0 AND transfer_account_id IS NULL AND source = 'up' AND category_id IS NULL"
import { daysBetweenDateStr } from '@/lib/dateStr'
import {
  buildMonthSpendingSeries,
  type MonthSpendingSeries,
  type MonthDailyInput,
} from '@/lib/monthSpendingSeries'
import {
  monthNarrativePriorLabel,
  yearNarrativePriorLabel,
} from '@/lib/monthLabels'

/** A local Date as "YYYY-MM-DD". */
function toDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth()
  const day = d.getDate()
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Caps a previous-period end date so an in-progress current period's
 * comparison stays apples-to-apples: the previous period should span the
 * same number of days elapsed in the current one, never more than its own
 * natural length (shorter months, etc). All dates are local "YYYY-MM-DD".
 * Used by getMonthComparison's elapsed-day capping.
 */
function capPreviousPeriodEnd(
  previousStart: string,
  daysElapsed: number,
  naturalPreviousEnd: string
): string {
  const end = new Date(previousStart + 'T00:00:00')
  end.setDate(end.getDate() + daysElapsed - 1)
  const endStr = toDateOnly(end)
  return endStr < naturalPreviousEnd ? endStr : naturalPreviousEnd
}

/** Money In, Money Out, Savers and Charges. See the file-level comment for each term. */
export interface InsightsData {
  /** Real income only (no internal transfers). */
  moneyIn: number
  /** Spending only (purchases/charges; no internal transfers out). */
  moneyOut: number
  /** Net movement to/from saver accounts (Loose Change, Investing, etc.). */
  saverChanges: number
  /** Count of spending transactions (same set as moneyOut). */
  charges: number
}

/**
 * Money In, Money Out, Savers and Charges for the local days `[startDay,
 * endDay]` (`YYYY-MM-DD`, inclusive) — the one block every insights window
 * reads. See the file-level comment for each term.
 */
function insightsForDays(startDay: string, endDay: string): InsightsData {
  const db = getDb()
  if (!db) return { moneyIn: 0, moneyOut: 0, saverChanges: 0, charges: 0 }

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
     WHERE ${MONEY_IN} AND ${DISPLAY_DAY_BETWEEN}`,
    [startDay, endDay]
  )
  // Money Out = Actual spending (#187); Charges = its debits
  const spending = getActualSpending({ from: startDay, to: endDay })
  // Savers: read from the saver account side and negate so credits (saving) are negative
  const saverChanges = runOne(
    `SELECT COALESCE(-SUM(amount), 0) FROM transactions
     WHERE account_id IN (SELECT id FROM accounts WHERE account_type = 'SAVER')
     AND (transfer_account_id IS NOT NULL OR transaction_type = 'Round Up')
     AND ${DISPLAY_DAY_BETWEEN}`,
    [startDay, endDay]
  )
  return {
    moneyIn,
    moneyOut: spending.spentCents,
    saverChanges,
    charges: spending.debitCount,
  }
}

export interface CategoryBreakdownRow {
  /** Up category; `null` for the uncategorised debits' row. */
  category_id: string | null
  category_name: string
  /** Net Actual spending (cents), positive = money out. May be negative. */
  total: number
}

/**
 * Net Actual spending per Up category over the local days `[startDay,
 * endDay]`, biggest first. Uncategorised debits share one row. Signed, never
 * clamped; the rows sum to Money Out for the same window.
 */
function readCategoryTotals(
  startDay: string,
  endDay: string
): CategoryBreakdownRow[] {
  const db = getDb()
  if (!db) return []
  const { sql, params } = actualSpendingWhere(
    { from: startDay, to: endDay },
    't'
  )
  const stmt = db.prepare(
    `SELECT t.category_id, c.name, COALESCE(-SUM(t.amount), 0) as total
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE ${sql}
     GROUP BY t.category_id ORDER BY total DESC, t.category_id`
  )
  stmt.bind(params)
  const list: CategoryBreakdownRow[] = []
  while (stmt.step()) {
    const row = stmt.get() as [string | null, string | null, number]
    list.push({
      category_id: row[0] ?? null,
      category_name: row[1] ?? 'Uncategorised',
      total: row[2],
    })
  }
  stmt.free()
  return list
}

export interface MonthlyInsightsData {
  moneyIn: number
  moneyOut: number
  saverChanges: number
  saverRoundUps: number
  charges: number
}

/** Returns insight metrics for the given calendar month (month is 1-12). */
export function getMonthlyInsights(
  year: number,
  month: number
): MonthlyInsightsData {
  const db = getDb()
  if (!db)
    return {
      moneyIn: 0,
      moneyOut: 0,
      saverChanges: 0,
      saverRoundUps: 0,
      charges: 0,
    }

  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const endDate = new Date(year, month - 1 + 1, 0, 23, 59, 59, 999)
  const startDay = toDateOnly(startDate)
  const endDay = toDateOnly(endDate)

  const { moneyIn, moneyOut, saverChanges, charges } = insightsForDays(
    startDay,
    endDay
  )
  // Round-up saver credits are identified by transaction_type = 'Round Up' —
  // the same rule saverChanges uses, so self-contributed (saverChanges −
  // saverRoundUps) removes exactly what was added (#202). is_round_up and
  // round_up_parent_id are not set on the saver side in Up Bank's API.
  const stmt = db.prepare(
    `SELECT COALESCE(-SUM(amount), 0) FROM transactions
     WHERE account_id IN (SELECT id FROM accounts WHERE account_type = 'SAVER')
     AND transaction_type = 'Round Up'
     AND ${DISPLAY_DAY_BETWEEN}`
  )
  stmt.bind([startDay, endDay])
  stmt.step()
  const row = stmt.get()
  stmt.free()
  const saverRoundUps = row ? Number(row[0]) : 0

  return { moneyIn, moneyOut, saverChanges, saverRoundUps, charges }
}

/**
 * Spending by category for an arbitrary date range: Money Out split by Up
 * category (see `readCategoryTotals`). Used by getPeriodComparison.
 */
export function getCategoryBreakdownForDateRange(
  dateFrom: string,
  dateTo: string
): CategoryBreakdownRow[] {
  return readCategoryTotals(toDayBound(dateFrom), toDayBound(dateTo))
}

/**
 * Insight metrics for an arbitrary date range (e.g. a month). See InsightsData.
 */
export function getInsightsForDateRange(
  dateFrom: string,
  dateTo: string
): InsightsData {
  return insightsForDays(toDayBound(dateFrom), toDayBound(dateTo))
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

export interface BiggestCategoryMover {
  category_name: string
  /** Signed cents: positive = spent more this period, negative = spent less. */
  deltaTotal: number
  currentTotal: number
  previousTotal: number
}

export interface MonthComparisonData {
  moneyIn: MonthDelta
  moneyOut: MonthDelta
  charges: MonthDelta
  /** Net (moneyIn − moneyOut) delta between current and previous periods. */
  netDelta: MonthDelta
  currentTopCategory: CategoryBreakdownRow | null
  previousTopCategory: CategoryBreakdownRow | null
  /** Category with the largest absolute spend change between periods. */
  biggestCategoryMover?: BiggestCategoryMover
  narratives: NarrativeInsight[]
  hasPreviousData: boolean
  /** Set when the current period is partial (e.g. "May 1–9 vs Apr 1–9"). */
  periodNote?: string
}

function makeDelta(current: number, previous: number): MonthDelta {
  const delta = current - previous
  const direction: MonthDelta['direction'] =
    delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return { current, previous, delta, direction }
}

function fmtCentsDelta(cents: number): string {
  return formatMoney(Math.abs(cents))
}

/** ` (12%)`, or nothing when the change has no defined percentage (#197). */
function fmtPct(delta: number, base: number): string {
  const pct = changePercent(base + delta, base)
  return pct != null && pct > 0 ? ` (${pct}%)` : ''
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function fmtDayMonth(dateStr: string): string {
  const monthIdx = parseInt(dateStr.slice(5, 7), 10) - 1
  const day = parseInt(dateStr.slice(8, 10), 10)
  return `${MONTH_ABBR[monthIdx]} ${day}`
}

/** Labels for period-over-period narratives (vs last month/year). */
export type NarrativePeriod = 'month' | 'year'

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
  const netDelta = makeDelta(
    curInsights.moneyIn - curInsights.moneyOut,
    prevInsights.moneyIn - prevInsights.moneyOut
  )

  const currentTopCategory = curCategories.length > 0 ? curCategories[0] : null
  const previousTopCategory =
    prevCategories.length > 0 ? prevCategories[0] : null

  // Find the category with the largest absolute spend change.
  const curCatMap = new Map(curCategories.map((c) => [c.category_id, c]))
  const prevCatMap = new Map(prevCategories.map((c) => [c.category_id, c]))
  let biggestCategoryMover: BiggestCategoryMover | undefined
  let biggestAbs = 0
  for (const id of new Set([...curCatMap.keys(), ...prevCatMap.keys()])) {
    const cur = curCatMap.get(id)
    const prev = prevCatMap.get(id)
    const curTotal = cur?.total ?? 0
    const prevTotal = prev?.total ?? 0
    const delta = curTotal - prevTotal
    const absD = Math.abs(delta)
    if (absD > biggestAbs) {
      biggestAbs = absD
      biggestCategoryMover = {
        category_name: cur?.category_name ?? prev?.category_name ?? 'Unknown',
        deltaTotal: delta,
        currentTotal: curTotal,
        previousTotal: prevTotal,
      }
    }
  }

  const narratives: NarrativeInsight[] = []

  if (hasPreviousData) {
    if (moneyIn.direction === 'up') {
      narratives.push({
        label: `Money in is up $${fmtCentsDelta(moneyIn.delta)}${fmtPct(moneyIn.delta, moneyIn.previous)} vs ${prior}`,
        type: 'win',
      })
    }

    if (moneyOut.direction === 'down') {
      narratives.push({
        label: `Spending is down $${fmtCentsDelta(Math.abs(moneyOut.delta))}${fmtPct(moneyOut.delta, moneyOut.previous)} vs ${prior}`,
        type: 'win',
      })
    } else if (moneyOut.direction === 'up') {
      narratives.push({
        label: `Spending is up $${fmtCentsDelta(moneyOut.delta)}${fmtPct(moneyOut.delta, moneyOut.previous)} vs ${prior}`,
        type: 'challenge',
      })
    }

    if (charges.direction === 'up') {
      narratives.push({
        label: `${charges.delta} more purchases than ${prior}`,
        type: 'challenge',
      })
    } else if (charges.direction === 'down') {
      narratives.push({
        label: `${Math.abs(charges.delta)} fewer purchases than ${prior}`,
        type: 'win',
      })
    }

    if (
      currentTopCategory &&
      previousTopCategory &&
      currentTopCategory.category_id === previousTopCategory.category_id &&
      currentTopCategory.total > previousTopCategory.total
    ) {
      const catDelta = currentTopCategory.total - previousTopCategory.total
      narratives.push({
        label: `${currentTopCategory.category_name} up $${fmtCentsDelta(catDelta)}${fmtPct(catDelta, previousTopCategory.total)} vs ${prior} — your top category both months`,
        type: 'opportunity',
      })
    }

    if (
      currentTopCategory &&
      previousTopCategory &&
      currentTopCategory.category_id !== previousTopCategory.category_id
    ) {
      narratives.push({
        label: `Top category shifted from ${previousTopCategory.category_name} (${formatSignedMoney(previousTopCategory.total)}) to ${currentTopCategory.category_name} (${formatSignedMoney(currentTopCategory.total)})`,
        type: 'opportunity',
      })
    }

    if (moneyIn.direction === 'down') {
      narratives.push({
        label: `Money in is down $${fmtCentsDelta(Math.abs(moneyIn.delta))}${fmtPct(moneyIn.delta, moneyIn.previous)} vs ${prior}`,
        type: 'opportunity',
      })
    }
  }

  return {
    moneyIn,
    moneyOut,
    charges,
    netDelta,
    currentTopCategory,
    previousTopCategory,
    biggestCategoryMover,
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
 *
 * When the current month is in progress, caps the previous period to the same
 * number of elapsed days so the comparison is apples-to-apples.
 */
export function getMonthComparison(
  currentFrom: string,
  currentTo: string
): MonthComparisonData {
  const year = parseInt(currentFrom.slice(0, 4), 10)
  const month = parseInt(currentFrom.slice(5, 7), 10)
  const prev = getPreviousMonthBounds(year, month)

  const todayStr = toDateOnly(new Date())
  let effectivePreviousTo = prev.to
  let periodNote: string | undefined

  if (todayStr < currentTo) {
    // Month is in progress — cap previous period to the same elapsed-day count.
    // daysBetweenDateStr anchors both dates at noon UTC, so a DST transition
    // inside the window can't floor the day count one short (a flat 86_400_000
    // ms divide would).
    const daysElapsed = daysBetweenDateStr(currentFrom, todayStr) + 1

    effectivePreviousTo = capPreviousPeriodEnd(prev.from, daysElapsed, prev.to)

    periodNote = `${fmtDayMonth(currentFrom)}–${fmtDayMonth(todayStr)} vs ${fmtDayMonth(prev.from)}–${fmtDayMonth(effectivePreviousTo)}`
  }

  const result = getPeriodComparison(
    currentFrom,
    currentTo,
    prev.from,
    effectivePreviousTo,
    'month'
  )
  return { ...result, periodNote }
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

    // Same month + day one year back. On Feb 29, the prior year has no Feb 29,
    // so clamp to that month's last valid day (Feb 28) — letting JS Date
    // normalise `setFullYear(y - 1)` would instead roll it to Mar 1 and make
    // the prior-year YTD window a day longer than the current one.
    const py = y - 1
    const prevMonthLastDay = new Date(
      Date.UTC(py, now.getMonth() + 1, 0)
    ).getUTCDate()
    const pd = Math.min(day, prevMonthLastDay)
    const previousTo = `${py}-${pad(m)}-${pad(pd)}`

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

/**
 * Year-over-year KPI comparison for analytics (uses YTD when viewing the
 * current year). When the year is still in progress, sets periodNote so the
 * UI can clarify this is a YTD comparison, not a full-year one — mirrors the
 * equivalent clarifier in getMonthComparison.
 */
export function getYearComparison(year: number): MonthComparisonData {
  const { current, previous } = getYearComparisonPeriods(year)
  const result = getPeriodComparison(
    current.from,
    current.to,
    previous.from,
    previous.to,
    'year'
  )

  const isCurrentYear = year === new Date().getFullYear()
  const periodNote = isCurrentYear
    ? `${fmtDayMonth(current.from)}–${fmtDayMonth(current.to)}, ${year} vs ${fmtDayMonth(previous.from)}–${fmtDayMonth(previous.to)}, ${year - 1}`
    : undefined

  return { ...result, periodNote }
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

  const stmt = db.prepare(
    `SELECT CAST(substr(${displayDaySql()}, 9, 2) AS INTEGER) AS day,
       COALESCE(SUM(CASE WHEN ${MONEY_IN} THEN amount ELSE 0 END), 0) AS money_in,
       COALESCE(SUM(CASE WHEN ${ACTUAL_SPENDING} THEN -amount ELSE 0 END), 0) AS money_out
     FROM transactions
     WHERE ${DISPLAY_DAY_BETWEEN}
     GROUP BY day
     ORDER BY day`
  )
  stmt.bind([toDayBound(dateFrom), toDayBound(dateTo)])

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
 * Missing months are zeros. Uses the same transaction filters as getInsightsForDateRange.
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
  const to = `${year}-12-31`

  const stmt = db.prepare(
    `SELECT CAST(substr(${displayDaySql()}, 6, 2) AS INTEGER) AS m,
       COALESCE(SUM(CASE WHEN ${MONEY_IN} THEN amount ELSE 0 END), 0) AS money_in,
       COALESCE(SUM(CASE WHEN ${ACTUAL_SPENDING} THEN -amount ELSE 0 END), 0) AS money_out
     FROM transactions
     WHERE ${DISPLAY_DAY_BETWEEN}
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
