import { describe, it, expect } from 'vitest'
import {
  normalizeDateStr,
  addDaysToDateStr,
  daysBetweenDateStr,
  calendarPeriodBounds,
} from './dateStr'

describe('normalizeDateStr', () => {
  it('trims a datetime string to its date part', () => {
    expect(normalizeDateStr('2026-02-11T08:30:00.000Z')).toBe('2026-02-11')
  })
  it('leaves a bare date untouched', () => {
    expect(normalizeDateStr('2026-02-11')).toBe('2026-02-11')
  })
})

describe('addDaysToDateStr', () => {
  it('crosses a month boundary forward', () => {
    expect(addDaysToDateStr('2026-01-31', 1)).toBe('2026-02-01')
  })
  it('crosses a month boundary backward (the -1 "display period end" case)', () => {
    expect(addDaysToDateStr('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('crosses a year boundary in both directions', () => {
    expect(addDaysToDateStr('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDaysToDateStr('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('lands on Feb 29 in a leap year', () => {
    expect(addDaysToDateStr('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDaysToDateStr('2024-03-01', -1)).toBe('2024-02-29')
  })
  it('is a no-op for 0 days and normalizes datetime input', () => {
    expect(addDaysToDateStr('2026-02-11T23:59:00Z', 0)).toBe('2026-02-11')
  })
  it('handles multi-week jumps', () => {
    expect(addDaysToDateStr('2026-02-11', 21)).toBe('2026-03-04')
  })
})

describe('daysBetweenDateStr', () => {
  it('is 0 for the same day', () => {
    expect(daysBetweenDateStr('2026-03-10', '2026-03-10')).toBe(0)
  })
  it('counts a forward span', () => {
    expect(daysBetweenDateStr('2026-03-10', '2026-03-17')).toBe(7)
  })
  it('is negative when b precedes a', () => {
    expect(daysBetweenDateStr('2026-03-17', '2026-03-10')).toBe(-7)
  })
  it('spans a month/year boundary', () => {
    expect(daysBetweenDateStr('2025-12-25', '2026-01-05')).toBe(11)
  })
  it('ignores the time part of datetime strings', () => {
    expect(
      daysBetweenDateStr('2026-03-10T00:00:00Z', '2026-03-17T23:59:00Z')
    ).toBe(7)
  })
  it('returns 0 when a side does not parse', () => {
    expect(daysBetweenDateStr('not-a-date', '2026-03-10')).toBe(0)
  })
})

describe('calendarPeriodBounds', () => {
  // 2026-02-11 is a Wednesday; 2026-02-08 is a Sunday.
  const wed = new Date('2026-02-11T09:00:00Z')
  const sun = new Date('2026-02-08T09:00:00Z')

  it('WEEKLY snaps to the enclosing Mon–Mon range', () => {
    expect(calendarPeriodBounds('WEEKLY', 0, wed)).toEqual({
      from: '2026-02-09',
      to: '2026-02-16',
    })
  })
  it('WEEKLY treats Sunday as the last day of its week, not the first', () => {
    expect(calendarPeriodBounds('WEEKLY', 0, sun)).toEqual({
      from: '2026-02-02',
      to: '2026-02-09',
    })
  })
  it('WEEKLY offset walks whole weeks back', () => {
    expect(calendarPeriodBounds('WEEKLY', -1, wed)).toEqual({
      from: '2026-02-02',
      to: '2026-02-09',
    })
  })

  it('MONTHLY is the calendar month, exclusive end', () => {
    expect(calendarPeriodBounds('MONTHLY', 0, wed)).toEqual({
      from: '2026-02-01',
      to: '2026-03-01',
    })
  })
  it('MONTHLY offset rolls the year backward', () => {
    expect(calendarPeriodBounds('MONTHLY', -2, wed)).toEqual({
      from: '2025-12-01',
      to: '2026-01-01',
    })
  })
  it('MONTHLY offset rolls the year forward', () => {
    expect(calendarPeriodBounds('MONTHLY', 11, wed)).toEqual({
      from: '2027-01-01',
      to: '2027-02-01',
    })
  })

  it('YEARLY spans Jan 1 to next Jan 1', () => {
    expect(calendarPeriodBounds('YEARLY', 0, wed)).toEqual({
      from: '2026-01-01',
      to: '2027-01-01',
    })
    expect(calendarPeriodBounds('YEARLY', -1, wed)).toEqual({
      from: '2025-01-01',
      to: '2026-01-01',
    })
  })
})
