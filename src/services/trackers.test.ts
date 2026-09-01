import { describe, expect, it, vi, beforeEach } from 'vitest'

const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => null,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  schedulePersist: () => {},
}))

const {
  __test__,
  getPeriodBoundsForOffset,
  calculatePaydayBudgetTotal,
  getTrackersDisplayPeriodData,
} = await import('./trackers')
const { toPeriodCents } = await import('@/lib/monthlyEquivalent')
const { formatShortDate } = await import('@/lib/format')
const { calendarPeriodBounds } = await import('@/lib/dateStr')

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
  // Full edge-case coverage of the underlying math (WEEKLY/FORTNIGHTLY/MONTHLY,
  // including the "last weekday" day-31 regression) lives in payday.test.ts
  // against previousPaydayDate() directly. These only prove this wrapper reads
  // app_settings (parsing payday_day, defaulting to 1 when unset) correctly.
  it('returns null when payday_frequency is not configured', () => {
    expect(getPreviousPaydayDate('2026-03-15')).toBeNull()
  })

  it('reads app_settings and delegates to payday.ts for the math', () => {
    appSettings.payday_frequency = 'MONTHLY'
    appSettings.payday_day = '100'
    expect(getPreviousPaydayDate('2026-03-31')).toBe('2026-02-27')
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

describe('calculatePaydayBudgetTotal', () => {
  it('returns 0 when there are no trackers', () => {
    expect(calculatePaydayBudgetTotal([])).toBe(0)
  })

  it('sums budget_amount across PAYDAY-frequency trackers only', () => {
    const trackers = [
      { id: 1, reset_frequency: 'PAYDAY', budget_amount: 10000 },
      { id: 2, reset_frequency: 'MONTHLY', budget_amount: 5000 },
      { id: 3, reset_frequency: 'PAYDAY', budget_amount: 2500 },
    ]
    expect(calculatePaydayBudgetTotal(trackers)).toBe(12500)
  })

  it('returns 0 when no trackers are PAYDAY-frequency', () => {
    const trackers = [
      { id: 1, reset_frequency: 'WEEKLY', budget_amount: 10000 },
      { id: 2, reset_frequency: 'MONTHLY', budget_amount: 5000 },
    ]
    expect(calculatePaydayBudgetTotal(trackers)).toBe(0)
  })

  it('excludes the tracker matching excludeId from the total', () => {
    const trackers = [
      { id: 1, reset_frequency: 'PAYDAY', budget_amount: 10000 },
      { id: 2, reset_frequency: 'PAYDAY', budget_amount: 2500 },
    ]
    expect(calculatePaydayBudgetTotal(trackers, 1)).toBe(2500)
  })

  it('excludeId that matches no tracker leaves the total unchanged', () => {
    const trackers = [
      { id: 1, reset_frequency: 'PAYDAY', budget_amount: 10000 },
    ]
    expect(calculatePaydayBudgetTotal(trackers, 999)).toBe(10000)
  })
})

describe('getTrackersDisplayPeriodData', () => {
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
    const bounds = calendarPeriodBounds('MONTHLY')
    expect(d.dateRangeLabel).toContain(' – ')
    expect(d.dateRangeLabel.startsWith(formatShortDate(bounds.from))).toBe(true)
  })

  it('labels a non-native YEARLY period with the bare year', () => {
    const t = makeProgressRow({ reset_frequency: 'MONTHLY' })
    const d = getTrackersDisplayPeriodData([t], 'YEARLY')[1]
    expect(d.isNativePeriod).toBe(false)
    expect(d.dateRangeLabel).toBe(String(new Date().getUTCFullYear()))
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
