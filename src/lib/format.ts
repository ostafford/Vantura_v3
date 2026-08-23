/**
 * Format helpers for display.
 */

/**
 * Convert a plain local calendar-date string (YYYY-MM-DD, e.g. from an
 * `<input type="date">`) into the UTC ISO instant for local midnight.
 * Transaction timestamps are always UTC ('Z'-suffixed) Up API values —
 * comparing them directly against a bare date string treats it as UTC
 * midnight instead of the user's local midnight, shifting date-range
 * filters by the user's UTC offset. Pass-through if already a full
 * timestamp (length > 10).
 */
export function localDateStartUtc(dateStr: string): string {
  if (dateStr.length > 10) return dateStr
  return new Date(dateStr.slice(0, 10) + 'T00:00:00').toISOString()
}

/** End-of-local-day counterpart to {@link localDateStartUtc}, for `<=` bounds. */
export function localDateEndUtc(dateStr: string): string {
  if (dateStr.length > 10) return dateStr
  return new Date(dateStr.slice(0, 10) + 'T23:59:59.999').toISOString()
}

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
