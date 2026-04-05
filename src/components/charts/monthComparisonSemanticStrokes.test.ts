import { describe, expect, it } from 'vitest'
import { getYearMonthlySemanticStrokes } from './monthComparisonSemanticStrokes'

describe('getYearMonthlySemanticStrokes', () => {
  it('returns null when there are no months', () => {
    expect(getYearMonthlySemanticStrokes([], [], 'spending')).toBeNull()
  })

  it('uses YTD sums over the parallel months for spending (lower is good)', () => {
    const curLower = [100, 100, 100]
    const prevHigher = [100, 100, 200]
    const better = getYearMonthlySemanticStrokes(
      curLower,
      prevHigher,
      'spending'
    )
    expect(better).not.toBeNull()
    expect(better!.currentStroke).not.toBe(better!.previousStroke)

    const curHigher = [100, 100, 200]
    const prevLower = [100, 100, 100]
    const worse = getYearMonthlySemanticStrokes(
      curHigher,
      prevLower,
      'spending'
    )
    expect(worse).not.toBeNull()
    expect(worse!.currentStroke).not.toBe(worse!.previousStroke)
    expect(worse!.currentStroke).toBe(better!.previousStroke)
    expect(worse!.previousStroke).toBe(better!.currentStroke)
  })

  it('uses YTD sums for income (higher is good)', () => {
    const cur = [50, 50]
    const prev = [40, 40]
    const r = getYearMonthlySemanticStrokes(cur, prev, 'income')
    expect(r).not.toBeNull()
    expect(r!.currentStroke).not.toBe(r!.previousStroke)
  })
})
