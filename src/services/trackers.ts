/**
 * Trackers: CRUD and progress (spent in period per 05_Calculation_logic 5.1).
 */

import { getDb, getAppSetting, schedulePersist } from '@/db'
import { previousPaydayDate, type PaydayFrequency } from '@/lib/payday'
import { localDateString } from '@/lib/format'

export type TrackerResetFrequency =
  | 'WEEKLY'
  | 'FORTNIGHTLY'
  | 'MONTHLY'
  | 'PAYDAY'

export interface TrackerRow {
  id: number
  name: string
  budget_amount: number
  reset_frequency: string
  reset_day: number | null
  last_reset_date: string
  next_reset_date: string
  bucket_id: number | null
}

export interface TrackerWithProgress extends TrackerRow {
  spent: number
  /**
   * Budget the progress is judged against. Equals `budget_amount` unless a
   * config change split the current period (#16), in which case it's the sum of
   * the prorated per-segment budgets. For past periods (negative offset) it
   * equals `budget_amount`.
   */
  effectiveBudget: number
  remaining: number
  daysLeft: number
  progress: number
  /** True when a budget/category change split the current period (#16). */
  wasAdjustedThisPeriod: boolean
  /** Set when returned from getTrackersWithProgressForPeriod; used for period date range display. */
  period_start?: string
  period_end?: string
}

export interface TrackerListRow {
  id: number
  name: string
  budget_amount: number
  reset_frequency: string
}

export function getTrackersList(): TrackerListRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, name, budget_amount, reset_frequency
     FROM trackers WHERE is_active = 1 ORDER BY name`
  )
  const list: TrackerListRow[] = []
  while (stmt.step()) {
    const row = stmt.get() as [number, string, number, string]
    list.push({
      id: row[0],
      name: row[1],
      budget_amount: row[2],
      reset_frequency: row[3],
    })
  }
  stmt.free()
  return list
}

function daysBetween(dateStrA: string, dateStrB: string): number {
  const norm = (s: string) => (s.length >= 10 ? s.slice(0, 10) : s)
  const a = new Date(norm(dateStrA) + 'T12:00:00Z').getTime()
  const b = new Date(norm(dateStrB) + 'T12:00:00Z').getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

const normDate = (s: string) => (s.length >= 10 ? s.slice(0, 10) : s)

/** Add `days` (may be negative) to a 'YYYY-MM-DD' string, returning the same form. */
function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(normDate(dateStr) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Same category set, order-insensitive. */
function sameCategorySet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((id) => setA.has(id))
}

/**
 * Spent in the tracker's current period (cents), summed across config-change
 * segments (#16). Each segment counts spend against the category set that
 * applied during it — so a mid-period category add/remove is not retroactive.
 */
export function getTrackerSpent(trackerId: number): number {
  const row = getTracker(trackerId)
  if (!row) return 0
  return computeCurrentPeriodSegments(row).reduce(
    (sum, seg) => sum + seg.spent,
    0
  )
}

/**
 * Spent in a specific period (cents). Same filters as getTrackerSpent but with explicit bounds.
 */
export function getTrackerSpentInPeriod(
  trackerId: number,
  periodStart: string,
  periodEnd: string
): number {
  const db = getDb()
  if (!db) return 0
  const startNorm =
    periodStart.length >= 10 ? periodStart.slice(0, 10) : periodStart
  const endNorm = periodEnd.length >= 10 ? periodEnd.slice(0, 10) : periodEnd
  const stmt = db.prepare(
    `SELECT COALESCE(SUM(ABS(t.amount)), 0) as spent
     FROM transactions t
     INNER JOIN tracker_categories tc ON t.category_id = tc.category_id
     WHERE tc.tracker_id = ?
       AND COALESCE(t.created_at, t.settled_at) >= ?
       AND COALESCE(t.created_at, t.settled_at) < ?
       AND t.amount < 0 AND t.transfer_account_id IS NULL`
  )
  stmt.bind([trackerId, startNorm, endNorm])
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
}

/**
 * Spent (cents) against an explicit category set over `[periodStart, periodEnd)`.
 * Same transaction filters as getTrackerSpentInPeriod, but the category set is
 * passed in rather than joined from tracker_categories — used by the #16 split
 * calc, where each period segment has its own historical category set.
 */
export function getSpentForCategoriesInPeriod(
  categoryIds: string[],
  periodStart: string,
  periodEnd: string
): number {
  const db = getDb()
  if (!db || categoryIds.length === 0) return 0
  const placeholders = categoryIds.map(() => '?').join(',')
  const stmt = db.prepare(
    `SELECT COALESCE(SUM(ABS(t.amount)), 0) as spent
     FROM transactions t
     WHERE t.category_id IN (${placeholders})
       AND COALESCE(t.created_at, t.settled_at) >= ?
       AND COALESCE(t.created_at, t.settled_at) < ?
       AND t.amount < 0 AND t.transfer_account_id IS NULL`
  )
  stmt.bind([...categoryIds, normDate(periodStart), normDate(periodEnd)])
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
}

// ─── Config history (#16) ────────────────────────────────────────────────────

export interface TrackerConfigVersion {
  id: number
  effective_from: string
  budget_amount: number
  category_ids: string[]
}

/**
 * A tracker's config timeline (budget + category set per effective-from date),
 * oldest first. Post-migration every tracker has at least a genesis row anchored
 * at its current period start; createTracker writes one too.
 */
export function getTrackerConfigHistory(
  trackerId: number
): TrackerConfigVersion[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, effective_from, budget_amount
     FROM tracker_config_history
     WHERE tracker_id = ?
     ORDER BY effective_from ASC, id ASC`
  )
  stmt.bind([trackerId])
  const versions: TrackerConfigVersion[] = []
  while (stmt.step()) {
    const r = stmt.get() as [number, string, number]
    versions.push({
      id: r[0],
      effective_from: normDate(r[1]),
      budget_amount: r[2],
      category_ids: [],
    })
  }
  stmt.free()
  if (versions.length === 0) return versions
  const catStmt = db.prepare(
    `SELECT config_id, category_id FROM tracker_config_history_categories
     WHERE config_id IN (${versions.map(() => '?').join(',')})`
  )
  catStmt.bind(versions.map((v) => v.id))
  const byId = new Map(versions.map((v) => [v.id, v]))
  while (catStmt.step()) {
    const r = catStmt.get() as [number, string]
    byId.get(r[0])?.category_ids.push(r[1])
  }
  catStmt.free()
  return versions
}

export interface TrackerPeriodSegment {
  /** inclusive */
  start: string
  /** exclusive */
  end: string
  /** prorated budget for this segment (cents): configBudget × segmentDays / periodDays */
  budget: number
  /** spend against this segment's historical category set over [start, end) */
  spent: number
  /** the config version that applied during this segment */
  category_ids: string[]
}

/** The current-period fields the #16 split calc needs off a tracker row. */
export type CurrentPeriodInput = Pick<
  TrackerRow,
  'id' | 'last_reset_date' | 'next_reset_date' | 'budget_amount'
>

type SegmentConfig = Pick<
  TrackerConfigVersion,
  'budget_amount' | 'category_ids'
>

/**
 * Pure period-splitting core (#16). Cuts `[lastReset, nextReset)` at each config
 * change in `history` whose `effective_from` lands strictly inside it and returns
 * one segment per span — a single segment when nothing changed. Each segment's
 * budget is the applicable config's budget prorated by that segment's share of
 * the period's days (`round(budget × segDays / periodDays)`); its spend comes
 * from `spendLookup` over that config's category set. `fallback` is used for any
 * day no `history` row covers. No DB — `computeCurrentPeriodSegments` is the thin
 * wrapper that supplies `history`, `fallback`, and the lookup.
 *
 * `history` MUST be ordered oldest `effective_from` first (the `configAsOf` walk
 * short-circuits on that); `getTrackerConfigHistory` guarantees it.
 */
export function splitPeriodIntoSegments(
  lastReset: string,
  nextReset: string,
  history: TrackerConfigVersion[],
  fallback: SegmentConfig,
  spendLookup: (categoryIds: string[], start: string, end: string) => number
): TrackerPeriodSegment[] {
  const start = normDate(lastReset)
  const end = normDate(nextReset)
  const periodDays = daysBetween(start, end)

  const configAsOf = (day: string): SegmentConfig => {
    let chosen: SegmentConfig | null = null
    for (const v of history) {
      if (v.effective_from <= day) chosen = v
      else break
    }
    return chosen ?? fallback
  }

  const boundaries = Array.from(
    new Set(
      history
        .map((v) => v.effective_from)
        .filter((ef) => ef > start && ef < end)
    )
  ).sort()

  const cutStarts = [start, ...boundaries]
  const cutEnds = [...boundaries, end]
  const segments: TrackerPeriodSegment[] = []
  for (let i = 0; i < cutStarts.length; i++) {
    const s = cutStarts[i]
    const e = cutEnds[i]
    const cfg = configAsOf(s)
    const segDays = daysBetween(s, e)
    const budget =
      periodDays > 0
        ? Math.round((cfg.budget_amount * segDays) / periodDays)
        : cfg.budget_amount
    segments.push({
      start: s,
      end: e,
      budget,
      spent: spendLookup(cfg.category_ids, s, e),
      category_ids: cfg.category_ids,
    })
  }
  return segments
}

/**
 * DB wrapper around `splitPeriodIntoSegments` for a tracker's *current* period:
 * loads its config history and delegates. The fallback ("assume the current
 * config") covers any day no history row reaches — matches pre-#16 behaviour.
 * A history that exists but doesn't cover the period start is a broken
 * genesis-row invariant; surface it in dev.
 */
export function computeCurrentPeriodSegments(
  tracker: CurrentPeriodInput
): TrackerPeriodSegment[] {
  const history = getTrackerConfigHistory(tracker.id)
  const start = normDate(tracker.last_reset_date)
  if (
    import.meta.env.MODE === 'development' &&
    history.length > 0 &&
    !history.some((v) => v.effective_from <= start)
  ) {
    console.warn(
      `[trackers] tracker ${tracker.id}: no config version effective on or before period start ${start}; falling back to current config`
    )
  }
  const fallback: SegmentConfig = {
    budget_amount: tracker.budget_amount,
    category_ids: getTrackerCategoryIds(tracker.id),
  }
  return splitPeriodIntoSegments(
    tracker.last_reset_date,
    tracker.next_reset_date,
    history,
    fallback,
    getSpentForCategoriesInPeriod
  )
}

/**
 * Roll a tracker's current-period segments up into the numbers the Dashboard and
 * notifications use. `effectiveBudget` is the sum of the prorated per-segment
 * budgets — equal to the head budget when nothing changed this period.
 */
function summariseCurrentPeriod(tracker: CurrentPeriodInput): {
  spent: number
  effectiveBudget: number
  remaining: number
  progress: number
  wasAdjustedThisPeriod: boolean
} {
  const segments = computeCurrentPeriodSegments(tracker)
  const spent = segments.reduce((sum, seg) => sum + seg.spent, 0)
  const effectiveBudget = segments.reduce((sum, seg) => sum + seg.budget, 0)
  return {
    spent,
    effectiveBudget,
    remaining: Math.max(0, effectiveBudget - spent),
    progress: effectiveBudget > 0 ? (spent / effectiveBudget) * 100 : 0,
    wasAdjustedThisPeriod: segments.length > 1,
  }
}

/** Step back one period from a given end date. Used for period-offset navigation. */
function stepBackOnePeriod(
  frequency: string,
  resetDay: number | null,
  periodEnd: string
): string {
  const from = new Date(periodEnd + 'T12:00:00Z')
  if (frequency === 'PAYDAY') {
    const prev = getPreviousPaydayDate(periodEnd)
    return prev ?? periodEnd
  }
  if (frequency === 'WEEKLY') {
    const d = new Date(from)
    d.setUTCDate(d.getUTCDate() - 7)
    return d.toISOString().slice(0, 10)
  }
  if (frequency === 'FORTNIGHTLY') {
    const d = new Date(from)
    d.setUTCDate(d.getUTCDate() - 14)
    return d.toISOString().slice(0, 10)
  }
  if (frequency === 'MONTHLY') {
    const d = new Date(from)
    d.setUTCMonth(d.getUTCMonth() - 1)
    const day =
      resetDay != null && resetDay >= 1 && resetDay <= 28 ? resetDay : 1
    d.setUTCDate(day)
    return d.toISOString().slice(0, 10)
  }
  return periodEnd
}

/** Previous payday date before fromDate, using app_settings payday_frequency and payday_day. */
function getPreviousPaydayDate(fromDate: string): string | null {
  const frequency = getAppSetting('payday_frequency')
  const dayStr = getAppSetting('payday_day')
  if (
    frequency !== 'WEEKLY' &&
    frequency !== 'FORTNIGHTLY' &&
    frequency !== 'MONTHLY'
  )
    return null
  const paydayDay = dayStr ? parseInt(dayStr, 10) : 1
  return previousPaydayDate(fromDate, frequency as PaydayFrequency, paydayDay)
}

/** Period bounds for a tracker and period offset. 0 = current period, -1 = previous, etc. */
export function getPeriodBoundsForOffset(
  row: TrackerRow,
  periodOffset: number
): { periodStart: string; periodEnd: string } | null {
  const norm = (s: string) => (s.length >= 10 ? s.slice(0, 10) : s)
  if (periodOffset === 0) {
    return {
      periodStart: norm(row.last_reset_date),
      periodEnd: norm(row.next_reset_date),
    }
  }
  if (periodOffset > 0) return null
  let end = norm(row.last_reset_date)
  for (let i = 0; i < -periodOffset - 1; i++) {
    end = stepBackOnePeriod(row.reset_frequency, row.reset_day, end)
  }
  const start = stepBackOnePeriod(row.reset_frequency, row.reset_day, end)
  return { periodStart: start, periodEnd: end }
}

/**
 * All active trackers with spent, remaining, daysLeft, progress.
 */
export function getTrackersWithProgress(): TrackerWithProgress[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, name, budget_amount, reset_frequency, reset_day, last_reset_date, next_reset_date, bucket_id
     FROM trackers WHERE is_active = 1 ORDER BY name`
  )
  const list: TrackerWithProgress[] = []
  const today = localDateString()
  while (stmt.step()) {
    const row = stmt.get() as [
      number,
      string,
      number,
      string,
      number | null,
      string,
      string,
      number | null,
    ]
    const trackerRow: TrackerRow = {
      id: row[0],
      name: row[1],
      budget_amount: row[2],
      reset_frequency: row[3],
      reset_day: row[4],
      last_reset_date: row[5],
      next_reset_date: row[6],
      bucket_id: row[7],
    }
    const summary = summariseCurrentPeriod(trackerRow)
    const daysLeft = Math.max(0, daysBetween(today, trackerRow.next_reset_date))
    list.push({
      ...trackerRow,
      spent: summary.spent,
      effectiveBudget: summary.effectiveBudget,
      remaining: summary.remaining,
      daysLeft,
      progress: summary.progress,
      wasAdjustedThisPeriod: summary.wasAdjustedThisPeriod,
    })
  }
  stmt.free()
  return list
}

/**
 * Total budgeted across PAYDAY-frequency trackers, optionally excluding one tracker
 * (the one being edited, so its pending value can be added back separately).
 */
export function calculatePaydayBudgetTotal(
  trackers: Array<{
    id: number
    reset_frequency: string
    budget_amount: number
  }>,
  excludeId?: number
): number {
  return trackers
    .filter((t) => t.reset_frequency === 'PAYDAY' && t.id !== excludeId)
    .reduce((sum, t) => sum + t.budget_amount, 0)
}

/**
 * Get a single tracker row by id. Returns null if not found or inactive.
 */
export function getTracker(trackerId: number): TrackerRow | null {
  const db = getDb()
  if (!db) return null
  const stmt = db.prepare(
    `SELECT id, name, budget_amount, reset_frequency, reset_day, last_reset_date, next_reset_date, bucket_id
     FROM trackers WHERE id = ? AND is_active = 1`
  )
  stmt.bind([trackerId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const row = stmt.get() as [
    number,
    string,
    number,
    string,
    number | null,
    string,
    string,
    number | null,
  ]
  stmt.free()
  return {
    id: row[0],
    name: row[1],
    budget_amount: row[2],
    reset_frequency: row[3],
    reset_day: row[4],
    last_reset_date: row[5],
    next_reset_date: row[6],
    bucket_id: row[7],
  }
}

export type TrackerPeriodTransaction = {
  id: string
  description: string
  created_at: string | null
  settled_at: string | null
  amount: number
  status: string
}

/** Spending rows for one category set over [start, end), newest first, capped at `limit`. */
function readTrackerTxRows(
  db: NonNullable<ReturnType<typeof getDb>>,
  categoryIds: string[],
  startNorm: string,
  endNorm: string,
  limit: number
): TrackerPeriodTransaction[] {
  if (categoryIds.length === 0) return []
  const placeholders = categoryIds.map(() => '?').join(',')
  const stmt = db.prepare(
    `SELECT t.id, t.description, t.created_at, t.settled_at, t.amount, t.status
     FROM transactions t
     WHERE t.category_id IN (${placeholders})
       AND COALESCE(t.created_at, t.settled_at) >= ?
       AND COALESCE(t.created_at, t.settled_at) < ?
       AND t.amount < 0 AND t.transfer_account_id IS NULL
     ORDER BY COALESCE(t.created_at, t.settled_at) DESC LIMIT ?`
  )
  stmt.bind([...categoryIds, startNorm, endNorm, limit])
  const rows: TrackerPeriodTransaction[] = []
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      string,
      string | null,
      string | null,
      number,
      string,
    ]
    rows.push({
      id: r[0],
      description: r[1],
      created_at: r[2],
      settled_at: r[3],
      amount: r[4],
      status: r[5],
    })
  }
  stmt.free()
  return rows
}

/**
 * Transactions in a period for a tracker (for list in UI). Uses display date
 * (created_at with fallback to settled_at) for period and ordering. Returns status for Held/Settled.
 * When periodOffset is 0 or omitted, uses the current period split into
 * config-change segments (#16) so a mid-period category add/remove shows the
 * transactions that actually counted; otherwise uses the computed past period
 * with the current category set.
 * Fetches 21 rows and returns the first 20 plus a hasMore flag.
 */
export function getTrackerTransactionsInPeriod(
  trackerId: number,
  periodOffset?: number
): { list: TrackerPeriodTransaction[]; hasMore: boolean } {
  const db = getDb()
  if (!db) return { list: [], hasMore: false }
  const row = getTracker(trackerId)
  if (!row) return { list: [], hasMore: false }

  if (periodOffset === undefined || periodOffset === 0) {
    const segments = computeCurrentPeriodSegments(row)
    const merged: TrackerPeriodTransaction[] = []
    for (const seg of segments) {
      merged.push(
        ...readTrackerTxRows(db, seg.category_ids, seg.start, seg.end, 21)
      )
    }
    merged.sort((a, b) => {
      const da = a.created_at ?? a.settled_at ?? ''
      const dbb = b.created_at ?? b.settled_at ?? ''
      return dbb.localeCompare(da)
    })
    return { list: merged.slice(0, 20), hasMore: merged.length > 20 }
  }

  const bounds = getPeriodBoundsForOffset(row, periodOffset)
  if (!bounds) return { list: [], hasMore: false }
  const raw = readTrackerTxRows(
    db,
    getTrackerCategoryIds(trackerId),
    normDate(bounds.periodStart),
    normDate(bounds.periodEnd),
    21
  )
  return { list: raw.slice(0, 20), hasMore: raw.length === 21 }
}

/**
 * All active trackers with spent, remaining, daysLeft, progress for a given period offset.
 * periodOffset 0 = current period, -1 = previous period, etc. For past periods, daysLeft is 0.
 */
export function getTrackersWithProgressForPeriod(
  periodOffset: number
): TrackerWithProgress[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, name, budget_amount, reset_frequency, reset_day, last_reset_date, next_reset_date, bucket_id
     FROM trackers WHERE is_active = 1 ORDER BY name`
  )
  const list: TrackerWithProgress[] = []
  const today = localDateString()
  while (stmt.step()) {
    const row = stmt.get() as [
      number,
      string,
      number,
      string,
      number | null,
      string,
      string,
      number | null,
    ]
    const id = row[0]
    const trackerRow: TrackerRow = {
      id: row[0],
      name: row[1],
      budget_amount: row[2],
      reset_frequency: row[3],
      reset_day: row[4],
      last_reset_date: row[5],
      next_reset_date: row[6],
      bucket_id: row[7],
    }
    const bounds = getPeriodBoundsForOffset(trackerRow, periodOffset)
    if (!bounds) continue
    const { periodStart, periodEnd } = bounds
    const budget_amount = trackerRow.budget_amount
    const daysLeft =
      periodOffset >= 0 ? Math.max(0, daysBetween(today, periodEnd)) : 0

    // Offset 0 is the live period — split it at any config change (#16). Past
    // periods keep the whole-period, current-config reading (out of scope).
    let spent: number
    let effectiveBudget: number
    let remaining: number
    let progress: number
    let wasAdjustedThisPeriod: boolean
    if (periodOffset === 0) {
      const summary = summariseCurrentPeriod(trackerRow)
      spent = summary.spent
      effectiveBudget = summary.effectiveBudget
      remaining = summary.remaining
      progress = summary.progress
      wasAdjustedThisPeriod = summary.wasAdjustedThisPeriod
    } else {
      spent = getTrackerSpentInPeriod(id, periodStart, periodEnd)
      effectiveBudget = budget_amount
      remaining = Math.max(0, budget_amount - spent)
      progress = budget_amount > 0 ? (spent / budget_amount) * 100 : 0
      wasAdjustedThisPeriod = false
    }
    list.push({
      ...trackerRow,
      spent,
      effectiveBudget,
      remaining,
      daysLeft,
      progress,
      wasAdjustedThisPeriod,
      period_start: periodStart,
      period_end: periodEnd,
    })
  }
  stmt.free()
  return list
}

/**
 * UTC weekday for reset_day: 1=Mon..7=Sun maps to getUTCDay() 1..6,0.
 */
function resetDayToUTCDay(resetDay: number): number {
  return resetDay === 7 ? 0 : resetDay
}

/**
 * Start of the current period (inclusive). Used so tracker shows full period from reset day, not from creation day.
 */
function getLastResetDate(
  frequency: TrackerResetFrequency,
  resetDay: number,
  fromDate: string
): string {
  const from = new Date(fromDate + 'T12:00:00Z')
  if (frequency === 'PAYDAY') {
    return fromDate
  }
  if (frequency === 'WEEKLY') {
    const targetUTCDay = resetDayToUTCDay(resetDay)
    const currentUTCDay = from.getUTCDay()
    const daysBack = (currentUTCDay - targetUTCDay + 7) % 7
    const last = new Date(from)
    last.setUTCDate(last.getUTCDate() - daysBack)
    return last.toISOString().slice(0, 10)
  }
  if (frequency === 'FORTNIGHTLY') {
    const targetUTCDay = resetDayToUTCDay(resetDay)
    const currentUTCDay = from.getUTCDay()
    const daysBack = (currentUTCDay - targetUTCDay + 7) % 7
    const lastWeekday = new Date(from)
    lastWeekday.setUTCDate(lastWeekday.getUTCDate() - daysBack)
    const candidate = lastWeekday.toISOString().slice(0, 10)
    const daysSince = daysBetween(candidate, fromDate)
    const periodsSince = Math.floor(daysSince / 14)
    const last = new Date(candidate + 'T12:00:00Z')
    last.setUTCDate(last.getUTCDate() + 14 * periodsSince)
    return last.toISOString().slice(0, 10)
  }
  if (frequency === 'MONTHLY') {
    const d = new Date(from)
    const dayOfMonth = d.getUTCDate()
    if (dayOfMonth >= resetDay) {
      d.setUTCDate(resetDay)
    } else {
      d.setUTCMonth(d.getUTCMonth() - 1)
      d.setUTCDate(Math.min(resetDay, 28))
    }
    return d.toISOString().slice(0, 10)
  }
  return fromDate
}

function getNextResetDate(
  frequency: TrackerResetFrequency,
  resetDay: number,
  fromDate: string
): string {
  const from = new Date(fromDate + 'T12:00:00Z')
  if (frequency === 'PAYDAY') {
    const nextPayday = getAppSetting('next_payday')
    return nextPayday ?? from.toISOString().slice(0, 10)
  }
  let next: Date
  if (frequency === 'WEEKLY') {
    const targetUTCDay = resetDayToUTCDay(resetDay)
    const currentUTCDay = from.getUTCDay()
    const daysUntilNext = (targetUTCDay - currentUTCDay + 7) % 7 || 7
    next = new Date(from)
    next.setUTCDate(next.getUTCDate() + daysUntilNext)
  } else if (frequency === 'FORTNIGHTLY') {
    next = new Date(from)
    next.setUTCDate(next.getUTCDate() + 14)
  } else if (frequency === 'MONTHLY') {
    next = new Date(from)
    next.setUTCMonth(next.getUTCMonth() + 1)
    if (resetDay >= 1 && resetDay <= 31) next.setUTCDate(resetDay)
  } else {
    next = from
  }
  return next.toISOString().slice(0, 10)
}

/**
 * Throws CATEGORY_ALREADY_ASSIGNED:<categoryId> if any of categoryIds is already
 * used by another active tracker. A category may only belong to one tracker at a
 * time — sharing would double-count spend against two budgets simultaneously.
 */
function assertCategoriesAvailable(
  categoryIds: string[],
  excludeTrackerId?: number | null
): void {
  const usage = getTrackerCategoryUsage(excludeTrackerId)
  for (const catId of categoryIds) {
    if (usage[catId]) {
      throw new Error(`CATEGORY_ALREADY_ASSIGNED:${catId}`)
    }
  }
}

/**
 * Write (or replace, if one already exists at exactly `effectiveFrom`) a config
 * version for a tracker (#16) and its category set. The caller owns
 * `schedulePersist()`. Shared by createTracker, updateTracker, the demo seed and
 * profile import so the genesis / version insert lives in one place.
 */
export function writeTrackerConfigVersion(
  db: NonNullable<ReturnType<typeof getDb>>,
  trackerId: number,
  effectiveFrom: string,
  budgetAmountCents: number,
  categoryIds: string[]
): void {
  const now = new Date().toISOString()
  const existing = db.exec(
    `SELECT id FROM tracker_config_history WHERE tracker_id = ? AND effective_from = ?`,
    [trackerId, effectiveFrom]
  )
  let configId = Number(existing[0]?.values?.[0]?.[0] ?? 0)
  if (configId > 0) {
    db.run(`UPDATE tracker_config_history SET budget_amount = ? WHERE id = ?`, [
      budgetAmountCents,
      configId,
    ])
    db.run(
      `DELETE FROM tracker_config_history_categories WHERE config_id = ?`,
      [configId]
    )
  } else {
    db.run(
      `INSERT INTO tracker_config_history (tracker_id, effective_from, budget_amount, created_at)
       VALUES (?, ?, ?, ?)`,
      [trackerId, effectiveFrom, budgetAmountCents, now]
    )
    configId = Number(
      db.exec(`SELECT last_insert_rowid()`)[0]?.values?.[0]?.[0] ?? 0
    )
  }
  for (const catId of categoryIds) {
    db.run(
      `INSERT OR IGNORE INTO tracker_config_history_categories (config_id, category_id) VALUES (?, ?)`,
      [configId, catId]
    )
  }
}

/** Delete a tracker's whole config timeline (rows + category children). */
export function deleteTrackerConfigHistory(
  db: NonNullable<ReturnType<typeof getDb>>,
  trackerId: number
): void {
  const ids = db.exec(
    `SELECT id FROM tracker_config_history WHERE tracker_id = ?`,
    [trackerId]
  )
  for (const r of ids[0]?.values ?? []) {
    db.run(
      `DELETE FROM tracker_config_history_categories WHERE config_id = ?`,
      [Number(r[0])]
    )
  }
  db.run(`DELETE FROM tracker_config_history WHERE tracker_id = ?`, [trackerId])
}

/**
 * Record the config-history effect of an `updateTracker` edit (#16):
 * - frequency / reset-day change → wipe history, write a fresh genesis at the
 *   new period start (frequency-through-history is a deferred follow-up);
 * - budget / category change → a version effective tomorrow so the current
 *   period splits at that boundary rather than being re-judged whole;
 * - pure rename → nothing.
 * `existing` / `existingCats` are the pre-edit state (read before the caller's
 * `tracker_categories` rewrite).
 */
function maintainConfigHistoryOnEdit(args: {
  db: NonNullable<ReturnType<typeof getDb>>
  id: number
  existing: TrackerRow | null
  existingCats: string[]
  newBudgetCents: number
  newCategoryIds: string[]
  needsPeriodReset: boolean
  newLastReset: string
  today: string
}): void {
  const {
    db,
    id,
    existing,
    existingCats,
    newBudgetCents,
    newCategoryIds,
    needsPeriodReset,
    newLastReset,
    today,
  } = args
  if (needsPeriodReset) {
    deleteTrackerConfigHistory(db, id)
    writeTrackerConfigVersion(
      db,
      id,
      newLastReset,
      newBudgetCents,
      newCategoryIds
    )
    return
  }
  const budgetChanged = !existing || existing.budget_amount !== newBudgetCents
  const categoriesChanged = !sameCategorySet(existingCats, newCategoryIds)
  if (!budgetChanged && !categoriesChanged) return // pure rename

  // Defensive: a tracker created outside createTracker / the v40 migration
  // (demo seed, older data) may have no row covering the period start —
  // synthesise one from the pre-edit config so the segment before tomorrow is
  // judged against the OLD budget.
  if (existing) {
    const baseline = getTrackerConfigHistory(id)
    const hasBaseline = baseline.some(
      (v) => v.effective_from <= existing.last_reset_date
    )
    if (!hasBaseline) {
      writeTrackerConfigVersion(
        db,
        id,
        existing.last_reset_date,
        existing.budget_amount,
        existingCats
      )
    }
  }
  writeTrackerConfigVersion(
    db,
    id,
    addDaysToDateStr(today, 1),
    newBudgetCents,
    newCategoryIds
  )
}

/**
 * Create tracker and set start_date, last_reset_date, next_reset_date.
 * For PAYDAY use app_settings next_payday; for others use period start (e.g. last Monday) so the tracker shows the full frequency window.
 */
export function createTracker(
  name: string,
  budgetAmountCents: number,
  resetFrequency: TrackerResetFrequency,
  resetDay: number,
  categoryIds: string[]
): number {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  assertCategoriesAvailable(categoryIds)
  const now = new Date().toISOString()
  const today = localDateString()
  let lastReset: string
  let nextReset: string
  if (resetFrequency === 'PAYDAY') {
    const nextPayday = getAppSetting('next_payday')
    if (!nextPayday) throw new Error('PAYDAY_NOT_CONFIGURED')
    nextReset = nextPayday
    lastReset = getPreviousPaydayDate(nextPayday) ?? today
  } else {
    lastReset = getLastResetDate(resetFrequency, resetDay, today)
    nextReset = getNextResetDate(resetFrequency, resetDay, lastReset)
  }
  db.run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      name,
      budgetAmountCents,
      resetFrequency,
      resetDay,
      today,
      lastReset,
      nextReset,
      now,
    ]
  )
  const result = db.exec('SELECT last_insert_rowid()')
  const id = (result[0]?.values?.[0]?.[0] as number) ?? 0
  for (const catId of categoryIds) {
    db.run(
      `INSERT INTO tracker_categories (tracker_id, category_id) VALUES (?, ?)`,
      [id, catId]
    )
  }
  // Genesis config version (#16), anchored at the period start so "config as of
  // day D" is defined for any D in the first period.
  writeTrackerConfigVersion(db, id, lastReset, budgetAmountCents, categoryIds)
  schedulePersist()
  return id
}

/**
 * Update tracker name, budget, frequency, reset_day, categories.
 * Only recalculates last_reset_date / next_reset_date when reset_frequency or
 * reset_day actually changes — preserves the current period otherwise.
 */
export function updateTracker(
  id: number,
  name: string,
  budgetAmountCents: number,
  resetFrequency: TrackerResetFrequency,
  resetDay: number,
  categoryIds: string[]
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  assertCategoriesAvailable(categoryIds, id)
  const today = localDateString()
  const existing = getTracker(id)
  const existingCats = existing ? getTrackerCategoryIds(id) : []
  const needsPeriodReset =
    !existing ||
    existing.reset_frequency !== resetFrequency ||
    existing.reset_day !== resetDay

  let lastReset: string
  let nextReset: string
  if (!needsPeriodReset) {
    lastReset = existing!.last_reset_date
    nextReset = existing!.next_reset_date
  } else if (resetFrequency === 'PAYDAY') {
    const nextPayday = getAppSetting('next_payday')
    if (!nextPayday) throw new Error('PAYDAY_NOT_CONFIGURED')
    nextReset = nextPayday
    lastReset = getPreviousPaydayDate(nextPayday) ?? today
  } else {
    lastReset = getLastResetDate(resetFrequency, resetDay, today)
    nextReset = getNextResetDate(resetFrequency, resetDay, lastReset)
  }
  db.run(
    `UPDATE trackers SET name = ?, budget_amount = ?, reset_frequency = ?, reset_day = ?, last_reset_date = ?, next_reset_date = ? WHERE id = ?`,
    [
      name,
      budgetAmountCents,
      resetFrequency,
      resetDay,
      lastReset,
      nextReset,
      id,
    ]
  )
  db.run(`DELETE FROM tracker_categories WHERE tracker_id = ?`, [id])
  for (const catId of categoryIds) {
    db.run(
      `INSERT INTO tracker_categories (tracker_id, category_id) VALUES (?, ?)`,
      [id, catId]
    )
  }

  maintainConfigHistoryOnEdit({
    db,
    id,
    existing,
    existingCats,
    newBudgetCents: budgetAmountCents,
    newCategoryIds: categoryIds,
    needsPeriodReset,
    newLastReset: lastReset,
    today,
  })
  schedulePersist()
}

/**
 * Soft-deactivate tracker.
 */
export function deleteTracker(id: number): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`UPDATE trackers SET is_active = 0 WHERE id = ?`, [id])
  schedulePersist()
}

/**
 * Period history for analytics: last N periods with budget, spent, remaining.
 * Returns array from oldest to newest (index 0 = furthest back).
 */
export interface TrackerPeriodHistoryRow {
  periodOffset: number
  periodLabel: string
  periodStart: string
  periodEnd: string
  budget: number
  spent: number
  remaining: number
  progress: number
}

export function getTrackerPeriodHistory(
  trackerId: number,
  periodsBack: number
): TrackerPeriodHistoryRow[] {
  const row = getTracker(trackerId)
  if (!row || periodsBack < 1) return []
  const result: TrackerPeriodHistoryRow[] = []
  for (let offset = -periodsBack + 1; offset <= 0; offset++) {
    const bounds = getPeriodBoundsForOffset(row, offset)
    if (!bounds) continue
    const { periodStart, periodEnd } = bounds
    const spent = getTrackerSpentInPeriod(trackerId, periodStart, periodEnd)
    const budget = row.budget_amount
    const remaining = Math.max(0, budget - spent)
    const progress = budget > 0 ? (spent / budget) * 100 : 0
    const label =
      offset === 0
        ? 'Current'
        : offset === -1
          ? 'Previous'
          : `${-offset} periods ago`
    result.push({
      periodOffset: offset,
      periodLabel: label,
      periodStart,
      periodEnd,
      budget,
      spent,
      remaining,
      progress,
    })
  }
  return result
}

// ─── Period slice breakdown ──────────────────────────────────────────────────

export interface TrackerPeriodSlice {
  periodStart: string // inclusive, clipped to the requested range
  periodEnd: string // exclusive, clipped to the requested range
  label: string // e.g. "May 5–11"
  isPartial: boolean // true if the period was clipped at either end
  spent: number // cents
  budget: number // cents (full per-period budget, unprorated)
  progress: number // spent / budget × 100
}

function formatPeriodSliceLabel(
  fromInclusive: string,
  toExclusive: string
): string {
  const start = new Date(fromInclusive + 'T12:00:00Z')
  const end = new Date(toExclusive + 'T12:00:00Z')
  end.setUTCDate(end.getUTCDate() - 1) // convert to inclusive display end
  const startDay = start.getUTCDate()
  const endDay = end.getUTCDate()
  const startMonth = start.toLocaleString('default', {
    month: 'short',
    timeZone: 'UTC',
  })
  const endMonth = end.toLocaleString('default', {
    month: 'short',
    timeZone: 'UTC',
  })
  if (startMonth === endMonth) return `${startMonth} ${startDay}–${endDay}`
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`
}

/**
 * All reset periods for a tracker that overlap with [rangeFrom, rangeExclusiveEnd),
 * clipped to that range. Use for per-period breakdowns in historical reports
 * (e.g. showing each week of a given month for a WEEKLY tracker).
 */
export function getTrackerPeriodsInRange(
  tracker: TrackerRow,
  rangeFrom: string,
  rangeExclusiveEnd: string
): TrackerPeriodSlice[] {
  const results: TrackerPeriodSlice[] = []
  let offset = 0
  let iterations = 0

  while (iterations < 200) {
    iterations++
    const bounds = getPeriodBoundsForOffset(tracker, offset)
    if (!bounds) break

    const { periodStart, periodEnd } = bounds

    // Period ends before our range — done walking back
    if (periodEnd <= rangeFrom) break

    // Period hasn't entered our range yet — keep going back
    if (periodStart >= rangeExclusiveEnd) {
      offset--
      continue
    }

    // Overlaps — clip to range
    const clippedStart = periodStart < rangeFrom ? rangeFrom : periodStart
    const clippedEnd =
      periodEnd > rangeExclusiveEnd ? rangeExclusiveEnd : periodEnd
    const isPartial = clippedStart !== periodStart || clippedEnd !== periodEnd

    const spent = getTrackerSpentInPeriod(tracker.id, clippedStart, clippedEnd)
    const budget = tracker.budget_amount
    const progress = budget > 0 ? (spent / budget) * 100 : 0
    const label = formatPeriodSliceLabel(clippedStart, clippedEnd)

    results.push({
      periodStart: clippedStart,
      periodEnd: clippedEnd,
      label,
      isPartial,
      spent,
      budget,
      progress,
    })
    offset--
  }

  return results.reverse() // chronological order
}

/**
 * Transaction timeline for analytics: all spending transactions for a tracker
 * from first to current, for cumulative chart. Optionally filter by date range.
 */
export interface TrackerTransactionTimelineRow {
  id: string
  date: string
  amount: number
  description: string
  status: string
  cumulativeSpent: number
}

export function getTrackerTransactionTimeline(
  trackerId: number,
  options?: { dateFrom?: string; dateTo?: string; limit?: number }
): TrackerTransactionTimelineRow[] {
  const db = getDb()
  if (!db) return []
  const limit = options?.limit ?? 1000
  let dateFilter = ''
  const params: (string | number)[] = [trackerId]
  if (options?.dateFrom) {
    dateFilter += ' AND COALESCE(t.created_at, t.settled_at) >= ?'
    params.push(options.dateFrom)
  }
  if (options?.dateTo) {
    dateFilter += ' AND COALESCE(t.created_at, t.settled_at) < ?'
    params.push(options.dateTo)
  }
  params.push(limit)
  const stmt = db.prepare(
    `SELECT t.id, t.description, t.created_at, t.settled_at, t.amount, t.status
     FROM transactions t
     INNER JOIN tracker_categories tc ON t.category_id = tc.category_id
     WHERE tc.tracker_id = ? AND t.amount < 0 AND t.transfer_account_id IS NULL
     ${dateFilter}
     ORDER BY COALESCE(t.created_at, t.settled_at) ASC LIMIT ?`
  )
  stmt.bind(params)
  const raw: Array<{
    id: string
    description: string
    created_at: string | null
    settled_at: string | null
    amount: number
    status: string
  }> = []
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      string,
      string | null,
      string | null,
      number,
      string,
    ]
    raw.push({
      id: r[0],
      description: r[1],
      created_at: r[2],
      settled_at: r[3],
      amount: r[4],
      status: r[5],
    })
  }
  stmt.free()
  let cumulative = 0
  return raw.map((r) => {
    const absAmount = Math.abs(r.amount)
    cumulative += absAmount
    const date = r.created_at ?? r.settled_at ?? ''
    return {
      id: r.id,
      date: date.slice(0, 10),
      amount: absAmount,
      description: r.description,
      status: r.status,
      cumulativeSpent: cumulative,
    }
  })
}

/**
 * Paginated transactions for a tracker (for detail table). Ordered newest first.
 */
export function getTrackerTransactionsForTable(
  trackerId: number,
  options?: {
    dateFrom?: string
    dateTo?: string
    limit?: number
    offset?: number
  }
): Array<{
  id: string
  date: string
  amount: number
  description: string
  status: string
}> {
  const db = getDb()
  if (!db) return []
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0
  let dateFilter = ''
  const params: (string | number)[] = [trackerId]
  if (options?.dateFrom) {
    dateFilter += ' AND COALESCE(t.created_at, t.settled_at) >= ?'
    params.push(options.dateFrom)
  }
  if (options?.dateTo) {
    dateFilter +=
      " AND COALESCE(t.created_at, t.settled_at) < DATE(?, '+1 day')"
    params.push(options.dateTo)
  }
  params.push(limit, offset)
  const stmt = db.prepare(
    `SELECT t.id, t.description, t.created_at, t.settled_at, t.amount, t.status
     FROM transactions t
     INNER JOIN tracker_categories tc ON t.category_id = tc.category_id
     WHERE tc.tracker_id = ? AND t.amount < 0 AND t.transfer_account_id IS NULL
     ${dateFilter}
     ORDER BY COALESCE(t.created_at, t.settled_at) DESC LIMIT ? OFFSET ?`
  )
  stmt.bind(params)
  const list: Array<{
    id: string
    date: string
    amount: number
    description: string
    status: string
  }> = []
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      string,
      string | null,
      string | null,
      number,
      string,
    ]
    const date = r[2] ?? r[3] ?? ''
    list.push({
      id: r[0],
      date: date.slice(0, 10),
      amount: Math.abs(r[4]),
      description: r[1],
      status: r[5],
    })
  }
  stmt.free()
  return list
}

/**
 * Count of transactions for a tracker (optionally filtered by date). For pagination.
 */
export function getTrackerTransactionsCount(
  trackerId: number,
  options?: { dateFrom?: string; dateTo?: string }
): number {
  const db = getDb()
  if (!db) return 0
  let dateFilter = ''
  const params: (string | number)[] = [trackerId]
  if (options?.dateFrom) {
    dateFilter += ' AND COALESCE(t.created_at, t.settled_at) >= ?'
    params.push(options.dateFrom)
  }
  if (options?.dateTo) {
    dateFilter +=
      " AND COALESCE(t.created_at, t.settled_at) < DATE(?, '+1 day')"
    params.push(options.dateTo)
  }
  const stmt = db.prepare(
    `SELECT COUNT(*) as n FROM transactions t
     INNER JOIN tracker_categories tc ON t.category_id = tc.category_id
     WHERE tc.tracker_id = ? AND t.amount < 0 AND t.transfer_account_id IS NULL
     ${dateFilter}`
  )
  stmt.bind(params)
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
}

// ─── Budget bucket integration ───────────────────────────────────────────────

export interface BucketTrackerItem {
  id: number
  name: string
  budget_amount: number
  reset_frequency: string
}

export interface TrackerPickerItem extends BucketTrackerItem {
  current_bucket_id: number | null
  current_bucket_name: string | null
}

export function getBucketTrackers(bucketId: number): BucketTrackerItem[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, name, budget_amount, reset_frequency
     FROM trackers WHERE bucket_id = ? AND is_active = 1 ORDER BY name`
  )
  stmt.bind([bucketId])
  const list: BucketTrackerItem[] = []
  while (stmt.step()) {
    const row = stmt.get() as [number, string, number, string]
    list.push({
      id: row[0],
      name: row[1],
      budget_amount: row[2],
      reset_frequency: row[3],
    })
  }
  stmt.free()
  return list
}

export function assignTrackerToBucket(
  trackerId: number,
  bucketId: number | null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`UPDATE trackers SET bucket_id = ? WHERE id = ?`, [
    bucketId,
    trackerId,
  ])
  schedulePersist()
}

export function getTrackersForPicker(): TrackerPickerItem[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT t.id, t.name, t.budget_amount, t.reset_frequency,
            t.bucket_id, bb.name as bucket_name
     FROM trackers t
     LEFT JOIN budget_buckets bb ON t.bucket_id = bb.id
     WHERE t.is_active = 1 ORDER BY t.name`
  )
  const list: TrackerPickerItem[] = []
  while (stmt.step()) {
    const row = stmt.get() as [
      number,
      string,
      number,
      string,
      number | null,
      string | null,
    ]
    list.push({
      id: row[0],
      name: row[1],
      budget_amount: row[2],
      reset_frequency: row[3],
      current_bucket_id: row[4],
      current_bucket_name: row[5],
    })
  }
  stmt.free()
  return list
}

export const __test__ = {
  daysBetween,
  stepBackOnePeriod,
  getPreviousPaydayDate,
  getLastResetDate,
  getNextResetDate,
}

/**
 * Category IDs linked to a tracker (for edit form).
 */
export function getTrackerCategoryIds(trackerId: number): string[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT category_id FROM tracker_categories WHERE tracker_id = ?`
  )
  stmt.bind([trackerId])
  const ids: string[] = []
  while (stmt.step()) {
    ids.push(String(stmt.get()[0]))
  }
  stmt.free()
  return ids
}

/**
 * Returns a map of category_id → comma-separated tracker names for all OTHER active
 * trackers. Used to warn when a category is already assigned to another tracker.
 * Pass excludeTrackerId when editing an existing tracker to exclude it from results.
 */
export function getTrackerCategoryUsage(
  excludeTrackerId?: number | null
): Record<string, string> {
  const db = getDb()
  if (!db) return {}
  const hasExclude = excludeTrackerId != null
  const stmt = db.prepare(
    `SELECT tc.category_id, GROUP_CONCAT(t.name, ', ')
     FROM tracker_categories tc
     INNER JOIN trackers t ON tc.tracker_id = t.id
     WHERE t.is_active = 1${hasExclude ? ' AND t.id != ?' : ''}
     GROUP BY tc.category_id`
  )
  if (hasExclude) stmt.bind([excludeTrackerId])
  const map: Record<string, string> = {}
  while (stmt.step()) {
    const row = stmt.get() as [string, string]
    map[row[0]] = row[1]
  }
  stmt.free()
  return map
}
