/**
 * Shared payday types and option lists for onboarding and settings.
 * Stored in app_settings: payday_frequency, payday_day, next_payday.
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

const PAYDAY_DAY_OPTIONS: Record<
  PaydayFrequency,
  { value: number; label: string }[]
> = {
  WEEKLY: PAYDAY_DAYS_WEEKLY,
  FORTNIGHTLY: PAYDAY_DAYS_WEEKLY,
  MONTHLY: PAYDAY_DAYS_MONTHLY,
}

export function getPaydayDayOptions(
  frequency: PaydayFrequency
): { value: number; label: string }[] {
  return PAYDAY_DAY_OPTIONS[frequency]
}

/**
 * Given a reference date (a past payday transaction) and a chosen frequency,
 * derive paydayDay (the stored integer: 1–7 for weekly/fortnightly, 1–28 for monthly)
 * and the next upcoming payday date after today.
 */
export function computeNextPaydayFromReference(
  refDate: string,
  frequency: PaydayFrequency
): { paydayDay: number; nextPayday: string } {
  const ref = new Date(refDate + 'T12:00:00Z')
  const todayStr = new Date().toISOString().slice(0, 10)
  const today = new Date(todayStr + 'T12:00:00Z')

  if (frequency === 'MONTHLY') {
    const day = Math.min(ref.getUTCDate(), 28)
    const next = new Date(today)
    next.setUTCDate(day)
    if (next.toISOString().slice(0, 10) <= todayStr) {
      next.setUTCMonth(next.getUTCMonth() + 1)
      next.setUTCDate(day)
    }
    return { paydayDay: day, nextPayday: next.toISOString().slice(0, 10) }
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
