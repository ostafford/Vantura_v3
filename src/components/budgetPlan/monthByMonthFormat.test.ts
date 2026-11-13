import { describe, expect, it } from 'vitest'
import type { MonthResult, MonthByMonthYear } from '@/services/monthByMonth'
import { chartScale, yearCoverage, yearLabelAt } from './monthByMonthFormat'

const month = (m: string, savedCents: number | null): MonthResult => ({
  month: m,
  noPlan: false,
  savedCents,
  reason: savedCents === null ? 'plan-unreadable' : null,
})

const year = (countedMonths: number, notCountedMonths: number) =>
  ({
    year: '2026',
    soFar: false,
    months: [],
    countedMonths,
    notCountedMonths,
    totalCents: countedMonths === 0 ? null : 100,
    averageSavedCents: countedMonths === 0 ? null : 50,
  }) satisfies MonthByMonthYear

describe('the chart’s scale (#282): one shared scale, the largest absolute figure', () => {
  it('with Saved and Overspent months, the baseline is in the middle and the largest absolute figure fills its side', () => {
    const scale = chartScale([
      month('2026-07', 40000),
      month('2026-08', -10000),
      month('2026-09', null),
    ])
    expect(scale.baseline).toBe(0.5)
    expect(scale.height(40000)).toBe(0.5)
    expect(scale.height(-10000)).toBe(0.125)
  })

  it('the largest figure sets the scale whichever side it is on', () => {
    const scale = chartScale([
      month('2026-07', 10000),
      month('2026-08', -40000),
    ])
    expect(scale.baseline).toBe(0.5)
    expect(scale.height(-40000)).toBe(0.5)
    expect(scale.height(10000)).toBe(0.125)
  })

  it('with only Saved months, the baseline is at the bottom and the largest fills the plot', () => {
    const scale = chartScale([month('2026-07', 20000), month('2026-08', 5000)])
    expect(scale.baseline).toBe(1)
    expect(scale.height(20000)).toBe(1)
    expect(scale.height(5000)).toBe(0.25)
  })

  it('with only Overspent months, the baseline is at the top', () => {
    const scale = chartScale([month('2026-07', -20000)])
    expect(scale.baseline).toBe(0)
    expect(scale.height(-20000)).toBe(1)
  })

  it('with no figure above zero, nothing has height', () => {
    const scale = chartScale([month('2026-07', 0), month('2026-08', null)])
    expect(scale.baseline).toBe(1)
    expect(scale.height(0)).toBe(0)
  })
})

describe('a year row’s coverage', () => {
  it('says how many months it counts and leaves out', () => {
    expect(yearCoverage(year(9, 3))).toBe(
      'across 9 of 12 months · 3 not counted'
    )
    expect(yearCoverage(year(12, 0))).toBe('across 12 months')
    expect(yearCoverage(year(1, 0))).toBe('across 1 month')
    expect(yearCoverage(year(0, 3))).toBe('No total · 3 months not counted')
    expect(yearCoverage(year(0, 1))).toBe('No total · 1 month not counted')
  })
})

describe('the chart’s year labels', () => {
  it('label the first month and each January', () => {
    const months = ['2026-11', '2026-12', '2027-01', '2027-02'].map((m) =>
      month(m, 0)
    )
    expect(months.map((_, i) => yearLabelAt(months, i))).toEqual([
      '2026',
      null,
      '2027',
      null,
    ])
  })
})
