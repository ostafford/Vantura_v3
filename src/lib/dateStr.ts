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
