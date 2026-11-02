/**
 * A transaction's **display date** (GLOSSARY: `created_at ?? settled_at`) as a
 * local calendar day, for date-window queries (#149).
 *
 * Up stores timestamps with their local offset (`2026-11-08T20:00:00+11:00`),
 * so the first 10 characters are already the local day. Compare *that* against
 * local `YYYY-MM-DD` bounds, both ends inclusive. Never compare the raw
 * timestamp as text against a UTC ISO bound, and never run it through SQLite's
 * `date()` / `strftime()` — both shift the window by the UTC offset.
 */

/** SQL expression for the display date's local day, `YYYY-MM-DD`. */
export function displayDaySql(alias?: string): string {
  const p = alias ? `${alias}.` : ''
  return `substr(COALESCE(${p}created_at, ${p}settled_at), 1, 10)`
}

/** SQL predicate `display day BETWEEN ? AND ?` — bind two `YYYY-MM-DD` days. */
export function displayDayBetweenSql(alias?: string): string {
  return `${displayDaySql(alias)} BETWEEN ? AND ?`
}

/** Normalise a date bound to its `YYYY-MM-DD` day (drops any time part). */
export function toDayBound(date: string): string {
  return date.slice(0, 10)
}
