/**
 * `YYYY-MM-DD` date-string arithmetic — the month/day/year-rollover math that
 * `CLAUDE.md` calls out as historically bug-prone (unpadded dates, month
 * rollover, DST). All of it anchors at noon UTC so a `+/- days` step never
 * lands on a DST boundary, and every result is a plain `YYYY-MM-DD` string.
 *
 * Payday-relative logic still belongs to `@/lib/payday`; this module is the
 * calendar-arithmetic layer shared by the tracker views and `services/trackers`.
 */
import type { BudgetDisplayPeriod } from './monthlyEquivalent'

/** Trim a date-or-datetime string down to its leading `YYYY-MM-DD`. */
export function normalizeDateStr(s: string): string {
  return s.length >= 10 ? s.slice(0, 10) : s
}

/** Add `days` (may be negative) to a `YYYY-MM-DD` string, same form back. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(normalizeDateStr(dateStr) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Whole days from `a` to `b` (`b - a`), rounded. Returns 0 if either side
 * doesn't parse. Negative when `b` precedes `a`.
 */
export function daysBetweenDateStr(a: string, b: string): number {
  const ta = new Date(normalizeDateStr(a) + 'T12:00:00Z').getTime()
  const tb = new Date(normalizeDateStr(b) + 'T12:00:00Z').getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 0
  return Math.round((tb - ta) / (24 * 60 * 60 * 1000))
}

/**
 * First and last day of a calendar month given as `YYYY-MM`, both inclusive,
 * as `YYYY-MM-DD`. Throws on anything that isn't a real `YYYY-MM` month.
 */
export function calendarMonthDayBounds(month: string): {
  first: string
  last: string
} {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  const m = match ? Number(match[2]) : 0
  if (!match || m < 1 || m > 12) throw new Error(`Invalid month: ${month}`)
  const lastDay = new Date(Date.UTC(Number(match[1]), m, 0)).getUTCDate()
  return {
    first: `${month}-01`,
    last: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

/**
 * Calendar bounds for a display period relative to `now`, `offset` periods
 * away (0 = the current one, -1 = the previous, etc.). `from` is inclusive,
 * `to` is exclusive (the first day of the next period). Weeks start Monday.
 */
export function calendarPeriodBounds(
  period: BudgetDisplayPeriod,
  offset = 0,
  now: Date = new Date()
): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  if (period === 'WEEKLY') {
    const daysFromMonday = (now.getUTCDay() + 6) % 7
    const from = new Date(now)
    from.setUTCDate(now.getUTCDate() - daysFromMonday + offset * 7)
    const to = new Date(from)
    to.setUTCDate(from.getUTCDate() + 7)
    return { from: iso(from), to: iso(to) }
  }

  if (period === 'YEARLY') {
    const year = now.getUTCFullYear() + offset
    return { from: `${year}-01-01`, to: `${year + 1}-01-01` }
  }

  // MONTHLY — calendar month
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  return {
    from: iso(new Date(Date.UTC(year, month + offset, 1))),
    to: iso(new Date(Date.UTC(year, month + offset + 1, 1))),
  }
}

/**
 * The 1st of the local calendar month containing `now`, and the 1st of the
 * next one — a MONTHLY, reset-day-1 tracker's current period. Where a PAYDAY
 * tracker lands when it moves to MONTHLY (#192).
 */
export function localCalendarMonthResetDates(now: Date = new Date()): {
  lastReset: string
  nextReset: string
} {
  const first = (y: number, m: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-01`
  const y = now.getFullYear()
  const m = now.getMonth()
  return {
    lastReset: first(y, m),
    nextReset: m === 11 ? first(y + 1, 0) : first(y, m + 1),
  }
}
