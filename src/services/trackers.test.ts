import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => null,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  schedulePersist: () => {},
}))

const {
  __test__,
  getPeriodBoundsForOffset,
  getTrackersDisplayPeriodData,
  isValidTrackerResetDay,
  resetDayForFrequency,
  createTracker,
  updateTracker,
} = await import('./trackers')
const { toPeriodCents } = await import('@/lib/monthlyEquivalent')
const { formatShortDate } = await import('@/lib/format')

type ProgressRow = import('./trackers').TrackerWithProgress

function makeProgressRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: 1,
    name: 'Groceries',
    budget_amount: 40000,
    reset_frequency: 'MONTHLY',
    reset_day: 1,
    last_reset_date: '2026-03-01',
    next_reset_date: '2026-04-01',
    bucket_id: null,
    spent: 10000,
    effectiveBudget: 40000,
    remaining: 30000,
    daysLeft: 12,
    progress: 25,
    wasAdjustedThisPeriod: false,
    period_start: '2026-03-01',
    period_end: '2026-04-01',
    ...overrides,
  }
}
const { daysBetween, stepBackOnePeriod, getLastResetDate, getNextResetDate } =
  __test__

function makeTrackerRow(
  overrides: Partial<import('./trackers').TrackerRow> = {}
): import('./trackers').TrackerRow {
  return {
    id: 1,
    name: 'Groceries',
    budget_amount: 40000,
    reset_frequency: 'MONTHLY',
    reset_day: 1,
    last_reset_date: '2026-03-01',
    next_reset_date: '2026-04-01',
    ...overrides,
  }
}

beforeEach(() => {
  for (const key of Object.keys(appSettings)) delete appSettings[key]
})

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2026-03-10', '2026-03-10')).toBe(0)
  })

  it('returns positive count when b is after a', () => {
    expect(daysBetween('2026-03-10', '2026-03-17')).toBe(7)
  })

  it('normalizes timestamps with time components', () => {
    expect(daysBetween('2026-03-10T00:00:00Z', '2026-03-17T23:59:00Z')).toBe(7)
  })
})

describe('getLastResetDate', () => {
  it('WEEKLY finds the most recent occurrence of reset_day on or before fromDate', () => {
    // 2026-03-11 is a Wednesday. reset_day=1 (Monday) → last Monday is 2026-03-09.
    expect(getLastResetDate('WEEKLY', 1, '2026-03-11')).toBe('2026-03-09')
  })

  it('WEEKLY when fromDate itself is the reset day returns fromDate', () => {
    // 2026-03-09 is a Monday.
    expect(getLastResetDate('WEEKLY', 1, '2026-03-09')).toBe('2026-03-09')
  })

  it('MONTHLY uses current month reset_day when day-of-month has reached it', () => {
    expect(getLastResetDate('MONTHLY', 5, '2026-03-10')).toBe('2026-03-05')
  })

  it('MONTHLY falls back to previous month reset_day when day-of-month has not reached it, using UTC month arithmetic', () => {
    // Before the 5th in March → previous period started Feb 5.
    expect(getLastResetDate('MONTHLY', 5, '2026-03-03')).toBe('2026-02-05')
  })

  it('MONTHLY rolls back across a year boundary correctly', () => {
    expect(getLastResetDate('MONTHLY', 15, '2026-01-03')).toBe('2025-12-15')
  })
})

describe('getNextResetDate', () => {
  it('WEEKLY steps forward to the next occurrence of reset_day, never returning the same date', () => {
    // 2026-03-09 is a Monday; reset_day=1 (Monday) → next Monday is 7 days later.
    expect(getNextResetDate('WEEKLY', 1, '2026-03-09')).toBe('2026-03-16')
  })

  it('FORTNIGHTLY adds exactly 14 days', () => {
    expect(getNextResetDate('FORTNIGHTLY', 1, '2026-03-09')).toBe('2026-03-23')
  })

  it('MONTHLY advances one UTC month and sets reset_day', () => {
    expect(getNextResetDate('MONTHLY', 5, '2026-03-10')).toBe('2026-04-05')
  })

  it('MONTHLY rolls forward across a year boundary correctly', () => {
    expect(getNextResetDate('MONTHLY', 15, '2026-12-20')).toBe('2027-01-15')
  })
})

describe('stepBackOnePeriod', () => {
  it('WEEKLY steps back 7 days', () => {
    expect(stepBackOnePeriod('WEEKLY', null, '2026-03-15')).toBe('2026-03-08')
  })

  it('FORTNIGHTLY steps back 14 days', () => {
    expect(stepBackOnePeriod('FORTNIGHTLY', null, '2026-03-15')).toBe(
      '2026-03-01'
    )
  })

  it('MONTHLY steps back one UTC month and applies reset_day', () => {
    expect(stepBackOnePeriod('MONTHLY', 10, '2026-03-15')).toBe('2026-02-10')
  })

  it('MONTHLY defaults to day 1 when reset_day is out of the valid 1-28 range', () => {
    expect(stepBackOnePeriod('MONTHLY', null, '2026-03-15')).toBe('2026-02-01')
  })
})

describe('getPeriodBoundsForOffset', () => {
  it('offset 0 returns the tracker row’s stored last_reset_date/next_reset_date as-is', () => {
    const row = makeTrackerRow({
      last_reset_date: '2026-03-01',
      next_reset_date: '2026-04-01',
    })
    expect(getPeriodBoundsForOffset(row, 0)).toEqual({
      periodStart: '2026-03-01',
      periodEnd: '2026-04-01',
    })
  })

  it('offset -1 returns the single period immediately before the current one', () => {
    const row = makeTrackerRow({
      reset_frequency: 'MONTHLY',
      reset_day: 1,
      last_reset_date: '2026-03-01',
      next_reset_date: '2026-04-01',
    })
    expect(getPeriodBoundsForOffset(row, -1)).toEqual({
      periodStart: '2026-02-01',
      periodEnd: '2026-03-01',
    })
  })

  it('offset -3 walks back three whole periods for a WEEKLY tracker', () => {
    const row = makeTrackerRow({
      reset_frequency: 'WEEKLY',
      reset_day: 1,
      last_reset_date: '2026-03-09',
      next_reset_date: '2026-03-16',
    })
    expect(getPeriodBoundsForOffset(row, -3)).toEqual({
      periodStart: '2026-02-16',
      periodEnd: '2026-02-23',
    })
  })

  it('positive offsets are rejected (no future periods)', () => {
    const row = makeTrackerRow()
    expect(getPeriodBoundsForOffset(row, 1)).toBeNull()
  })
})

describe('getTrackersDisplayPeriodData', () => {
  // A fixed local mid-month, mid-year "now", so no assertion can straddle a
  // month or year rollover while the test runs.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes a native-period tracker through with its own figures (#16-aware)', () => {
    const t = makeProgressRow({
      reset_frequency: 'MONTHLY',
      spent: 12000,
      effectiveBudget: 36000, // prorated by a mid-period config change
      daysLeft: 9,
      wasAdjustedThisPeriod: true,
      period_start: '2026-03-01',
      period_end: '2026-04-01',
    })
    const d = getTrackersDisplayPeriodData([t], 'MONTHLY')[1]
    expect(d).toEqual({
      spent: 12000,
      budget: 36000,
      remaining: 24000,
      progress: (12000 / 36000) * 100,
      daysLeft: 9,
      dateRangeLabel: `${formatShortDate('2026-03-01')} – ${formatShortDate('2026-03-31')}`,
      wasAdjusted: true,
      isNativePeriod: true,
    })
  })

  it('treats WEEKLY display + WEEKLY tracker as native', () => {
    const t = makeProgressRow({ reset_frequency: 'WEEKLY' })
    expect(getTrackersDisplayPeriodData([t], 'WEEKLY')[1].isNativePeriod).toBe(
      true
    )
  })

  it('re-scales the budget with toPeriodCents when the period is non-native', () => {
    const t = makeProgressRow({
      reset_frequency: 'WEEKLY',
      budget_amount: 20000,
    })
    const d = getTrackersDisplayPeriodData([t], 'MONTHLY')[1]
    expect(d.isNativePeriod).toBe(false)
    expect(d.budget).toBe(toPeriodCents(20000, 'WEEKLY', 'MONTHLY'))
    // no DB in this suite → spent re-sums to 0 for the non-native branch
    expect(d.spent).toBe(0)
    expect(d.remaining).toBe(d.budget)
    expect(d.progress).toBe(0)
    expect(d.dateRangeLabel).toBe(
      `${formatShortDate('2026-06-01')} – ${formatShortDate('2026-06-30')}`
    )
  })

  it('labels a non-native YEARLY period with the bare year', () => {
    const t = makeProgressRow({ reset_frequency: 'MONTHLY' })
    const d = getTrackersDisplayPeriodData([t], 'YEARLY')[1]
    expect(d.isNativePeriod).toBe(false)
    // the non-native branch anchors on the local calendar date
    expect(d.dateRangeLabel).toBe('2026')
  })

  it('threads one consistent local "today" through non-native bounds and daysLeft (#52)', () => {
    const originalTz = process.env.TZ
    // UTC+11 in March (Australian daylight saving) — every Up Bank customer is
    // on an AU offset.
    process.env.TZ = 'Australia/Sydney'
    vi.useFakeTimers()
    // 2026-03-31 14:00 UTC == 2026-04-01 01:00 in Sydney: UTC is still on
    // March, the local calendar has already rolled into April.
    vi.setSystemTime(new Date('2026-03-31T14:00:00Z'))
    try {
      const t = makeProgressRow({ reset_frequency: 'WEEKLY' })
      const d = getTrackersDisplayPeriodData([t], 'MONTHLY')[1]
      // Local "today" is 1 Apr, so the display period is the whole of April:
      // 30 days left and an April label — not the "1 Mar – 31 Mar · 0 days
      // left" mismatch a UTC "today" against local-derived bounds produces.
      expect(d.daysLeft).toBe(30)
      expect(d.dateRangeLabel).toBe(
        `${formatShortDate('2026-04-01')} – ${formatShortDate('2026-04-30')}`
      )
    } finally {
      vi.useRealTimers()
      process.env.TZ = originalTz
    }
  })

  it('guards against a zero budget', () => {
    const t = makeProgressRow({
      reset_frequency: 'MONTHLY',
      effectiveBudget: 0,
      spent: 5000,
    })
    const d = getTrackersDisplayPeriodData([t], 'MONTHLY')[1]
    expect(d.progress).toBe(0)
    expect(d.remaining).toBe(0)
  })

  it('yields an empty label for a native period with no period bounds', () => {
    const t = makeProgressRow({
      reset_frequency: 'MONTHLY',
      period_start: undefined,
      period_end: undefined,
    })
    expect(getTrackersDisplayPeriodData([t], 'MONTHLY')[1].dateRangeLabel).toBe(
      ''
    )
  })

  it('keys the result by tracker id', () => {
    const rows = [
      makeProgressRow({ id: 7, reset_frequency: 'WEEKLY' }),
      makeProgressRow({ id: 9, reset_frequency: 'MONTHLY' }),
    ]
    const out = getTrackersDisplayPeriodData(rows, 'MONTHLY')
    expect(Object.keys(out).sort()).toEqual(['7', '9'])
    expect(out[7].isNativePeriod).toBe(false)
    expect(out[9].isNativePeriod).toBe(true)
  })
})

describe('tracker reset_day validation (#150)', () => {
  it.each([
    ['WEEKLY', 1],
    ['WEEKLY', 7],
    ['FORTNIGHTLY', 4],
    ['MONTHLY', 1],
    ['MONTHLY', 28],
  ])('%s with reset_day %s is valid', (frequency, day) => {
    expect(isValidTrackerResetDay(frequency, day)).toBe(true)
  })

  it.each([
    ['WEEKLY', 0],
    ['WEEKLY', 8],
    ['FORTNIGHTLY', null],
    ['MONTHLY', 29],
    ['MONTHLY', 31],
    ['MONTHLY', 0],
    ['MONTHLY', 1.5],
    ['MONTHLY', null],
    ['PAYDAY', null],
    ['PAYDAY', 1],
    ['PAYDAY', 28],
    ['YEARLY', 1],
  ])('%s with reset_day %s is invalid', (frequency, day) => {
    expect(isValidTrackerResetDay(frequency, day)).toBe(false)
  })

  it('createTracker refuses a MONTHLY reset_day past 28', () => {
    expect(() => createTracker('Food', 30000, 'MONTHLY', 31, [])).toThrow(
      'INVALID_RESET_DAY'
    )
  })

  it('updateTracker refuses a WEEKLY reset_day outside 1–7', () => {
    expect(() => updateTracker(1, 'Food', 30000, 'WEEKLY', 8, [])).toThrow(
      'INVALID_RESET_DAY'
    )
  })
})

describe('PAYDAY reset frequency is gone (#192)', () => {
  it('createTracker refuses a PAYDAY tracker', () => {
    expect(() =>
      createTracker('Food', 30000, 'PAYDAY' as never, 1, [])
    ).toThrow('INVALID_RESET_FREQUENCY')
  })

  it('updateTracker refuses a PAYDAY tracker', () => {
    expect(() =>
      updateTracker(1, 'Food', 30000, 'PAYDAY' as never, 1, [])
    ).toThrow('INVALID_RESET_FREQUENCY')
  })
})

describe('resetDayForFrequency: the form holds what the dropdown shows (#150)', () => {
  it('keeps a day that is valid for the new frequency', () => {
    expect(resetDayForFrequency('WEEKLY', 5)).toBe(5)
    expect(resetDayForFrequency('MONTHLY', 5)).toBe(5)
  })

  it('falls back to 1 when the day is not an option for the new frequency', () => {
    expect(resetDayForFrequency('WEEKLY', 15)).toBe(1) // Monthly 15 → Weekly
    expect(resetDayForFrequency('MONTHLY', 31)).toBe(1)
    expect(resetDayForFrequency('WEEKLY', null)).toBe(1)
  })
})
