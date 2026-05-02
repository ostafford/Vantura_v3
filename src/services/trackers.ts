/**
 * Trackers: CRUD and progress (spent in period per 05_Calculation_logic 5.1).
 */

import { getDb, getAppSetting, schedulePersist } from '@/db'

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
  badge_color?: string | null
}

export interface TrackerWithProgress extends TrackerRow {
  spent: number
  remaining: number
  daysLeft: number
  progress: number
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

/**
 * Spent in current period (cents). 5.1: tracker_categories + transactions, display date
 * (COALESCE(created_at, settled_at)) in [last_reset, next_reset), amount < 0, not round-up.
 */
export function getTrackerSpent(trackerId: number): number {
  const db = getDb()
  if (!db) return 0
  const stmt = db.prepare(
    `SELECT COALESCE(SUM(ABS(t.amount)), 0) as spent
     FROM transactions t
     INNER JOIN tracker_categories tc ON t.category_id = tc.category_id
     WHERE tc.tracker_id = ?
       AND COALESCE(t.created_at, t.settled_at) >= (SELECT last_reset_date FROM trackers WHERE id = ?)
       AND COALESCE(t.created_at, t.settled_at) < (SELECT next_reset_date FROM trackers WHERE id = ?)
       AND t.amount < 0 AND t.transfer_account_id IS NULL`
  )
  stmt.bind([trackerId, trackerId, trackerId])
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
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
  if (!frequency) return null
  const paydayDay = dayStr ? parseInt(dayStr, 10) : 1
  const from = new Date(fromDate + 'T12:00:00Z')
  let prev: Date
  if (frequency === 'WEEKLY') {
    prev = new Date(from)
    prev.setUTCDate(prev.getUTCDate() - 7)
  } else if (frequency === 'FORTNIGHTLY') {
    prev = new Date(from)
    prev.setUTCDate(prev.getUTCDate() - 14)
  } else if (frequency === 'MONTHLY') {
    prev = new Date(from)
    prev.setUTCMonth(prev.getUTCMonth() - 1)
    if (paydayDay >= 1 && paydayDay <= 28) prev.setUTCDate(paydayDay)
  } else {
    return null
  }
  return prev.toISOString().slice(0, 10)
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
    `SELECT id, name, budget_amount, reset_frequency, reset_day, last_reset_date, next_reset_date, badge_color
     FROM trackers WHERE is_active = 1 ORDER BY name`
  )
  const list: TrackerWithProgress[] = []
  const today = new Date().toISOString().slice(0, 10)
  while (stmt.step()) {
    const row = stmt.get() as [
      number,
      string,
      number,
      string,
      number | null,
      string,
      string,
      string | null,
    ]
    const id = row[0]
    const budget_amount = row[2]
    const next_reset_date = row[6]
    const spent = getTrackerSpent(id)
    const remaining = Math.max(0, budget_amount - spent)
    const daysLeft = Math.max(0, daysBetween(today, next_reset_date))
    const progress = budget_amount > 0 ? (spent / budget_amount) * 100 : 0
    list.push({
      id: row[0],
      name: row[1],
      budget_amount: row[2],
      reset_frequency: row[3],
      reset_day: row[4],
      last_reset_date: row[5],
      next_reset_date: row[6],
      badge_color:
        row[7] != null && String(row[7]).trim() !== ''
          ? String(row[7]).trim()
          : undefined,
      spent,
      remaining,
      daysLeft,
      progress,
    })
  }
  stmt.free()
  return list
}

/**
 * Get a single tracker row by id. Returns null if not found or inactive.
 */
export function getTracker(trackerId: number): TrackerRow | null {
  const db = getDb()
  if (!db) return null
  const stmt = db.prepare(
    `SELECT id, name, budget_amount, reset_frequency, reset_day, last_reset_date, next_reset_date, badge_color
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
    string | null,
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
    badge_color:
      row[7] != null && String(row[7]).trim() !== ''
        ? String(row[7]).trim()
        : undefined,
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

/**
 * Transactions in a period for a tracker (for list in UI). Uses display date
 * (created_at with fallback to settled_at) for period and ordering. Returns status for Held/Settled.
 * When periodOffset is 0 or omitted, uses current period from DB; otherwise uses computed period.
 * Fetches 21 rows and returns the first 20 plus a hasMore flag.
 */
export function getTrackerTransactionsInPeriod(
  trackerId: number,
  periodOffset?: number
): { list: TrackerPeriodTransaction[]; hasMore: boolean } {
  const db = getDb()
  if (!db) return { list: [], hasMore: false }
  let periodStart: string
  let periodEnd: string
  if (periodOffset === undefined || periodOffset === 0) {
    const row = getTracker(trackerId)
    if (!row) return { list: [], hasMore: false }
    periodStart = row.last_reset_date
    periodEnd = row.next_reset_date
  } else {
    const row = getTracker(trackerId)
    if (!row) return { list: [], hasMore: false }
    const bounds = getPeriodBoundsForOffset(row, periodOffset)
    if (!bounds) return { list: [], hasMore: false }
    periodStart = bounds.periodStart
    periodEnd = bounds.periodEnd
  }
  const startNorm =
    periodStart.length >= 10 ? periodStart.slice(0, 10) : periodStart
  const endNorm = periodEnd.length >= 10 ? periodEnd.slice(0, 10) : periodEnd
  const stmt = db.prepare(
    `SELECT t.id, t.description, t.created_at, t.settled_at, t.amount, t.status
     FROM transactions t
     INNER JOIN tracker_categories tc ON t.category_id = tc.category_id
     WHERE tc.tracker_id = ?
       AND COALESCE(t.created_at, t.settled_at) >= ?
       AND COALESCE(t.created_at, t.settled_at) < ?
       AND t.amount < 0 AND t.transfer_account_id IS NULL
     ORDER BY COALESCE(t.created_at, t.settled_at) DESC LIMIT 21`
  )
  stmt.bind([trackerId, startNorm, endNorm])
  const raw: TrackerPeriodTransaction[] = []
  while (stmt.step()) {
    const row = stmt.get() as [
      string,
      string,
      string | null,
      string | null,
      number,
      string,
    ]
    raw.push({
      id: row[0],
      description: row[1],
      created_at: row[2],
      settled_at: row[3],
      amount: row[4],
      status: row[5],
    })
  }
  stmt.free()
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
    `SELECT id, name, budget_amount, reset_frequency, reset_day, last_reset_date, next_reset_date, badge_color
     FROM trackers WHERE is_active = 1 ORDER BY name`
  )
  const list: TrackerWithProgress[] = []
  const today = new Date().toISOString().slice(0, 10)
  while (stmt.step()) {
    const row = stmt.get() as [
      number,
      string,
      number,
      string,
      number | null,
      string,
      string,
      string | null,
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
      badge_color:
        row[7] != null && String(row[7]).trim() !== ''
          ? String(row[7]).trim()
          : undefined,
    }
    const bounds = getPeriodBoundsForOffset(trackerRow, periodOffset)
    if (!bounds) continue
    const { periodStart, periodEnd } = bounds
    const spent = getTrackerSpentInPeriod(id, periodStart, periodEnd)
    const budget_amount = row[2]
    const remaining = Math.max(0, budget_amount - spent)
    const progress = budget_amount > 0 ? (spent / budget_amount) * 100 : 0
    const daysLeft =
      periodOffset >= 0 ? Math.max(0, daysBetween(today, periodEnd)) : 0
    list.push({
      ...trackerRow,
      spent,
      remaining,
      daysLeft,
      progress,
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
 * Create tracker and set start_date, last_reset_date, next_reset_date.
 * For PAYDAY use app_settings next_payday; for others use period start (e.g. last Monday) so the tracker shows the full frequency window.
 */
export function createTracker(
  name: string,
  budgetAmountCents: number,
  resetFrequency: TrackerResetFrequency,
  resetDay: number,
  categoryIds: string[],
  badgeColor?: string | null
): number {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
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
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at, badge_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      name,
      budgetAmountCents,
      resetFrequency,
      resetDay,
      today,
      lastReset,
      nextReset,
      now,
      badgeColor ?? null,
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
  categoryIds: string[],
  badgeColor?: string | null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const today = new Date().toISOString().slice(0, 10)
  const existing = getTracker(id)
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
    `UPDATE trackers SET name = ?, budget_amount = ?, reset_frequency = ?, reset_day = ?, badge_color = ?, last_reset_date = ?, next_reset_date = ? WHERE id = ?`,
    [
      name,
      budgetAmountCents,
      resetFrequency,
      resetDay,
      badgeColor ?? null,
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
    dateFilter += ' AND COALESCE(t.created_at, t.settled_at) < ?'
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
    dateFilter += ' AND COALESCE(t.created_at, t.settled_at) < ?'
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
