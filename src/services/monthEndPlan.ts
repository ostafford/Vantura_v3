/**
 * The **Month-end plan** (#242, Spec D #239, decided in #180): the plan each
 * finished calendar month is judged against. It's frozen once, from the plan
 * as it stands, and never re-frozen, so later edits to Regulars, buckets,
 * Trackers or pay never rewrite a past month. Its actuals stay live: the
 * finished-month read (#243) attributes live transactions against it.
 *
 * **What's frozen** is enough for a finished month to render and attribute
 * without reading the live plan:
 * - every bucket: id, name, icon and order;
 * - every Regular: its bucket, amount, frequency, stored date and cancel-by
 *   date (so its occurrence windows can be projected for the paid rule), its
 *   occurrences dated in the month, and its `match_description` (the ±20%
 *   Linked payment band is implied by the amount, docs/adr/0020);
 * - every active Tracker: its bucket, its planned figure for the month and
 *   its category set on each day of the month (from Config history), as the
 *   month attribution read computes them (`trackerPlansInMonth`);
 * - the pay amount and Pay frequency Income is built from, or `null` when no
 *   usable pay is set;
 * - the paid marks on the month's occurrences, copied from the live table.
 *
 * Ids are the ones in effect at the freeze. A plan is self-contained, so they
 * are never remapped (a profile import gives live rows new ids; a frozen
 * plan's ids only name things inside that plan).
 *
 * **When:** `freezeMonthEndPlans`, at boot straight after `initDb` and from
 * the day-change watcher (`runDateDependentWrites`). It freezes every month
 * from the **first plannable month** through last month that has no plan yet.
 * The first plannable month is the month the app first runs with this
 * feature once onboarded (or the onboarding month on a fresh install), stored
 * once in `app_settings`. Earlier months never get a plan.
 *
 * **Storage:** `month_end_plans`, one row per month; `plan_json` is the plan
 * body, versioned by its `version` field (`MONTH_END_PLAN_VERSION`).
 *
 * **Reading a finished month** (#243): `planInputOf` turns a plan into the
 * attribution read's plan input. **Past-month marks** are written into the
 * plan (`markFrozenOccurrencePaid` / `unmarkFrozenOccurrencePaid`), never the
 * live table: they change an occurrence's status only.
 */

import { getDb, getAppSetting, setAppSetting, schedulePersist } from '@/db'
import { addDaysToDateStr, calendarMonthDayBounds } from '@/lib/dateStr'
import { localDateString } from '@/lib/format'
import { isPayFrequency, type PayFrequency } from '@/lib/payFrequency'
import { getBuckets, readPay } from '@/services/budgetBuckets'
import {
  trackerPlansInMonth,
  type MonthPlanInput,
} from '@/services/monthAttribution'
import { regularPlansInMonth, type Regular } from '@/services/regulars'

/** The plan body's format version. Bump it when the shape changes. */
export const MONTH_END_PLAN_VERSION = 1

/** `app_settings` key: the first plannable month, `YYYY-MM`. */
export const FIRST_PLANNABLE_MONTH_KEY = 'first_plannable_month'

export interface FrozenBucket {
  id: number
  name: string
  icon: string
  /** `budget_buckets.sort_order`; `buckets` is already in Budget Plan order. */
  sortOrder: number
}

export interface FrozenRegular {
  id: number
  name: string
  /** `null` when it wasn't in a bucket. */
  bucketId: number | null
  /** Amount per charge, cents. Its Linked payment band is ±20% of it. */
  amount: number
  frequency: string
  /** The stored date (`next_charge_date`), never projected (docs/adr/0004). */
  anchorDate: string
  cancelByDate: string | null
  /** `null` when it has no Linked payments to look for (no actual figure). */
  matchDescription: string | null
  /** Its occurrence dates in the month, oldest first (empty when none). */
  occurrences: string[]
}

export interface FrozenTracker {
  id: number
  name: string
  /** `null` when it wasn't in a bucket. */
  bucketId: number | null
  /** The month attribution read's planned figure; `null` when unpriced. */
  plannedCents: number | null
  /**
   * Every day of the month (`YYYY-MM-DD`) → the category ids of the config in
   * effect that day, sorted. Empty on a day before its first config version.
   */
  categoryIdsByDay: Record<string, string[]>
}

export interface FrozenPaidMark {
  regularId: number
  occurrenceDate: string
  markedAt: string
}

/** What `plan_json` holds. */
export interface MonthEndPlanBody {
  version: typeof MONTH_END_PLAN_VERSION
  /** In Budget Plan order. */
  buckets: FrozenBucket[]
  /** Every Regular, in id order. */
  regulars: FrozenRegular[]
  /** Every active Tracker, in id order. */
  trackers: FrozenTracker[]
  /** The pay Income is built from; `null` when no usable pay was set. */
  pay: { perPay: number; frequency: PayFrequency } | null
  /** The marks on the month's occurrences, by Regular then date. */
  paidMarks: FrozenPaidMark[]
}

export interface MonthEndPlan extends MonthEndPlanBody {
  /** `YYYY-MM`. */
  month: string
  /** When it was frozen, ISO 8601. */
  frozenAt: string
}

/** A stored row, as the profile export carries it. */
export interface MonthEndPlanRow {
  month: string
  frozenAt: string
  body: MonthEndPlanBody
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** True for a real `YYYY-MM` month. */
export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_RE.test(value)
}

/** The month after `month` (`YYYY-MM`). */
function nextMonth(month: string): string {
  return addDaysToDateStr(calendarMonthDayBounds(month).last, 1).slice(0, 7)
}

/** Every day of `month`, `YYYY-MM-DD`. */
function daysOfMonth(month: string): string[] {
  const { first, last } = calendarMonthDayBounds(month)
  const days: string[] = []
  for (let d = first; d <= last; d = addDaysToDateStr(d, 1)) days.push(d)
  return days
}

/** The plan for `month` as it stands now. */
function livePlanBody(month: string): MonthEndPlanBody {
  const regularPlans = regularPlansInMonth(month)
  const pay = readPay()
  return {
    version: MONTH_END_PLAN_VERSION,
    buckets: getBuckets().map((b) => ({
      id: b.id,
      name: b.name,
      icon: b.icon,
      sortOrder: b.sort_order,
    })),
    regulars: regularPlans.map(({ regular: r, occurrences }) => ({
      id: r.id,
      name: r.name,
      bucketId: r.bucket_id,
      amount: r.amount,
      frequency: r.frequency,
      anchorDate: r.next_charge_date.slice(0, 10),
      cancelByDate: r.cancel_by_date ? r.cancel_by_date.slice(0, 10) : null,
      matchDescription: r.match_description,
      occurrences,
    })),
    trackers: trackerPlansInMonth(month).map((t) => ({
      id: t.trackerId,
      name: t.name,
      bucketId: t.bucketId,
      plannedCents: t.plannedCents,
      categoryIdsByDay: Object.fromEntries(t.categoryIdsByDay),
    })),
    pay: pay ? { perPay: pay.perPay, frequency: pay.frequency } : null,
    paidMarks: regularPlans.flatMap(({ marks }) =>
      marks.map((m) => ({
        regularId: m.regularId,
        occurrenceDate: m.occurrenceDate,
        markedAt: m.markedAt,
      }))
    ),
  }
}

// ── Validation ────────────────────────────────────────────────────────────

const isInt = (v: unknown): v is number => Number.isSafeInteger(v)
const isId = (v: unknown): v is number => isInt(v) && v > 0
const isText = (v: unknown): v is string => typeof v === 'string'
const isNullableId = (v: unknown): v is number | null => v === null || isId(v)
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isDay = (v: unknown): v is string => isText(v) && DAY_RE.test(v)

function uniqueIds(rows: { id: number }[]): boolean {
  return new Set(rows.map((r) => r.id)).size === rows.length
}

/**
 * `value` as a plan body for `month`, or `null` when it isn't exactly one:
 * every field typed, every date in the month, a category set for every day,
 * and every mark on one of its Regular's frozen occurrences. Strict, because
 * a finished month is judged against it and a guess would be unverifiable.
 */
export function parseMonthEndPlanBody(
  value: unknown,
  month: string
): MonthEndPlanBody | null {
  if (!isMonth(month) || !isRecord(value)) return null
  if (value.version !== MONTH_END_PLAN_VERSION) return null
  const { buckets, regulars, trackers, pay, paidMarks } = value
  if (
    !Array.isArray(buckets) ||
    !Array.isArray(regulars) ||
    !Array.isArray(trackers) ||
    !Array.isArray(paidMarks)
  ) {
    return null
  }
  const inMonth = (d: unknown): d is string =>
    isDay(d) && d.slice(0, 7) === month
  const days = daysOfMonth(month)

  const outBuckets: FrozenBucket[] = []
  for (const b of buckets) {
    if (
      !isRecord(b) ||
      !isId(b.id) ||
      !isText(b.name) ||
      !isText(b.icon) ||
      !isInt(b.sortOrder)
    ) {
      return null
    }
    outBuckets.push({
      id: b.id,
      name: b.name,
      icon: b.icon,
      sortOrder: b.sortOrder,
    })
  }

  const outRegulars: FrozenRegular[] = []
  for (const r of regulars) {
    if (
      !isRecord(r) ||
      !isId(r.id) ||
      !isText(r.name) ||
      !isNullableId(r.bucketId) ||
      !isInt(r.amount) ||
      r.amount < 0 ||
      !isText(r.frequency) ||
      !isDay(r.anchorDate) ||
      !(r.cancelByDate === null || isDay(r.cancelByDate)) ||
      !(r.matchDescription === null || isText(r.matchDescription)) ||
      !Array.isArray(r.occurrences) ||
      !r.occurrences.every(inMonth)
    ) {
      return null
    }
    outRegulars.push({
      id: r.id,
      name: r.name,
      bucketId: r.bucketId,
      amount: r.amount,
      frequency: r.frequency,
      anchorDate: r.anchorDate,
      cancelByDate: r.cancelByDate,
      matchDescription: r.matchDescription,
      occurrences: [...(r.occurrences as string[])],
    })
  }

  const outTrackers: FrozenTracker[] = []
  for (const t of trackers) {
    if (
      !isRecord(t) ||
      !isId(t.id) ||
      !isText(t.name) ||
      !isNullableId(t.bucketId) ||
      !(t.plannedCents === null || isInt(t.plannedCents)) ||
      !isRecord(t.categoryIdsByDay)
    ) {
      return null
    }
    const byDay = t.categoryIdsByDay
    if (Object.keys(byDay).length !== days.length) return null
    const categoryIdsByDay: Record<string, string[]> = {}
    for (const day of days) {
      const ids = byDay[day]
      if (!Array.isArray(ids) || !ids.every(isText)) return null
      categoryIdsByDay[day] = [...ids]
    }
    outTrackers.push({
      id: t.id,
      name: t.name,
      bucketId: t.bucketId,
      plannedCents: t.plannedCents,
      categoryIdsByDay,
    })
  }

  let outPay: MonthEndPlanBody['pay'] = null
  if (pay !== null) {
    if (
      !isRecord(pay) ||
      !isInt(pay.perPay) ||
      pay.perPay <= 0 ||
      !isPayFrequency(pay.frequency)
    ) {
      return null
    }
    outPay = { perPay: pay.perPay, frequency: pay.frequency }
  }

  const occurrencesById = new Map(
    outRegulars.map((r) => [r.id, new Set(r.occurrences)])
  )
  const outMarks: FrozenPaidMark[] = []
  for (const m of paidMarks) {
    if (
      !isRecord(m) ||
      !isId(m.regularId) ||
      !isDay(m.occurrenceDate) ||
      !occurrencesById.get(m.regularId)?.has(m.occurrenceDate) ||
      !isText(m.markedAt) ||
      m.markedAt === ''
    ) {
      return null
    }
    outMarks.push({
      regularId: m.regularId,
      occurrenceDate: m.occurrenceDate,
      markedAt: m.markedAt,
    })
  }
  const markKeys = new Set(
    outMarks.map((m) => `${m.regularId}|${m.occurrenceDate}`)
  )

  if (
    !uniqueIds(outBuckets) ||
    !uniqueIds(outRegulars) ||
    !uniqueIds(outTrackers) ||
    markKeys.size !== outMarks.length
  ) {
    return null
  }
  return {
    version: MONTH_END_PLAN_VERSION,
    buckets: outBuckets,
    regulars: outRegulars,
    trackers: outTrackers,
    pay: outPay,
    paidMarks: outMarks,
  }
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** The stored first plannable month, or `null` when unset or malformed. */
export function getFirstPlannableMonth(): string | null {
  const value = getAppSetting(FIRST_PLANNABLE_MONTH_KEY)
  return isMonth(value) ? value : null
}

/**
 * Every stored plan, oldest month first. A row whose JSON doesn't parse as a
 * plan for its month is left out, so the finished-month read declines for
 * that month rather than guess.
 */
export function readMonthEndPlanRows(): MonthEndPlanRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT month, plan_json, frozen_at FROM month_end_plans ORDER BY month`
  )
  const out: MonthEndPlanRow[] = []
  while (stmt.step()) {
    const [month, json, frozenAt] = stmt.get() as [string, string, string]
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      continue
    }
    const body = parseMonthEndPlanBody(parsed, month)
    if (body) out.push({ month, frozenAt, body })
  }
  stmt.free()
  return out
}

/**
 * True when a stored Month-end plan row can't be read. Profile export refuses
 * then: a file without that month would let the next boot on the importing
 * device re-freeze it from today's plan (`docs/adr/0025`).
 */
export function hasUnreadableMonthEndPlan(): boolean {
  const db = getDb()
  if (!db) return false
  const stored = db.exec(`SELECT COUNT(*) FROM month_end_plans`)
  const count = Number(stored[0]?.values[0]?.[0] ?? 0)
  return count !== readMonthEndPlanRows().length
}

/** The Month-end plan for `month` (`YYYY-MM`), or `null` when there's none. */
export function getMonthEndPlan(month: string): MonthEndPlan | null {
  const row = readMonthEndPlanRows().find((r) => r.month === month)
  return row ? { ...row.body, month: row.month, frozenAt: row.frozenAt } : null
}

/**
 * A Month-end plan as the attribution read's plan input (#243): its Regulars
 * as stored rows (the stored date as `next_charge_date`, so occurrence
 * windows project as they did), their frozen occurrences and marks, and its
 * Trackers. Fields a plan doesn't freeze (category, reminder) don't affect
 * the read and are left empty.
 */
export function planInputOf(plan: MonthEndPlanBody): MonthPlanInput {
  const rows: Regular[] = plan.regulars.map((r) => ({
    id: r.id,
    name: r.name,
    amount: r.amount,
    frequency: r.frequency,
    next_charge_date: r.anchorDate,
    category_id: null,
    reminder_days_before: null,
    cancel_by_date: r.cancelByDate,
    match_description: r.matchDescription,
    bucket_id: r.bucketId,
  }))
  return {
    regulars: {
      rows,
      occurrences: new Map(plan.regulars.map((r) => [r.id, r.occurrences])),
      marks: plan.paidMarks.map((m) => ({ ...m })),
    },
    trackers: plan.trackers.map((t) => ({
      trackerId: t.id,
      name: t.name,
      bucketId: t.bucketId,
      plannedCents: t.plannedCents,
      categoryIdsByDay: new Map(Object.entries(t.categoryIdsByDay)),
    })),
  }
}

/** The months that have a row, oldest first (parseable or not). */
function storedMonths(): Set<string> {
  const db = getDb()
  if (!db) return new Set()
  const stmt = db.prepare(`SELECT month FROM month_end_plans`)
  const out = new Set<string>()
  while (stmt.step()) out.add(String(stmt.get()[0]))
  stmt.free()
  return out
}

// ── Writes ────────────────────────────────────────────────────────────────

/**
 * Stores `today`'s month as the first plannable month unless one is already
 * set. Called when onboarding completes, and by the freeze on the first boot
 * of an already-onboarded install. A malformed stored value is left alone
 * (the freeze then declines) rather than replaced with a guess.
 */
export function ensureFirstPlannableMonth(
  today: string = localDateString()
): void {
  const stored = getAppSetting(FIRST_PLANNABLE_MONTH_KEY)
  if (stored !== null && stored !== '') return
  setAppSetting(FIRST_PLANNABLE_MONTH_KEY, today.slice(0, 7))
}

/**
 * Freezes the Month-end plan of every month from the first plannable month
 * through last month that doesn't have one yet, each from the plan as it
 * stands. Idempotent: a month with a row is never re-frozen. Does nothing
 * before onboarding completes; on the first run after it, it only stores the
 * first plannable month (this month, which isn't finished). Returns the
 * months it froze, oldest first.
 */
export function freezeMonthEndPlans(
  today: string = localDateString()
): string[] {
  const db = getDb()
  if (!db) return []
  if (getAppSetting('onboarding_complete') !== '1') return []
  ensureFirstPlannableMonth(today)
  const first = getFirstPlannableMonth()
  if (first === null) return []

  const current = today.slice(0, 7)
  const existing = storedMonths()
  const frozenAt = new Date().toISOString()
  const frozen: string[] = []
  for (let month = first; month < current; month = nextMonth(month)) {
    if (existing.has(month)) continue
    db.run(
      `INSERT OR IGNORE INTO month_end_plans (month, plan_json, frozen_at)
       VALUES (?, ?, ?)`,
      [month, JSON.stringify(livePlanBody(month)), frozenAt]
    )
    if (db.getRowsModified() > 0) frozen.push(month)
  }
  if (frozen.length > 0) schedulePersist()
  return frozen
}

/** Rewrites `month`'s plan body (its row must exist). */
function writePlanBody(month: string, body: MonthEndPlanBody): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`UPDATE month_end_plans SET plan_json = ? WHERE month = ?`, [
    JSON.stringify(body),
    month,
  ])
  schedulePersist()
}

/**
 * Marks one of a finished month's occurrences paid, in that month's plan
 * (#243): past-month marks never touch the live table, so this works for a
 * Regular deleted since the freeze, and deleting a Regular never erases one.
 * A mark changes the occurrence's status only, never Actual spending or
 * Saved. Returns false, writing nothing, when the month has no plan or `date`
 * isn't one of that Regular's frozen occurrences. Marking an already-marked
 * occurrence keeps its original time.
 */
export function markFrozenOccurrencePaid(
  month: string,
  regularId: number,
  date: string
): boolean {
  const plan = getMonthEndPlan(month)
  const regular = plan?.regulars.find((r) => r.id === regularId)
  if (!plan || !regular || !regular.occurrences.includes(date)) return false
  if (
    plan.paidMarks.some(
      (m) => m.regularId === regularId && m.occurrenceDate === date
    )
  ) {
    return true
  }
  const paidMarks = [
    ...plan.paidMarks,
    { regularId, occurrenceDate: date, markedAt: new Date().toISOString() },
  ].sort(
    (a, b) =>
      a.regularId - b.regularId ||
      a.occurrenceDate.localeCompare(b.occurrenceDate)
  )
  writePlanBody(month, bodyOf(plan, paidMarks))
  return true
}

/** Removes the mark on one of a finished month's occurrences (the Undo). */
export function unmarkFrozenOccurrencePaid(
  month: string,
  regularId: number,
  date: string
): void {
  const plan = getMonthEndPlan(month)
  if (!plan) return
  const paidMarks = plan.paidMarks.filter(
    (m) => !(m.regularId === regularId && m.occurrenceDate === date)
  )
  if (paidMarks.length === plan.paidMarks.length) return
  writePlanBody(month, bodyOf(plan, paidMarks))
}

/** `plan`'s body with `paidMarks` in place of its own. */
function bodyOf(
  plan: MonthEndPlan,
  paidMarks: FrozenPaidMark[]
): MonthEndPlanBody {
  return {
    version: plan.version,
    buckets: plan.buckets,
    regulars: plan.regulars,
    trackers: plan.trackers,
    pay: plan.pay,
    paidMarks,
  }
}

/**
 * Replaces every Month-end plan and the first plannable month (a profile
 * import, #242). Must run inside the import's transaction; it opens none.
 * `rows` must already be validated (`parseMonthEndPlanBody`). `firstMonth`
 * `null` clears it, so the next boot starts again from that month.
 */
export function replaceMonthEndPlans(
  rows: MonthEndPlanRow[],
  firstMonth: string | null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM month_end_plans`)
  db.run(`DELETE FROM app_settings WHERE key = ?`, [FIRST_PLANNABLE_MONTH_KEY])
  for (const row of rows) {
    db.run(
      `INSERT INTO month_end_plans (month, plan_json, frozen_at) VALUES (?, ?, ?)`,
      [row.month, JSON.stringify(row.body), row.frozenAt]
    )
  }
  if (firstMonth !== null) {
    db.run(`INSERT INTO app_settings (key, value) VALUES (?, ?)`, [
      FIRST_PLANNABLE_MONTH_KEY,
      firstMonth,
    ])
  }
}
