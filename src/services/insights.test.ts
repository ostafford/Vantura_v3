import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}))

import { getYearMonthlyTotals, getYearComparisonPeriods } from './insights'
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
    expect(stmt.bind).toHaveBeenCalledWith([
      '2024-01-01',
      '2024-12-31T23:59:59.999Z',
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
