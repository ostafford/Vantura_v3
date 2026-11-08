/**
 * Format helpers for display.
 */

/** Format a Date as a local calendar-day string (YYYY-MM-DD), e.g. for "today" comparisons/storage. Defaults to now. */
export function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * A chart axis tick, in cents, as dollars: whole dollars without cents
 * (`$1,000`), cents only when the tick isn't a whole dollar (`$0.50`). A
 * negative tick uses the UI's U+2212 minus outside the dollar sign.
 */
export function formatAxisMoney(cents: number): string {
  const whole = Math.abs(cents) % 100 === 0
  const amount = (Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
  return cents < 0 ? `−$${amount}` : `$${amount}`
}

/**
 * Money for display with the sign *outside* the dollar symbol: `−$12.34`, not
 * `$-12.34`. Use at any balance/amount call site that can go negative (Headroom,
 * On hand). Non-negative values render as a plain `$12.34`; the minus
 * is U+2212 (MINUS SIGN), matching the rest of the UI.
 */
export function formatSignedMoney(cents: number): string {
  return cents < 0
    ? `−$${formatMoney(Math.abs(cents))}`
    : `$${formatMoney(cents)}`
}

/**
 * Like {@link formatSignedMoney} but also shows an explicit `+` on positives —
 * `+$12.34` / `−$12.34` / `$0.00`. Use for *changes / deltas* where the
 * direction is the point (net flow, a period-over-period
 * "Net" figure). A zero delta gets no sign.
 */
export function formatDeltaMoney(cents: number): string {
  if (cents > 0) return `+$${formatMoney(cents)}`
  if (cents < 0) return `−$${formatMoney(Math.abs(cents))}`
  return `$${formatMoney(0)}`
}

/**
 * One transaction's amount, signed as stored, the way the Transactions page
 * shows it: a purchase (negative) is `−$12.34`, anything else `+$12.34`.
 * Pair with `text-success` on non-purchases (`<TransactionAmount>`).
 */
export function formatTransactionAmount(cents: number): string {
  return cents < 0
    ? `−$${formatMoney(Math.abs(cents))}`
    : `+$${formatMoney(cents)}`
}

/** Format dollars for display (e.g. tooltips, axis labels). Use when value is already in dollars. */
export function formatDollars(dollars: number): string {
  return Number.isFinite(dollars)
    ? dollars.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00'
}

export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

export function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00Z' : ''))
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return isoDate
  }
}

export function formatShortDate(isoDate: string): string {
  try {
    const d = new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00Z' : ''))
    return formatShortDateFromDate(d)
  } catch {
    return isoDate
  }
}

/** Format a Date as "Mon, 9 Feb" (weekday, day, month) in local time. Use for week boundaries so the displayed date is the calendar day, not a UTC moment. */
export function formatShortDateFromDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** Format as "Mon, 9 Feb '25" (weekday, day, month, 2-digit year). Use when list can span years and year disambiguates. */
export function formatShortDateWithYear(isoDate: string): string {
  try {
    const d = new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00Z' : ''))
    const short = formatShortDateFromDate(d)
    const year = d.getFullYear() % 100
    return `${short} '${year.toString().padStart(2, '0')}`
  } catch {
    return isoDate
  }
}
