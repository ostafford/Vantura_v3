import { describe, expect, it } from 'vitest'
import {
  budgetPercent,
  changePercent,
  sharesOfTotal,
} from '@/lib/spendingPercent'

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

describe('budgetPercent', () => {
  it('is the rounded percent of a positive budget spent, unclamped over 100%', () => {
    expect(budgetPercent(50, 200)).toBe(25)
    expect(budgetPercent(1, 3)).toBe(33)
    expect(budgetPercent(300, 200)).toBe(150)
  })

  it('declines when spend is zero or negative (refunds exceed purchases)', () => {
    expect(budgetPercent(0, 200)).toBeNull()
    expect(budgetPercent(-30, 200)).toBeNull()
  })

  it('declines when the budget is zero or negative', () => {
    expect(budgetPercent(50, 0)).toBeNull()
    expect(budgetPercent(50, -100)).toBeNull()
  })
})
