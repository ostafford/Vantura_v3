import { describe, it, expect, vi } from 'vitest'

vi.mock('@/db', () => ({
  getDb: () => null,
  getAppSetting: () => null,
  setAppSetting: () => {},
  schedulePersist: () => {},
}))

const { resolvePlanMonth, planMonthSearch } = await import('./planMonth')

describe('resolvePlanMonth', () => {
  it('opens on the current month, with › disabled there', () => {
    expect(resolvePlanMonth(null, '2026-11-07', '2026-09')).toEqual({
      month: '2026-11',
      current: '2026-11',
      isCurrent: true,
      prev: '2026-10',
      next: null,
    })
  })

  it('shows a finished month from the URL, with both chevrons', () => {
    expect(resolvePlanMonth('2026-10', '2026-11-07', '2026-09')).toMatchObject({
      month: '2026-10',
      isCurrent: false,
      prev: '2026-09',
      next: '2026-11',
    })
  })

  it('disables ‹ on the first plannable month', () => {
    expect(resolvePlanMonth('2026-09', '2026-11-07', '2026-09')).toMatchObject({
      month: '2026-09',
      prev: null,
      next: '2026-10',
    })
  })

  it('disables ‹ on the current month when it is the first plannable month', () => {
    expect(resolvePlanMonth(null, '2026-11-07', '2026-11').prev).toBeNull()
  })

  it('has no earlier month when no first plannable month is stored', () => {
    expect(resolvePlanMonth('2026-10', '2026-11-07', null)).toMatchObject({
      month: '2026-11',
      prev: null,
    })
  })

  it.each([
    ['before the first plannable month', '2026-08'],
    ['after the current month', '2026-12'],
    ['malformed', '2026-10-01'],
    ['not a month', '2026-13'],
  ])('shows the current month for a ?month= %s', (_name, requested) => {
    expect(resolvePlanMonth(requested, '2026-11-07', '2026-09').month).toBe(
      '2026-11'
    )
  })

  it('steps across a year boundary', () => {
    expect(resolvePlanMonth('2027-01', '2027-02-01', '2026-11')).toMatchObject({
      prev: '2026-12',
      next: '2027-02',
    })
  })
})

describe('planMonthSearch', () => {
  it('carries a finished month and drops the current one', () => {
    expect(planMonthSearch('2026-10', '2026-11')).toBe('?month=2026-10')
    expect(planMonthSearch('2026-11', '2026-11')).toBe('')
  })
})
