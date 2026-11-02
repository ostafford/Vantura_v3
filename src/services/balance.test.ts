import { describe, it, expect, vi, beforeEach } from 'vitest'

const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => null,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
  schedulePersist: () => {},
}))

import { getSpendableAlert } from './balance'

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
