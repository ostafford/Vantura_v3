import { describe, expect, it } from 'vitest'
import { __test__, type UpcomingChargeRow } from './upcoming'

function makeRow(
  overrides: Partial<UpcomingChargeRow> = {}
): UpcomingChargeRow {
  return {
    id: 1,
    name: 'Test charge',
    amount: 1000,
    frequency: 'MONTHLY',
    next_charge_date: '2026-01-15',
    category_id: null,
    is_reserved: 1,
    reminder_days_before: null,
    is_subscription: 0,
    cancel_by_date: null,
    charge_type: 'EXPENSE',
    linked_manual_account_id: null,
    ...overrides,
  }
}

describe('upcoming recurrence projection', () => {
  it('projects recurring monthly charges into future months indefinitely', () => {
    const row = makeRow({
      frequency: 'MONTHLY',
      next_charge_date: '2026-01-15',
      cancel_by_date: null,
    })
    const march = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-03-01',
      '2026-03-31'
    )
    const april = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-04-01',
      '2026-04-30'
    )
    expect(march.map((c) => c.next_charge_date)).toEqual(['2026-03-15'])
    expect(april.map((c) => c.next_charge_date)).toEqual(['2026-04-15'])
  })

  it('stops projecting once cancel_by_date is exceeded', () => {
    const row = makeRow({
      frequency: 'MONTHLY',
      next_charge_date: '2026-01-10',
      cancel_by_date: '2026-03-15',
    })
    const march = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-03-01',
      '2026-03-31'
    )
    const april = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-04-01',
      '2026-04-30'
    )
    expect(march.map((c) => c.next_charge_date)).toEqual(['2026-03-10'])
    expect(april).toEqual([])
  })

  it('keeps ONCE charges as a single occurrence', () => {
    const row = makeRow({
      frequency: 'ONCE',
      next_charge_date: '2026-03-22',
    })
    const march = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-03-01',
      '2026-03-31'
    )
    const april = __test__.getProjectedOccurrencesInRange(
      row,
      '2026-04-01',
      '2026-04-30'
    )
    expect(march.map((c) => c.next_charge_date)).toEqual(['2026-03-22'])
    expect(april).toEqual([])
  })

  it('computes first occurrence on or after target for reminder/calendar projection', () => {
    const occurrence = __test__.firstOccurrenceOnOrAfter(
      '2026-01-01',
      'FORTNIGHTLY',
      '2026-02-01',
      null
    )
    expect(occurrence).toBe('2026-02-12')
  })

  it('projects monthly occurrences from past base date to target window', () => {
    const occurrence = __test__.firstOccurrenceOnOrAfter(
      '2026-01-15',
      'MONTHLY',
      '2026-03-01',
      null
    )
    expect(occurrence).toBe('2026-03-15')
  })
})
