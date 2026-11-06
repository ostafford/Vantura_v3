/**
 * When a Regular occurrence is **paid** (#212, #214).
 *
 * An occurrence is paid when the user marked it paid, or at least one Linked
 * payment (`linkedPaymentsBetween`, docs/adr/0020) is assigned to it:
 *
 * - Recurring: each Linked payment pays the projected occurrence nearest its
 *   Display date, within that occurrence's window (`occurrencePaidBy`). A
 *   payment outside every window pays nothing; a second payment in the same
 *   window pays no other occurrence.
 * - `ONCE`: paid by a Linked payment dated in its own month or later (the
 *   `isOverdueOnceIn` rule in `./month`).
 *
 * A mark (`regular_paid_marks`) counts only while its date is still one of the
 * Regular's projected occurrences (docs/adr/0004); after an edit that moves the
 * dates, a stale mark is ignored, never applied to another occurrence. The
 * stored date is never advanced, and marking never deletes a Regular.
 */

import type { Database } from 'sql.js'
import { getDb, schedulePersist } from '@/db'
import { calendarMonthDayBounds } from '@/lib/dateStr'
import { linkedPaymentsBetween, type LinkedPayment } from './linkedPayments'
import {
  getProjectedOccurrencesInRange,
  isProjectedOccurrence,
  occurrencePaidBy,
} from './projection'
import { readRegularById, readRegulars, type Regular } from './rows'

export interface RegularOccurrencePaid {
  /** The Regular at this occurrence: `next_charge_date` is the occurrence date. */
  regular: Regular
  /** Occurrence date, `YYYY-MM-DD`. */
  date: string
  /** True when it has a mark or at least one Linked payment assigned to it. */
  paid: boolean
  /** When the user marked it paid, or `null` when it isn't marked. */
  markedAt: string | null
  /** The Linked payments assigned to it, oldest first (empty when none). */
  payments: LinkedPayment[]
}

/** A stored mark, keyed by the Regular. Used by the profile export. */
export interface RegularPaidMark {
  regularId: number
  occurrenceDate: string
  markedAt: string
}

const LATEST_DAY = '9999-12-31'

/** Day `n` days after `date` (`YYYY-MM-DD`; negative goes back). */
function shiftDay(date: string, n: number): string {
  const d = new Date(date.slice(0, 10) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * The span of Display dates whose Linked payments could pay one of
 * `occurrences` (all of one Regular, in date order). A recurring occurrence's
 * window never reaches past its neighbours, so the span runs from one step
 * before the first to one step after the last (the gap is measured as in
 * `occurrencePaidBy`). A `ONCE` occurrence can be paid any time from its month.
 */
function paymentSpan(
  row: Regular,
  occurrences: string[]
): { start: string; end: string } | null {
  if (occurrences.length === 0) return null
  const first = occurrences[0]
  const last = occurrences[occurrences.length - 1]
  if (row.frequency === 'ONCE') {
    return {
      start: calendarMonthDayBounds(first.slice(0, 7)).first,
      end: LATEST_DAY,
    }
  }
  // A step is at most a year (YEARLY) plus a day for leap years; a 400-day
  // margin each side covers every frequency's neighbour.
  return { start: shiftDay(first, -400), end: shiftDay(last, 400) }
}

/** The occurrence `payment` pays, or `null` (see the module header). */
function occurrenceForPayment(
  row: Regular,
  payment: LinkedPayment
): string | null {
  if (row.frequency === 'ONCE') {
    const date = row.next_charge_date.slice(0, 10)
    if (!isProjectedOccurrence(row, date)) return null
    return payment.displayDate.slice(0, 7) >= date.slice(0, 7) ? date : null
  }
  return occurrencePaidBy(row, payment.displayDate)
}

function readMarks(
  db: Database,
  regularIds: number[]
): Map<number, Map<string, string>> {
  const out = new Map<number, Map<string, string>>()
  if (regularIds.length === 0) return out
  const stmt = db.prepare(
    `SELECT regular_id, occurrence_date, marked_at FROM regular_paid_marks
     WHERE regular_id IN (${regularIds.map(() => '?').join(', ')})`
  )
  stmt.bind(regularIds)
  while (stmt.step()) {
    const r = stmt.get() as [number, string, string]
    const byDate = out.get(r[0]) ?? new Map<string, string>()
    byDate.set(r[1], r[2])
    out.set(r[0], byDate)
  }
  stmt.free()
  return out
}

/**
 * Every occurrence of every Regular dated in `month` (`YYYY-MM`), by date then
 * Regular id, each with whether it is paid and how. Computed on every call;
 * empty when the DB isn't ready.
 */
export function regularOccurrencesPaidInMonth(
  month: string
): RegularOccurrencePaid[] {
  const db = getDb()
  if (!db) return []
  const { first, last } = calendarMonthDayBounds(month)

  const inMonth = readRegulars(db)
    .map((row) => ({
      row,
      dates: getProjectedOccurrencesInRange(row, first, last).map(
        (o) => o.next_charge_date
      ),
    }))
    .filter((r) => r.dates.length > 0)
  if (inMonth.length === 0) return []

  // One read of Linked payments covering every window that could reach this
  // month's occurrences; the ambiguity rule (ADR 0020) is applied inside it.
  let start = LATEST_DAY
  let end = '0000-01-01'
  for (const { row, dates } of inMonth) {
    const span = paymentSpan(row, dates)
    if (!span) continue
    if (span.start < start) start = span.start
    if (span.end > end) end = span.end
  }
  const linked = new Map(
    linkedPaymentsBetween(start, end).map((l) => [l.regularId, l])
  )
  const marks = readMarks(
    db,
    inMonth.map((r) => r.row.id)
  )

  const out: RegularOccurrencePaid[] = []
  for (const { row, dates } of inMonth) {
    const link = linked.get(row.id)
    const paymentsByDate = new Map<string, LinkedPayment[]>()
    if (link?.linked) {
      for (const payment of link.payments) {
        const date = occurrenceForPayment(row, payment)
        if (!date) continue
        const list = paymentsByDate.get(date) ?? []
        list.push(payment)
        paymentsByDate.set(date, list)
      }
    }
    const rowMarks = marks.get(row.id)
    for (const date of dates) {
      const payments = paymentsByDate.get(date) ?? []
      const markedAt = rowMarks?.get(date) ?? null
      out.push({
        regular: { ...row, next_charge_date: date },
        date,
        paid: markedAt != null || payments.length > 0,
        markedAt,
        payments,
      })
    }
  }
  out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.regular.id - b.regular.id
  )
  return out
}

/**
 * Mark one occurrence of a Regular paid. Returns false, writing nothing, when
 * the Regular doesn't exist or `date` isn't one of its projected occurrences.
 * Marking an already-marked occurrence keeps its original time. Never deletes
 * or changes the Regular, `ONCE` included.
 */
export function markOccurrencePaid(regularId: number, date: string): boolean {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const row = readRegularById(db, regularId)
  const day = date.slice(0, 10)
  if (!row || !isProjectedOccurrence(row, day)) return false
  db.run(
    `INSERT OR IGNORE INTO regular_paid_marks (regular_id, occurrence_date, marked_at)
     VALUES (?, ?, ?)`,
    [regularId, day, new Date().toISOString()]
  )
  schedulePersist()
  return true
}

/** Remove the mark on one occurrence (the Undo). No-op when it isn't marked. */
export function unmarkOccurrencePaid(regularId: number, date: string): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(
    `DELETE FROM regular_paid_marks WHERE regular_id = ? AND occurrence_date = ?`,
    [regularId, date.slice(0, 10)]
  )
  if (db.getRowsModified() > 0) schedulePersist()
}

/** Every stored mark, by Regular then date. For the profile export. */
export function readPaidMarks(): RegularPaidMark[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT regular_id, occurrence_date, marked_at FROM regular_paid_marks
     ORDER BY regular_id, occurrence_date`
  )
  const out: RegularPaidMark[] = []
  while (stmt.step()) {
    const r = stmt.get() as [number, string, string]
    out.push({ regularId: r[0], occurrenceDate: r[1], markedAt: r[2] })
  }
  stmt.free()
  return out
}
