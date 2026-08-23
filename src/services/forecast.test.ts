import { describe, it, expect } from 'vitest'
import { calculateForecastSpendable } from './forecast'

describe('calculateForecastSpendable', () => {
  it('returns spendableNow unchanged when there are no trackers', () => {
    expect(calculateForecastSpendable(10000, [])).toBe(10000)
  })

  it("subtracts a single tracker's remaining budget from spendableNow", () => {
    expect(calculateForecastSpendable(10000, [{ remaining: 3000 }])).toBe(7000)
  })

  it('sums remaining budget across multiple trackers', () => {
    expect(
      calculateForecastSpendable(10000, [
        { remaining: 3000 },
        { remaining: 1500 },
        { remaining: 500 },
      ])
    ).toBe(5000)
  })

  it('returns a negative forecast when total remaining budget exceeds spendableNow', () => {
    expect(calculateForecastSpendable(2000, [{ remaining: 5000 }])).toBe(-3000)
  })
})
