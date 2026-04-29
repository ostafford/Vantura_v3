/**
 * Format helpers for display.
 */

export function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** Format dollars for display (e.g. tooltips, axis labels). Use when value is already in dollars. */
export function formatDollars(dollars: number): string {
  return Number.isFinite(dollars) ? dollars.toFixed(2) : '0.00'
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
