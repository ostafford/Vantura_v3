/**
 * Shared payday types and option lists for onboarding and settings.
 * Stored in app_settings: payday_frequency, payday_day, next_payday.
 *
 * Monthly "last weekday" rules use special payday_day codes:
 *   100 = last business day of the month (whatever weekday it falls on)
 *   101 = last Monday … 105 = last Friday (fixed weekday each month)
 * For codes 101–105: ISO weekday = code − 100. JS getUTCDay() is identical for Mon–Fri.
 */

export type PaydayFrequency = 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY'

export const PAYDAY_DAYS_WEEKLY: { value: number; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

export const PAYDAY_DAYS_MONTHLY = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`,
}))

// Code 100 = last business day of the month.
// Codes 101–105 = last Mon–Fri respectively (isoWeekday = code − 100).
export const PAYDAY_DAYS_MONTHLY_LAST_WEEKDAY: {
  value: number
  label: string
}[] = [
  { value: 100, label: 'Last weekday' },
  { value: 101, label: 'Last Monday' },
  { value: 102, label: 'Last Tuesday' },
  { value: 103, label: 'Last Wednesday' },
  { value: 104, label: 'Last Thursday' },
  { value: 105, label: 'Last Friday' },
]

const PAYDAY_DAY_OPTIONS: Record<
  PaydayFrequency,
  { value: number; label: string }[]
> = {
  WEEKLY: PAYDAY_DAYS_WEEKLY,
  FORTNIGHTLY: PAYDAY_DAYS_WEEKLY,
  MONTHLY: [...PAYDAY_DAYS_MONTHLY, ...PAYDAY_DAYS_MONTHLY_LAST_WEEKDAY],
}

export function getPaydayDayOptions(
  frequency: PaydayFrequency
): { value: number; label: string }[] {
  return PAYDAY_DAY_OPTIONS[frequency]
}

/** Returns a human-readable label for a stored payday_day value. */
export function getPaydayDayLabel(
  frequency: string,
  paydayDay: number
): string {
  if (
    frequency !== 'WEEKLY' &&
    frequency !== 'FORTNIGHTLY' &&
    frequency !== 'MONTHLY'
  ) {
    return String(paydayDay)
  }
  const options = getPaydayDayOptions(frequency as PaydayFrequency)
  return options.find((o) => o.value === paydayDay)?.label ?? String(paydayDay)
}

/** True if paydayDay is a relative monthly rule (100 = last weekday, 101–105 = last Mon–Fri). */
export function isMonthlyLastWeekday(paydayDay: number): boolean {
  return paydayDay >= 100 && paydayDay <= 105
}

/**
 * Returns the last business day (Mon–Fri) of the given year/month (0-based month).
 * If the last calendar day is Saturday, returns Friday (−1). If Sunday, returns Friday (−2).
 */
export function lastBusinessDayOfMonth(year: number, month: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)) // day 0 of next month = last day
  const dow = lastDay.getUTCDay() // 0=Sun, 6=Sat
  const result = new Date(lastDay)
  if (dow === 0)
    result.setUTCDate(lastDay.getUTCDate() - 2) // Sunday → Friday
  else if (dow === 6) result.setUTCDate(lastDay.getUTCDate() - 1) // Saturday → Friday
  return result
}

/**
 * Returns the date of the last occurrence of isoWeekday (1=Mon…7=Sun)
 * in the given year/month (0-based month).
 *
 * Algorithm: walk back from the last calendar day to the target weekday.
 */
export function lastWeekdayOfMonth(
  year: number,
  month: number,
  isoWeekday: number
): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0))
  const lastDow = lastDay.getUTCDay() // JS: 0=Sun…6=Sat
  const targetDow = isoWeekday === 7 ? 0 : isoWeekday // ISO 7=Sun → JS 0; Mon–Fri same in both
  let diff = lastDow - targetDow
  if (diff < 0) diff += 7
  const result = new Date(lastDay)
  result.setUTCDate(lastDay.getUTCDate() - diff)
  return result
}

/**
 * Computes the payday date for a given relative rule code and year/month.
 *   100 → last business day of the month
 *   101–105 → last Mon–Fri of the month
 */
export function monthlyPaydayDate(
  paydayDay: number,
  year: number,
  month: number
): Date {
  if (paydayDay === 100) return lastBusinessDayOfMonth(year, month)
  return lastWeekdayOfMonth(year, month, paydayDay - 100) // 101→Mon(1)…105→Fri(5)
}

/**
 * Given a relative payday_day code (100–105) and today as YYYY-MM-DD,
 * returns the next upcoming occurrence as YYYY-MM-DD.
 * Returns this month's date if it is strictly in the future; otherwise next month's.
 */
export function computeNextMonthlyLastWeekday(
  paydayDay: number,
  todayStr: string
): string {
  const today = new Date(todayStr + 'T12:00:00Z')
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()

  const thisMonthOccurrence = monthlyPaydayDate(paydayDay, year, month)
  if (thisMonthOccurrence.toISOString().slice(0, 10) > todayStr) {
    return thisMonthOccurrence.toISOString().slice(0, 10)
  }

  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1))
  return monthlyPaydayDate(
    paydayDay,
    nextMonthStart.getUTCFullYear(),
    nextMonthStart.getUTCMonth()
  )
    .toISOString()
    .slice(0, 10)
}

/**
 * Given a reference date (a past payday transaction) and a chosen frequency,
 * derive paydayDay and the next upcoming payday date after today.
 *
 * For MONTHLY, days 29–31 on a weekday are auto-detected:
 *   - If the reference date IS the last business day of its month → code 100 (last weekday)
 *   - Otherwise → code 100 + JS weekday (101–105, last specific weekday each month)
 * Days ≤ 28 remain as fixed day-of-month (1–28).
 */
export function computeNextPaydayFromReference(
  refDate: string,
  frequency: PaydayFrequency
): { paydayDay: number; nextPayday: string } {
  const ref = new Date(refDate + 'T12:00:00Z')
  const dt = new Date()
  const todayStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  const today = new Date(todayStr + 'T12:00:00Z')

  if (frequency === 'MONTHLY') {
    const day = ref.getUTCDate()
    const refJsDow = ref.getUTCDay() // 0=Sun, 1=Mon…5=Fri, 6=Sat

    // Days 29–31 on a weekday: auto-detect the monthly rule.
    if (day > 28 && refJsDow >= 1 && refJsDow <= 5) {
      const lastBizDay = lastBusinessDayOfMonth(
        ref.getUTCFullYear(),
        ref.getUTCMonth()
      )
      // If this date IS the last business day of the month → "Last weekday" rule (code 100).
      // Otherwise it is the last occurrence of a specific weekday → code 101–105.
      const paydayDay = lastBizDay.getUTCDate() === day ? 100 : 100 + refJsDow
      const nextPayday = computeNextMonthlyLastWeekday(paydayDay, todayStr)
      return { paydayDay, nextPayday }
    }

    // Fixed day-of-month (1–28).
    const paydayDay = Math.min(day, 28)
    const next = new Date(today)
    next.setUTCDate(paydayDay)
    if (next.toISOString().slice(0, 10) <= todayStr) {
      next.setUTCMonth(next.getUTCMonth() + 1)
      next.setUTCDate(paydayDay)
    }
    return { paydayDay, nextPayday: next.toISOString().slice(0, 10) }
  }

  if (frequency === 'WEEKLY') {
    const refWeekday = ref.getUTCDay()
    const paydayDay = refWeekday === 0 ? 7 : refWeekday
    const todayWeekday = today.getUTCDay()
    const daysUntil = (refWeekday - todayWeekday + 7) % 7 || 7
    const next = new Date(today)
    next.setUTCDate(next.getUTCDate() + daysUntil)
    return { paydayDay, nextPayday: next.toISOString().slice(0, 10) }
  }

  // FORTNIGHTLY: align to the reference date's 14-day cadence
  const refWeekday = ref.getUTCDay()
  const paydayDay = refWeekday === 0 ? 7 : refWeekday
  const daysSinceRef = Math.floor(
    (today.getTime() - ref.getTime()) / (24 * 60 * 60 * 1000)
  )
  const periodsSince = Math.max(0, Math.floor(daysSinceRef / 14))
  const next = new Date(ref)
  next.setUTCDate(next.getUTCDate() + 14 * (periodsSince + 1))
  if (next.toISOString().slice(0, 10) <= todayStr) {
    next.setUTCDate(next.getUTCDate() + 14)
  }
  return { paydayDay, nextPayday: next.toISOString().slice(0, 10) }
}

/**
 * The payday date immediately before fromDate, for a configured frequency/paydayDay.
 * fromDate is typically next_payday or a tracker's period-end/reset date — this function
 * doesn't care which, it just steps back one payday cadence from whatever date it's given.
 */
export function previousPaydayDate(
  fromDate: string,
  frequency: PaydayFrequency,
  paydayDay: number
): string {
  const from = new Date(fromDate + 'T12:00:00Z')

  if (frequency === 'WEEKLY') {
    const prev = new Date(from)
    prev.setUTCDate(prev.getUTCDate() - 7)
    return prev.toISOString().slice(0, 10)
  }

  if (frequency === 'FORTNIGHTLY') {
    const prev = new Date(from)
    prev.setUTCDate(prev.getUTCDate() - 14)
    return prev.toISOString().slice(0, 10)
  }

  // MONTHLY
  if (isMonthlyLastWeekday(paydayDay)) {
    let targetYear = from.getUTCFullYear()
    let targetMonth = from.getUTCMonth() - 1
    if (targetMonth < 0) {
      targetMonth = 11
      targetYear -= 1
    }
    return monthlyPaydayDate(paydayDay, targetYear, targetMonth)
      .toISOString()
      .slice(0, 10)
  }
  const prev = new Date(from)
  prev.setUTCMonth(prev.getUTCMonth() - 1)
  if (paydayDay >= 1 && paydayDay <= 28) prev.setUTCDate(paydayDay)
  return prev.toISOString().slice(0, 10)
}
