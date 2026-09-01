import { describe, expect, it, vi } from 'vitest'

vi.mock('@/db', () => ({
  getDb: () => null,
  getAppSetting: () => null,
  schedulePersist: () => {},
}))

const { buildCalendarPeriodHistory } = await import('./trackerPeriodHistory')
const { toPeriodCents } = await import('@/lib/monthlyEquivalent')

describe('buildCalendarPeriodHistory', () => {
  it('returns one row per period, newest (offset 0) last, budget scaled to the display period', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'))
    try {
      const rows = buildCalendarPeriodHistory(1, 'MONTHLY', 3, 20000, 'WEEKLY')
      expect(rows.map((r) => r.periodOffset)).toEqual([-2, -1, 0])
      expect(rows.map((r) => r.periodLabel)).toEqual([
        '2 months ago',
        'Previous',
        'Current',
      ])
      expect(rows[2].periodStart).toBe('2026-05-01')
      expect(rows[2].periodEnd).toBe('2026-06-01')
      expect(rows[2].budget).toBe(toPeriodCents(20000, 'WEEKLY', 'MONTHLY'))
      // no DB in this suite → spend re-sums to 0
      expect(rows[2].spent).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('anchors the current period on the local calendar date, not UTC (#56)', () => {
    const originalTz = process.env.TZ
    // UTC+11 in March (Australian daylight saving) — every Up Bank customer
    // is on an AU offset.
    process.env.TZ = 'Australia/Sydney'
    vi.useFakeTimers()
    // 2026-03-31 14:00 UTC == 2026-04-01 01:00 in Sydney: UTC is still on
    // 31 March, the local calendar has already rolled into April.
    vi.setSystemTime(new Date('2026-03-31T14:00:00Z'))
    try {
      const rows = buildCalendarPeriodHistory(1, 'MONTHLY', 2, 40000, 'MONTHLY')
      const current = rows.find((r) => r.periodOffset === 0)!
      const previous = rows.find((r) => r.periodOffset === -1)!
      // Local "today" is 1 Apr, so April is "Current" — not March, which a
      // raw UTC `new Date()` would still report at this instant.
      expect(current.periodStart).toBe('2026-04-01')
      expect(current.periodEnd).toBe('2026-05-01')
      expect(previous.periodStart).toBe('2026-03-01')
      expect(previous.periodEnd).toBe('2026-04-01')
    } finally {
      vi.useRealTimers()
      process.env.TZ = originalTz
    }
  })
})
