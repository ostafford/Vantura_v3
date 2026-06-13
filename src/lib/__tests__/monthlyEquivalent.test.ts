import { describe, expect, it } from 'vitest'
import {
  monthlyEquivalentMultiplier,
  toMonthlyEquivalentCents,
  toPeriodCents,
} from '@/lib/monthlyEquivalent'

describe('monthlyEquivalent', () => {
  it('converts recurring frequencies to monthly multipliers', () => {
    expect(monthlyEquivalentMultiplier('MONTHLY')).toBe(1)
    expect(monthlyEquivalentMultiplier('QUARTERLY')).toBeCloseTo(1 / 3)
    expect(monthlyEquivalentMultiplier('YEARLY')).toBeCloseTo(1 / 12)
    expect(monthlyEquivalentMultiplier('WEEKLY')).toBeCloseTo(52 / 12)
    expect(monthlyEquivalentMultiplier('FORTNIGHTLY')).toBeCloseTo(26 / 12)
  })

  it('returns 0 for unknown frequency', () => {
    expect(monthlyEquivalentMultiplier('ONCE')).toBe(0)
    expect(toMonthlyEquivalentCents(10000, 'ONCE')).toBe(0)
  })

  it('computes monthly equivalent cents with rounding', () => {
    // $10 weekly → about $43.33/month
    expect(toMonthlyEquivalentCents(1000, 'WEEKLY')).toBe(
      Math.round(1000 * (52 / 12))
    )
  })
})

describe('toPeriodCents', () => {
  it('MONTHLY amount → all periods', () => {
    // $100/month → $1200/year, $100/month, $1200/52 weekly
    expect(toPeriodCents(10000, 'MONTHLY', 'YEARLY')).toBe(120000)
    expect(toPeriodCents(10000, 'MONTHLY', 'MONTHLY')).toBe(10000)
    expect(toPeriodCents(10000, 'MONTHLY', 'WEEKLY')).toBe(
      Math.round(120000 / 52)
    )
  })

  it('WEEKLY amount → all periods', () => {
    // $10/week → $520/year, $520/12 monthly
    expect(toPeriodCents(1000, 'WEEKLY', 'YEARLY')).toBe(52000)
    expect(toPeriodCents(1000, 'WEEKLY', 'WEEKLY')).toBe(1000)
    expect(toPeriodCents(1000, 'WEEKLY', 'MONTHLY')).toBe(
      Math.round(52000 / 12)
    )
  })

  it('YEARLY amount → all periods', () => {
    expect(toPeriodCents(120000, 'YEARLY', 'YEARLY')).toBe(120000)
    expect(toPeriodCents(120000, 'YEARLY', 'MONTHLY')).toBe(10000)
    expect(toPeriodCents(120000, 'YEARLY', 'WEEKLY')).toBe(
      Math.round(120000 / 52)
    )
  })

  it('FORTNIGHTLY amount → all periods', () => {
    // $100/fortnight → $2600/year
    expect(toPeriodCents(10000, 'FORTNIGHTLY', 'YEARLY')).toBe(260000)
    expect(toPeriodCents(10000, 'FORTNIGHTLY', 'MONTHLY')).toBe(
      Math.round(260000 / 12)
    )
  })

  it('QUARTERLY amount → all periods', () => {
    // $300/quarter → $1200/year
    expect(toPeriodCents(30000, 'QUARTERLY', 'YEARLY')).toBe(120000)
    expect(toPeriodCents(30000, 'QUARTERLY', 'MONTHLY')).toBe(10000)
  })

  it('returns 0 for unknown or ONCE frequency', () => {
    expect(toPeriodCents(10000, 'ONCE', 'MONTHLY')).toBe(0)
    expect(toPeriodCents(10000, 'UNKNOWN', 'YEARLY')).toBe(0)
  })

  it('clamps negative amounts to 0', () => {
    expect(toPeriodCents(-500, 'MONTHLY', 'YEARLY')).toBe(0)
  })
})
