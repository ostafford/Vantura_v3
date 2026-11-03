import { describe, expect, it } from 'vitest'
import { changePercent, sharesOfTotal } from '@/lib/spendingPercent'

describe('changePercent', () => {
  it('is the rounded size of the change against a positive base', () => {
    expect(changePercent(150, 100)).toBe(50)
    expect(changePercent(50, 100)).toBe(50)
    expect(changePercent(333, 1000)).toBe(67)
  })

  it('declines when the previous period is zero or negative', () => {
    expect(changePercent(500, 0)).toBeNull()
    expect(changePercent(500, -200)).toBeNull()
  })

  it('declines when the current period is zero or negative', () => {
    expect(changePercent(0, 100)).toBeNull()
    expect(changePercent(-347, 510)).toBeNull()
  })
})

describe('sharesOfTotal', () => {
  it('gives each value its rounded share of a positive total', () => {
    expect(sharesOfTotal([75, 25])).toEqual([75, 25])
    expect(sharesOfTotal([1, 2])).toEqual([33, 67])
  })

  it('declines when the total is exactly zero', () => {
    expect(sharesOfTotal([0, 0])).toBeNull()
    expect(sharesOfTotal([])).toBeNull()
  })

  it('declines when any value is negative, even with a positive total', () => {
    expect(sharesOfTotal([150, -50])).toBeNull()
  })

  it('declines when the total is negative', () => {
    expect(sharesOfTotal([153, -500])).toBeNull()
  })
})
