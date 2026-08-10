import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}))

import {
  getYearMonthlyTotals,
  getYearComparisonPeriods,
  getWeekComparison,
} from './insights'
import { localDateStartUtc, localDateEndUtc } from '@/lib/format'
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
    // Bounds are converted from local calendar dates to UTC instants (see
    // localDateStartUtc/localDateEndUtc) so the query matches the user's
    // local Jan 1 – Dec 31, not UTC Jan 1 – Dec 31.
    expect(stmt.bind).toHaveBeenCalledWith([
      localDateStartUtc('2024-01-01'),
      localDateEndUtc('2024-12-31'),
    ])
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
})

describe('getWeekComparison', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('caps the previous week to the same elapsed-day count as the current in-progress week', () => {
    // 2026-04-15 is a Wednesday: 3 days elapsed in the current week (Mon-Wed).
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15))
    vi.clearAllMocks()

    const bindCalls: unknown[][] = []
    const stmt = {
      bind: (args: unknown[]) => bindCalls.push(args),
      step: () => false,
      get: () => undefined,
      free: () => {},
    }
    vi.mocked(db.getDb).mockReturnValue({ prepare: () => stmt } as never)

    getWeekComparison(0)

    // Expected previous-week bounds: previous Monday at local midnight,
    // capped end = previous Monday + 2 days (3 elapsed days - 1) at local
    // end-of-day — mirrors the production computation.
    const prevMonday = new Date(2026, 3, 6)
    prevMonday.setHours(0, 0, 0, 0)
    const expectedPrevStartIso = prevMonday.toISOString()
    const expectedPrevEnd = new Date(prevMonday)
    expectedPrevEnd.setDate(expectedPrevEnd.getDate() + 2)
    expectedPrevEnd.setHours(23, 59, 59, 999)
    const expectedPrevEndIso = expectedPrevEnd.toISOString()

    const previousBoundCalls = bindCalls.filter(
      (args) => args[0] === expectedPrevStartIso
    )
    expect(previousBoundCalls.length).toBeGreaterThan(0)
    for (const args of previousBoundCalls) {
      expect(args[1]).toBe(expectedPrevEndIso)
    }
  })

  it('does not cap a past (fully elapsed) week', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15))
    vi.clearAllMocks()

    const bindCalls: unknown[][] = []
    const stmt = {
      bind: (args: unknown[]) => bindCalls.push(args),
      step: () => false,
      get: () => undefined,
      free: () => {},
    }
    vi.mocked(db.getDb).mockReturnValue({ prepare: () => stmt } as never)

    // weekOffset -1 compares last week vs the week before — both fully elapsed.
    getWeekComparison(-1)

    const priorMonday = new Date(2026, 2, 30) // 2026-03-30
    priorMonday.setHours(0, 0, 0, 0)
    const expectedPrevStartIso = priorMonday.toISOString()
    const expectedPrevEnd = new Date(priorMonday)
    expectedPrevEnd.setDate(expectedPrevEnd.getDate() + 6)
    expectedPrevEnd.setHours(23, 59, 59, 999)
    const expectedPrevEndIso = expectedPrevEnd.toISOString()

    const previousBoundCalls = bindCalls.filter(
      (args) => args[0] === expectedPrevStartIso
    )
    expect(previousBoundCalls.length).toBeGreaterThan(0)
    for (const args of previousBoundCalls) {
      expect(args[1]).toBe(expectedPrevEndIso)
    }
  })
})
