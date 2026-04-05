import { describe, expect, it } from 'vitest'
import { meanOfFiniteNumbers } from '@/lib/yearMonthlyChartMetrics'

describe('meanOfFiniteNumbers', () => {
  it('returns null for empty input', () => {
    expect(meanOfFiniteNumbers([])).toBeNull()
  })

  it('returns arithmetic mean', () => {
    expect(meanOfFiniteNumbers([100, 200, 300])).toBe(200)
    expect(meanOfFiniteNumbers([50])).toBe(50)
  })
})
