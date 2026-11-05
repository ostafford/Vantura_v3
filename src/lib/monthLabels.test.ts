import { describe, expect, it } from 'vitest'
import {
  comparisonMonthPairLabels,
  MONTH_LABEL_FALLBACK,
  monthNameLong,
  previousCalendarMonth,
} from './monthLabels'

describe('monthLabels', () => {
  it('previousCalendarMonth rolls year for January', () => {
    expect(previousCalendarMonth(2026, 1)).toEqual({ year: 2025, month: 12 })
  })

  it('monthNameLong returns fallback for invalid month', () => {
    expect(monthNameLong(2024, 0)).toBe(MONTH_LABEL_FALLBACK)
    expect(monthNameLong(2024, 13)).toBe(MONTH_LABEL_FALLBACK)
    expect(monthNameLong(NaN, 6)).toBe(MONTH_LABEL_FALLBACK)
  })

  it('comparisonMonthPairLabels returns fallbacks for invalid current month', () => {
    const r = comparisonMonthPairLabels(2024, 99)
    expect(r.currentLabel).toBe(MONTH_LABEL_FALLBACK)
    expect(r.previousLabel).toBe(MONTH_LABEL_FALLBACK)
  })

  it('comparisonMonthPairLabels adds years when months cross a year boundary', () => {
    const { currentLabel, previousLabel } = comparisonMonthPairLabels(2026, 1)
    expect(currentLabel).toMatch(/2026/)
    expect(previousLabel).toMatch(/2025/)
  })
})
