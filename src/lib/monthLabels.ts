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
): { currentLabel: string; previousLabel: string } {
  if (!isValidCalendarYearMonth(currentYear, currentMonth)) {
    const fb = MONTH_LABEL_FALLBACK
    return { currentLabel: fb, previousLabel: fb }
  }
  const prev = previousCalendarMonth(currentYear, currentMonth)
  const crossYear = prev.year !== currentYear
  const curName = monthNameLong(currentYear, currentMonth)
  const prevName = monthNameLong(prev.year, prev.month)
  const currentLabel = crossYear ? `${curName} ${currentYear}` : curName
  const previousLabel = crossYear ? `${prevName} ${prev.year}` : prevName
  return { currentLabel, previousLabel }
}
