/** Locale-aware calendar month/week labels for comparisons and UI. */

export const MONTH_LABEL_FALLBACK = '—'

function isValidCalendarYearMonth(year: number, month: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    Math.abs(year) <= 999_999
  )
}

function localDateFromYmd(ymd: string): Date | null {
  if (ymd.length < 10) return null
  const y = parseInt(ymd.slice(0, 4), 10)
  const m = parseInt(ymd.slice(5, 7), 10)
  const d = parseInt(ymd.slice(8, 10), 10)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
    return null
  const date = new Date(y, m - 1, d)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function monthNameLong(year: number, month: number): string {
  if (!isValidCalendarYearMonth(year, month)) return MONTH_LABEL_FALLBACK
  const date = new Date(year, month - 1, 1)
  if (Number.isNaN(date.getTime())) return MONTH_LABEL_FALLBACK
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'long' }).format(date)
  } catch {
    return MONTH_LABEL_FALLBACK
  }
}

export function previousCalendarMonth(
  year: number,
  month: number
): { year: number; month: number } {
  if (!isValidCalendarYearMonth(year, month)) {
    return { year: 1970, month: 1 }
  }
  let m = month - 1
  let y = year
  if (m < 1) {
    m = 12
    y -= 1
  }
  return { year: y, month: m }
}

/**
 * Legend / title labels for current vs previous calendar month.
 * When months span a year boundary, include the year on both to avoid ambiguity.
 */
export function comparisonMonthPairLabels(
  currentYear: number,
  currentMonth: number
): { currentLabel: string; previousLabel: string; vsPriorShort: string } {
  if (!isValidCalendarYearMonth(currentYear, currentMonth)) {
    const fb = MONTH_LABEL_FALLBACK
    return {
      currentLabel: fb,
      previousLabel: fb,
      vsPriorShort: fb,
    }
  }
  const prev = previousCalendarMonth(currentYear, currentMonth)
  const crossYear = prev.year !== currentYear
  const curName = monthNameLong(currentYear, currentMonth)
  const prevName = monthNameLong(prev.year, prev.month)
  const currentLabel = crossYear ? `${curName} ${currentYear}` : curName
  const previousLabel = crossYear ? `${prevName} ${prev.year}` : prevName
  return {
    currentLabel,
    previousLabel,
    vsPriorShort: previousLabel,
  }
}

/** Prior period phrase for month narratives (e.g. "March" or "December 2025"). */
export function monthNarrativePriorLabel(
  previousFrom: string,
  currentFrom: string
): string {
  if (previousFrom.length < 10 || currentFrom.length < 10) {
    return MONTH_LABEL_FALLBACK
  }
  const py = parseInt(previousFrom.slice(0, 4), 10)
  const pm = parseInt(previousFrom.slice(5, 7), 10)
  const cy = parseInt(currentFrom.slice(0, 4), 10)
  if (
    !Number.isFinite(py) ||
    !Number.isFinite(pm) ||
    !Number.isFinite(cy) ||
    !isValidCalendarYearMonth(py, pm)
  ) {
    return MONTH_LABEL_FALLBACK
  }
  const name = monthNameLong(py, pm)
  if (name === MONTH_LABEL_FALLBACK) return MONTH_LABEL_FALLBACK
  if (py !== cy) return `${name} ${py}`
  return name
}

/** Prior calendar year for YoY narratives (e.g. "2024"). */
export function yearNarrativePriorLabel(previousFrom: string): string {
  if (previousFrom.length < 4) return MONTH_LABEL_FALLBACK
  const y = parseInt(previousFrom.slice(0, 4), 10)
  if (!Number.isFinite(y)) return MONTH_LABEL_FALLBACK
  return String(y)
}

/** Single date, compact (week picker / legends). */
export function formatWeekStartLabel(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    return MONTH_LABEL_FALLBACK
  }
  try {
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return MONTH_LABEL_FALLBACK
  }
}

/** Prior week phrase for narratives (week containing `previousFrom`). Accepts both "YYYY-MM-DD" and full UTC ISO strings. */
export function weekNarrativePriorLabel(previousFrom: string): string {
  if (previousFrom.length < 10) return MONTH_LABEL_FALLBACK
  const date = previousFrom.includes('T')
    ? new Date(previousFrom)
    : localDateFromYmd(previousFrom)
  if (!date || Number.isNaN(date.getTime())) return MONTH_LABEL_FALLBACK
  return formatWeekStartLabel(date)
}
