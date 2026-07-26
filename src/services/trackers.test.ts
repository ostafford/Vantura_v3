import { describe, expect, it, vi, beforeEach } from 'vitest'

const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => null,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  schedulePersist: () => {},
}))

const { __test__, getPeriodBoundsForOffset } = await import('./trackers')
const {
  daysBetween,
  stepBackOnePeriod,
  getPreviousPaydayDate,
  getLastResetDate,
  getNextResetDate,
} = __test__

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
  it('PAYDAY returns fromDate unchanged', () => {
    expect(getLastResetDate('PAYDAY', 1, '2026-03-15')).toBe('2026-03-15')
  })

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
  it('PAYDAY reads next_payday from app settings', () => {
    appSettings.next_payday = '2026-04-01'
    expect(getNextResetDate('PAYDAY', 1, '2026-03-15')).toBe('2026-04-01')
  })

  it('PAYDAY falls back to fromDate when next_payday is not configured', () => {
    expect(getNextResetDate('PAYDAY', 1, '2026-03-15')).toBe('2026-03-15')
  })

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

describe('getPreviousPaydayDate', () => {
  it('returns null when payday_frequency is not configured', () => {
    expect(getPreviousPaydayDate('2026-03-15')).toBeNull()
  })

  it('WEEKLY steps back 7 days', () => {
    appSettings.payday_frequency = 'WEEKLY'
    appSettings.payday_day = '1'
    expect(getPreviousPaydayDate('2026-03-15')).toBe('2026-03-08')
  })

  it('FORTNIGHTLY steps back 14 days', () => {
    appSettings.payday_frequency = 'FORTNIGHTLY'
    appSettings.payday_day = '1'
    expect(getPreviousPaydayDate('2026-03-15')).toBe('2026-03-01')
  })

  it('MONTHLY with a fixed day-of-month steps back one UTC month', () => {
    appSettings.payday_frequency = 'MONTHLY'
    appSettings.payday_day = '15'
    expect(getPreviousPaydayDate('2026-03-20')).toBe('2026-02-15')
  })

  it('MONTHLY with "last business day" rule (code 100) resolves to the previous month’s last business day', () => {
    appSettings.payday_frequency = 'MONTHLY'
    appSettings.payday_day = '100'
    // Previous month of March 2026 is February 2026; Feb 28 2026 is a Saturday → last business day is Feb 27.
    expect(getPreviousPaydayDate('2026-03-15')).toBe('2026-02-27')
  })

  it('MONTHLY with "last Friday" rule (code 105) resolves correctly across the month rollback', () => {
    appSettings.payday_frequency = 'MONTHLY'
    appSettings.payday_day = '105'
    // Last Friday of February 2026 is Feb 27.
    expect(getPreviousPaydayDate('2026-03-15')).toBe('2026-02-27')
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

  it('PAYDAY delegates to getPreviousPaydayDate using app settings', () => {
    appSettings.payday_frequency = 'MONTHLY'
    appSettings.payday_day = '15'
    expect(stepBackOnePeriod('PAYDAY', null, '2026-03-15')).toBe('2026-02-15')
  })

  it('PAYDAY falls back to periodEnd when previous payday cannot be determined', () => {
    expect(stepBackOnePeriod('PAYDAY', null, '2026-03-15')).toBe('2026-03-15')
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

  it('PAYDAY tracker walks back correctly using payday settings', () => {
    appSettings.payday_frequency = 'FORTNIGHTLY'
    appSettings.payday_day = '1'
    const row = makeTrackerRow({
      reset_frequency: 'PAYDAY',
      reset_day: null,
      last_reset_date: '2026-03-01',
      next_reset_date: '2026-03-15',
    })
    expect(getPeriodBoundsForOffset(row, -1)).toEqual({
      periodStart: '2026-02-15',
      periodEnd: '2026-03-01',
    })
  })
})
