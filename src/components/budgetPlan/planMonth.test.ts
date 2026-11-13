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
    expect(resolvePlanMonth(null, '2026-11-07', '2026-09', null)).toEqual({
      month: '2026-11',
      current: '2026-11',
      isCurrent: true,
      prev: '2026-10',
      next: null,
    })
  })

  it('shows a finished month from the URL, with both chevrons', () => {
    expect(
      resolvePlanMonth('2026-10', '2026-11-07', '2026-09', null)
    ).toMatchObject({
      month: '2026-10',
      isCurrent: false,
      prev: '2026-09',
      next: '2026-11',
    })
  })

  it('disables ‹ on the first plannable month', () => {
    expect(
      resolvePlanMonth('2026-09', '2026-11-07', '2026-09', null)
    ).toMatchObject({
      month: '2026-09',
      prev: null,
      next: '2026-10',
    })
  })

  it('disables ‹ on the current month when it is the first plannable month', () => {
    expect(
      resolvePlanMonth(null, '2026-11-07', '2026-11', null).prev
    ).toBeNull()
  })

  it('has no earlier month when no first plannable month is stored', () => {
    expect(resolvePlanMonth('2026-10', '2026-11-07', null, null)).toMatchObject(
      {
        month: '2026-11',
        prev: null,
      }
    )
  })

  it.each([
    ['before the first plannable month', '2026-08'],
    ['after the current month', '2026-12'],
    ['malformed', '2026-10-01'],
    ['not a month', '2026-13'],
  ])('shows the current month for a ?month= %s', (_name, requested) => {
    expect(
      resolvePlanMonth(requested, '2026-11-07', '2026-09', null).month
    ).toBe('2026-11')
  })

  it('steps across a year boundary', () => {
    expect(
      resolvePlanMonth('2027-01', '2027-02-01', '2026-11', null)
    ).toMatchObject({
      prev: '2026-12',
      next: '2027-02',
    })
  })
})

describe('resolvePlanMonth with Months without a plan (#282)', () => {
  // The Spending account opened in March; the First plannable month is September.
  const range = { firstMonth: '2026-03', lastMonth: '2026-08' }

  it('‹ steps from the First plannable month into the last Month without a plan', () => {
    expect(
      resolvePlanMonth('2026-09', '2026-11-07', '2026-09', range)
    ).toMatchObject({ month: '2026-09', prev: '2026-08', next: '2026-10' })
  })

  it('shows a Month without a plan from the URL', () => {
    expect(
      resolvePlanMonth('2026-05', '2026-11-07', '2026-09', range)
    ).toMatchObject({
      month: '2026-05',
      isCurrent: false,
      prev: '2026-04',
      next: '2026-06',
    })
  })

  it('disables ‹ on the opening month', () => {
    expect(
      resolvePlanMonth('2026-03', '2026-11-07', '2026-09', range)
    ).toMatchObject({ month: '2026-03', prev: null, next: '2026-04' })
  })

  it('shows the current month for a ?month= before the opening month', () => {
    expect(
      resolvePlanMonth('2026-02', '2026-11-07', '2026-09', range).month
    ).toBe('2026-11')
  })

  it('without a range (the bucket page), a Month without a plan shows the current month', () => {
    expect(
      resolvePlanMonth('2026-05', '2026-11-07', '2026-09', null)
    ).toMatchObject({ month: '2026-11' })
    expect(
      resolvePlanMonth('2026-09', '2026-11-07', '2026-09', null).prev
    ).toBeNull()
  })
})

describe('planMonthSearch', () => {
  it('carries a finished month and drops the current one', () => {
    expect(planMonthSearch('2026-10', '2026-11')).toBe('?month=2026-10')
    expect(planMonthSearch('2026-11', '2026-11')).toBe('')
  })
})
