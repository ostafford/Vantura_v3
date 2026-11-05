import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}))

import {
  getYearMonthlyTotals,
  getYearComparisonPeriods,
  getYearComparison,
  getMonthComparison,
} from './insights'
import * as db from '@/db'

describe('getYearMonthlyTotals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 12 months with zeros when database is unavailable', () => {
    vi.mocked(db.getDb).mockReturnValue(null)
    const result = getYearMonthlyTotals(2024)
    expect(result).toHaveLength(12)
    expect(result.map((p) => p.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ])
    expect(result.every((p) => p.moneyIn === 0 && p.moneyOut === 0)).toBe(true)
  })

  it('merges aggregated rows into the correct months', () => {
    const rows: [number, number, number][] = [
      [1, 10_000, 5_000],
      [3, 2_000, 8_000],
    ]
    let stepIndex = -1
    const stmt = {
      bind: vi.fn(),
      step: () => {
        stepIndex += 1
        return stepIndex < rows.length
      },
      get: () => rows[stepIndex],
      free: vi.fn(),
    }
    vi.mocked(db.getDb).mockReturnValue({
      prepare: () => stmt,
    } as never)

    const result = getYearMonthlyTotals(2024)
    expect(result[0]).toEqual({ month: 1, moneyIn: 10_000, moneyOut: 5_000 })
    expect(result[1]).toEqual({ month: 2, moneyIn: 0, moneyOut: 0 })
    expect(result[2]).toEqual({ month: 3, moneyIn: 2_000, moneyOut: 8_000 })
    // Bounds are local calendar days, compared against each transaction's
    // local display day (#149) — not UTC instants.
    expect(stmt.bind).toHaveBeenCalledWith(['2024-01-01', '2024-12-31'])
  })
})

describe('getYearComparisonPeriods', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses full calendar years for a past year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15))
    const r = getYearComparisonPeriods(2024)
    expect(r.current).toEqual({ from: '2024-01-01', to: '2024-12-31' })
    expect(r.previous).toEqual({ from: '2023-01-01', to: '2023-12-31' })
  })

  it('uses YTD vs prior-year same window for the current calendar year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15))
    const r = getYearComparisonPeriods(2026)
    expect(r.current.from).toBe('2026-01-01')
    expect(r.current.to).toBe('2026-04-15')
    expect(r.previous.from).toBe('2025-01-01')
    expect(r.previous.to).toBe('2025-04-15')
  })

  it('clamps the prior-year YTD end to Feb 28 on a leap-year Feb 29', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2028, 1, 29)) // Feb 29, 2028 — a leap year
    const r = getYearComparisonPeriods(2028)
    expect(r.current.to).toBe('2028-02-29')
    // setFullYear(2027) on a Feb-29 Date normalises to 2027-03-01, which would
    // make the prior-year window a day longer than the current YTD. It must
    // clamp to Feb 28 so both windows span the same elapsed days.
    expect(r.previous.to).toBe('2027-02-28')
  })
})

describe('getYearComparison periodNote', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function mockEmptyDb() {
    const stmt = {
      bind: () => {},
      step: () => false,
      get: () => undefined,
      free: () => {},
    }
    vi.mocked(db.getDb).mockReturnValue({ prepare: () => stmt } as never)
  }

  it('sets a YTD clarifying note for the current, in-progress year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15))
    mockEmptyDb()

    const result = getYearComparison(2026)
    expect(result.periodNote).toBe('Jan 1–Apr 15, 2026 vs Jan 1–Apr 15, 2025')
  })

  it('has no periodNote for a fully-elapsed past year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15))
    mockEmptyDb()

    const result = getYearComparison(2024)
    expect(result.periodNote).toBeUndefined()
  })
})

describe('getMonthComparison', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function mockEmptyDb() {
    const stmt = {
      bind: () => {},
      step: () => false,
      get: () => undefined,
      free: () => {},
    }
    vi.mocked(db.getDb).mockReturnValue({ prepare: () => stmt } as never)
  }

  it('caps the previous month to the same elapsed-day count as the current in-progress month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15)) // Apr 15, 2026
    mockEmptyDb()

    const result = getMonthComparison('2026-04-01', '2026-04-30')
    // 15 days elapsed (Apr 1–15) -> previous month capped to Mar 1–15.
    expect(result.periodNote).toBe('Apr 1–Apr 15 vs Mar 1–Mar 15')
  })

  it("clamps the capped previous end to a shorter previous month's natural length", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 30)) // Mar 30, 2026 (2026 is not a leap year)
    mockEmptyDb()

    const result = getMonthComparison('2026-03-01', '2026-03-31')
    // 30 days elapsed would push the capped end to Mar 2 in a 28-day Feb —
    // clamped back to Feb's actual last day instead.
    expect(result.periodNote).toBe('Mar 1–Mar 30 vs Feb 1–Feb 28')
  })

  it('has no periodNote for a fully-elapsed past month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 1)) // May 1, 2026 — April is over
    mockEmptyDb()

    const result = getMonthComparison('2026-04-01', '2026-04-30')
    expect(result.periodNote).toBeUndefined()
  })
})

describe('elapsed-day maths across a DST transition', () => {
  // Between two local midnights that straddle a spring-forward, real elapsed
  // time is N*24h - 1h, so a flat `msDiff / 86_400_000` floor lands one day
  // short. America/New_York springs forward at 02:00 on 2026-03-08.
  const ORIGINAL_TZ = process.env.TZ

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ
    else process.env.TZ = ORIGINAL_TZ
    vi.useRealTimers()
  })

  function mockEmptyDb() {
    const stmt = {
      bind: () => {},
      step: () => false,
      get: () => undefined,
      free: () => {},
    }
    vi.mocked(db.getDb).mockReturnValue({ prepare: () => stmt } as never)
  }

  it('getMonthComparison counts full elapsed days when a spring-forward falls inside the month', () => {
    process.env.TZ = 'America/New_York'
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 20, 12)) // Mar 20, 2026 — after the Mar 8 transition
    mockEmptyDb()

    const result = getMonthComparison('2026-03-01', '2026-03-31')
    // 20 elapsed days (Mar 1–20) -> previous month capped to Feb 1–20.
    // A flat 24h divide would floor to 19 and cap to Feb 1–19.
    expect(result.periodNote).toBe('Mar 1–Mar 20 vs Feb 1–Feb 20')
  })
})
