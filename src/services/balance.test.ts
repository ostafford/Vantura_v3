import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => null,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
  schedulePersist: () => {},
}))

import {
  calculateReservedAmount,
  calculateReservedBreakdown,
  getSpendableAlert,
} from './balance'

describe('calculateReservedAmount', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-02-23T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 when nextPayday is null', () => {
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-25',
            frequency: 'ONCE',
            amount: 1000,
            is_reserved: 1,
          },
        ],
        null,
        'MONTHLY'
      )
    ).toBe(0)
  })

  it('returns 0 when paydayFrequency is null', () => {
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-25',
            frequency: 'ONCE',
            amount: 1000,
            is_reserved: 1,
          },
        ],
        '2025-03-01',
        null
      )
    ).toBe(0)
  })

  it('returns 0 for empty charges', () => {
    expect(calculateReservedAmount([], '2025-03-01', 'MONTHLY')).toBe(0)
  })

  it('ignores charges with is_reserved = 0', () => {
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-25',
            frequency: 'ONCE',
            amount: 1000,
            is_reserved: 0,
          },
        ],
        '2025-03-01',
        'MONTHLY'
      )
    ).toBe(0)
  })

  it('reserves full amount for ONCE charge before next payday', () => {
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-25',
            frequency: 'ONCE',
            amount: 5000,
            is_reserved: 1,
          },
        ],
        '2025-03-01',
        'MONTHLY'
      )
    ).toBe(5000)
  })

  it('reserves full amount for WEEKLY charge before next payday', () => {
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-25',
            frequency: 'WEEKLY',
            amount: 3000,
            is_reserved: 1,
          },
        ],
        '2025-03-01',
        'WEEKLY'
      )
    ).toBe(3000)
  })

  it('reserves full amount for MONTHLY charge before next payday, not a prorated fraction', () => {
    // Proration was removed 2026-08-09: a charge only ever reaches this branch after
    // already being confirmed due within the current pay cycle, so there's no "future
    // periods" left to divide across — it was always full amount in every reachable case.
    const reserved = calculateReservedAmount(
      [
        {
          next_charge_date: '2025-02-25',
          frequency: 'MONTHLY',
          amount: 3000,
          is_reserved: 1,
        },
      ],
      '2025-03-09',
      'MONTHLY'
    )
    expect(reserved).toBe(3000)
  })

  it('includes recurring charges using projected next occurrence date', () => {
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-01-25',
            frequency: 'MONTHLY',
            amount: 3000,
            is_reserved: 1,
          },
        ],
        '2025-03-01',
        'MONTHLY'
      )
    ).toBe(3000)
  })

  it('includes due-today charges in reserved total', () => {
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-23',
            frequency: 'ONCE',
            amount: 1000,
            is_reserved: 1,
          },
        ],
        '2025-03-01',
        'MONTHLY'
      )
    ).toBe(1000)
  })

  it('excludes charges when cancel_by_date blocks projected occurrence', () => {
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-20',
            frequency: 'WEEKLY',
            amount: 1500,
            is_reserved: 1,
            cancel_by_date: '2025-02-22',
          },
        ],
        '2025-03-01',
        'MONTHLY'
      )
    ).toBe(0)
  })

  // ── Multi-occurrence behaviour (WEEKLY / FORTNIGHTLY) ───────────────────────

  it('counts all FORTNIGHTLY occurrences before payday — 2 occurrences in 28-day window', () => {
    // Today: Feb 23. Payday: Mar 23 (28 days). Fortnightly from Feb 25 → Feb 25, Mar 11 both ≤ Mar 23.
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-25',
            frequency: 'FORTNIGHTLY',
            amount: 15900,
            is_reserved: 1,
          },
        ],
        '2025-03-23',
        'FORTNIGHTLY'
      )
    ).toBe(31800) // 2 × $159
  })

  it('counts all WEEKLY occurrences before payday — 4 occurrences in 28-day window', () => {
    // Today: Feb 23. Payday: Mar 23. Weekly from Feb 24 → Feb 24, Mar 3, Mar 10, Mar 17 all ≤ Mar 23.
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-24',
            frequency: 'WEEKLY',
            amount: 5000,
            is_reserved: 1,
          },
        ],
        '2025-03-23',
        'FORTNIGHTLY'
      )
    ).toBe(20000) // 4 × $50
  })

  it('counts only 1 WEEKLY occurrence when payday is within the same week', () => {
    // Today: Feb 23. Payday: Mar 1 (6 days). Only Feb 25 is within window.
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-25',
            frequency: 'WEEKLY',
            amount: 3000,
            is_reserved: 1,
          },
        ],
        '2025-03-01',
        'WEEKLY'
      )
    ).toBe(3000)
  })

  it('counts only 1 FORTNIGHTLY occurrence when payday is within same fortnight', () => {
    // Today: Feb 23. Payday: Mar 1. Fortnightly from Feb 24 → only Feb 24 ≤ Mar 1; Mar 10 > Mar 1.
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-24',
            frequency: 'FORTNIGHTLY',
            amount: 8000,
            is_reserved: 1,
          },
        ],
        '2025-03-01',
        'FORTNIGHTLY'
      )
    ).toBe(8000)
  })

  it('stops FORTNIGHTLY loop at cancel_by_date — only first occurrence counted', () => {
    // Feb 25 is below cancel_by_date Mar 1, so it's counted.
    // Mar 11 > cancel_by_date Mar 1, so loop breaks.
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-25',
            frequency: 'FORTNIGHTLY',
            amount: 15900,
            is_reserved: 1,
            cancel_by_date: '2025-03-01',
          },
        ],
        '2025-03-23',
        'FORTNIGHTLY'
      )
    ).toBe(15900) // only 1 × $159
  })

  it('stops WEEKLY loop at cancel_by_date — 2 of 4 occurrences counted', () => {
    // Weekly from Feb 24. Payday Mar 23. cancel_by_date Mar 10.
    // Feb 24 ≤ Mar 10 → count; Mar 3 ≤ Mar 10 → count; Mar 10 ≤ Mar 10 → count; Mar 17 > Mar 10 → break.
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-24',
            frequency: 'WEEKLY',
            amount: 5000,
            is_reserved: 1,
            cancel_by_date: '2025-03-10',
          },
        ],
        '2025-03-23',
        'FORTNIGHTLY'
      )
    ).toBe(15000) // 3 × $50 (Feb 24, Mar 3, Mar 10)
  })

  // ── Payday boundary: charges ON the payday date are excluded ────────────────
  // That day's incoming pay covers them, so they don't need to be reserved from
  // the current balance. Changed 2026-08-09 — previously included.

  it('excludes a ONCE charge due exactly on the payday date', () => {
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-03-01',
            frequency: 'ONCE',
            amount: 9900,
            is_reserved: 1,
          },
        ],
        '2025-03-01',
        'MONTHLY'
      )
    ).toBe(0)
  })

  it('excludes a ONCE charge due the day after payday', () => {
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-03-02',
            frequency: 'ONCE',
            amount: 9900,
            is_reserved: 1,
          },
        ],
        '2025-03-01',
        'MONTHLY'
      )
    ).toBe(0)
  })

  it('excludes the FORTNIGHTLY occurrence that falls exactly on payday date', () => {
    // Fortnightly from Feb 23 → Feb 23, Mar 9, Mar 23 (= payday). Mar 23 is excluded
    // (on-payday), so only Feb 23 and Mar 9 count.
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-23',
            frequency: 'FORTNIGHTLY',
            amount: 2000,
            is_reserved: 1,
          },
        ],
        '2025-03-23',
        'FORTNIGHTLY'
      )
    ).toBe(4000) // 2 × $20 (Feb 23, Mar 9 — Mar 23 excluded)
  })

  it('excludes the WEEKLY occurrence that falls exactly on payday date', () => {
    // Weekly from Feb 23 → Feb 23, Mar 2, ..., Mar 23 (= payday, 4 weeks later).
    // Mar 23 is excluded (on-payday).
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2025-02-23',
            frequency: 'WEEKLY',
            amount: 1000,
            is_reserved: 1,
          },
        ],
        '2025-03-23',
        'WEEKLY'
      )
    ).toBe(4000) // 4 × $10 (Feb 23, Mar 2, Mar 9, Mar 16 — Mar 23 excluded)
  })

  // ── Real-world regression: the $159 Up Bank discrepancy ────────────────────

  it('real-world: fortnightly $159 charge with 26-day pay window reserves full two occurrences', () => {
    vi.setSystemTime(new Date('2026-05-06T12:00:00Z'))
    // Fortnightly charge of $159 next due May 13. Payday June 1 (26 days away).
    // Occurrences: May 13, May 27 — both before June 1. June 10 > June 1 → stop.
    expect(
      calculateReservedAmount(
        [
          {
            next_charge_date: '2026-05-13',
            frequency: 'FORTNIGHTLY',
            amount: 15900,
            is_reserved: 1,
          },
        ],
        '2026-06-01',
        'FORTNIGHTLY'
      )
    ).toBe(31800) // 2 × $159 = $318
  })

  // ── Multiple charges combined ───────────────────────────────────────────────

  it('combines ONCE, WEEKLY multi-occurrence, MONTHLY full-amount, and ignored charge correctly', () => {
    // Today Feb 23, payday Mar 23 (28 days), fortnightly pay.
    // ONCE $20 due Feb 28 → $20 = 2000 cents
    // WEEKLY $10 from Feb 24 → Feb 24, Mar 3, Mar 10, Mar 17 = 4 × $10 = $40 = 4000 cents
    // MONTHLY $300 due Mar 10 → full amount (no proration) = 30000 cents
    // is_reserved=0 charge → ignored
    const reserved = calculateReservedAmount(
      [
        {
          next_charge_date: '2025-02-28',
          frequency: 'ONCE',
          amount: 2000,
          is_reserved: 1,
        },
        {
          next_charge_date: '2025-02-24',
          frequency: 'WEEKLY',
          amount: 1000,
          is_reserved: 1,
        },
        {
          next_charge_date: '2025-03-10',
          frequency: 'MONTHLY',
          amount: 30000,
          is_reserved: 1,
        },
        {
          next_charge_date: '2025-02-26',
          frequency: 'ONCE',
          amount: 9999,
          is_reserved: 0,
        },
      ],
      '2025-03-23',
      'FORTNIGHTLY'
    )
    // $20 + $40 + $300 = $360 = 36000 cents
    expect(reserved).toBe(36000)
  })
})

describe('calculateReservedBreakdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-02-23T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty array when nextPayday is null', () => {
    expect(
      calculateReservedBreakdown(
        [
          {
            name: 'Spotify',
            next_charge_date: '2025-02-25',
            frequency: 'ONCE',
            amount: 1300,
            is_reserved: 1,
          },
        ],
        null,
        'MONTHLY'
      )
    ).toEqual([])
  })

  it('returns empty array when no reserved charges qualify', () => {
    expect(
      calculateReservedBreakdown(
        [
          {
            name: 'Netflix',
            next_charge_date: '2025-03-10',
            frequency: 'ONCE',
            amount: 2000,
            is_reserved: 0,
          },
        ],
        '2025-03-01',
        'MONTHLY'
      )
    ).toEqual([])
  })

  it('returns one item per charge with correct name, amount, and occurrenceCount=1 for ONCE', () => {
    const result = calculateReservedBreakdown(
      [
        {
          name: 'Spotify',
          next_charge_date: '2025-02-25',
          frequency: 'ONCE',
          amount: 1300,
          is_reserved: 1,
        },
      ],
      '2025-03-01',
      'MONTHLY'
    )
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Spotify')
    expect(result[0].reservedAmount).toBe(1300)
    expect(result[0].fullAmount).toBe(1300)
    expect(result[0].occurrenceCount).toBe(1)
    expect(result[0].projectedDate).toBe('2025-02-25')
  })

  it('totals match calculateReservedAmount for the same inputs', () => {
    const charges = [
      {
        name: 'Spotify',
        next_charge_date: '2025-02-25',
        frequency: 'ONCE',
        amount: 1300,
        is_reserved: 1,
      },
      {
        name: 'Aldi Mobile',
        next_charge_date: '2025-02-24',
        frequency: 'MONTHLY',
        amount: 4000,
        is_reserved: 1,
      },
      {
        name: 'Ignored',
        next_charge_date: '2025-02-26',
        frequency: 'ONCE',
        amount: 9999,
        is_reserved: 0,
      },
    ]
    const breakdown = calculateReservedBreakdown(
      charges,
      '2025-03-01',
      'MONTHLY'
    )
    const total = breakdown.reduce((s, r) => s + r.reservedAmount, 0)
    expect(total).toBe(
      calculateReservedAmount(charges, '2025-03-01', 'MONTHLY')
    )
  })

  it('sets occurrenceCount=2 for fortnightly charge hitting twice before payday', () => {
    // Today Feb 23. Payday Mar 23. Fortnightly from Feb 25 → Feb 25, Mar 11 both ≤ Mar 23.
    const result = calculateReservedBreakdown(
      [
        {
          name: 'Rent',
          next_charge_date: '2025-02-25',
          frequency: 'FORTNIGHTLY',
          amount: 15900,
          is_reserved: 1,
        },
      ],
      '2025-03-23',
      'FORTNIGHTLY'
    )
    expect(result).toHaveLength(1)
    expect(result[0].occurrenceCount).toBe(2)
    expect(result[0].reservedAmount).toBe(31800)
    expect(result[0].fullAmount).toBe(15900)
  })

  it('sets occurrenceCount=4 for weekly charge hitting four times before payday', () => {
    const result = calculateReservedBreakdown(
      [
        {
          name: 'Gym',
          next_charge_date: '2025-02-24',
          frequency: 'WEEKLY',
          amount: 1000,
          is_reserved: 1,
        },
      ],
      '2025-03-23',
      'FORTNIGHTLY'
    )
    expect(result).toHaveLength(1)
    expect(result[0].occurrenceCount).toBe(4)
    expect(result[0].reservedAmount).toBe(4000)
  })

  it('sets occurrenceCount=1 and reservedAmount === fullAmount for MONTHLY (no proration)', () => {
    const result = calculateReservedBreakdown(
      [
        {
          name: 'Insurance',
          next_charge_date: '2025-03-10',
          frequency: 'MONTHLY',
          amount: 30000,
          is_reserved: 1,
        },
      ],
      '2025-03-23',
      'FORTNIGHTLY'
    )
    expect(result).toHaveLength(1)
    expect(result[0].occurrenceCount).toBe(1)
    expect(result[0].reservedAmount).toBe(result[0].fullAmount)
  })

  it('excludes charges after nextPayday', () => {
    const result = calculateReservedBreakdown(
      [
        {
          name: 'Future',
          next_charge_date: '2025-04-01',
          frequency: 'ONCE',
          amount: 5000,
          is_reserved: 1,
        },
      ],
      '2025-03-01',
      'MONTHLY'
    )
    expect(result).toHaveLength(0)
  })
})

describe('getSpendableAlert', () => {
  beforeEach(() => {
    for (const key of Object.keys(appSettings)) delete appSettings[key]
  })

  it('returns null when neither floor is configured', () => {
    expect(getSpendableAlert()).toBeNull()
  })

  it('returns null when both floors are zero or blank', () => {
    appSettings['spendable_alert_below_cents'] = '0'
    appSettings['spendable_alert_below_pct_pay'] = ''
    expect(getSpendableAlert()).toBeNull()
  })

  it('resolves a dollar floor directly', () => {
    appSettings['spendable_alert_below_cents'] = '25000'
    expect(getSpendableAlert()).toEqual({
      mode: 'dollars',
      value: 25000,
      thresholdCents: 25000,
    })
  })

  it('resolves a % of pay floor against the pay amount', () => {
    appSettings['spendable_alert_below_pct_pay'] = '40'
    appSettings['pay_amount_cents'] = '500000'
    expect(getSpendableAlert()).toEqual({
      mode: 'pct',
      value: 40,
      thresholdCents: 200000,
    })
  })

  it('rounds the % of pay floor to the nearest cent', () => {
    appSettings['spendable_alert_below_pct_pay'] = '3'
    appSettings['pay_amount_cents'] = '333333'
    expect(getSpendableAlert()?.thresholdCents).toBe(10000)
  })

  it('reports a % of pay floor with no pay amount as dormant (thresholdCents null)', () => {
    appSettings['spendable_alert_below_pct_pay'] = '40'
    expect(getSpendableAlert()).toEqual({
      mode: 'pct',
      value: 40,
      thresholdCents: null,
    })
  })

  it('ignores an out-of-range percentage', () => {
    appSettings['spendable_alert_below_pct_pay'] = '150'
    appSettings['pay_amount_cents'] = '500000'
    expect(getSpendableAlert()).toBeNull()
  })

  it('prefers the dollar floor if both keys are somehow non-zero', () => {
    appSettings['spendable_alert_below_cents'] = '10000'
    appSettings['spendable_alert_below_pct_pay'] = '90'
    appSettings['pay_amount_cents'] = '500000'
    expect(getSpendableAlert()).toEqual({
      mode: 'dollars',
      value: 10000,
      thresholdCents: 10000,
    })
  })
})
