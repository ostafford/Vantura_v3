import { describe, expect, it, vi, beforeEach } from 'vitest'

const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
}))

const { readPaySettings, savePay } = await import('./pay')

beforeEach(() => {
  for (const key of Object.keys(appSettings)) delete appSettings[key]
})

// The amount rules themselves are tested in src/lib/amountInput.test.ts.

describe('savePay', () => {
  it('saves the frequency and the amount in cents', () => {
    expect(savePay('FORTNIGHTLY', '3200.50')).toBe(true)
    expect(appSettings.payday_frequency).toBe('FORTNIGHTLY')
    expect(appSettings.pay_amount_cents).toBe('320050')
  })

  it('clears the amount when it is left blank', () => {
    appSettings.pay_amount_cents = '450000'
    expect(savePay('MONTHLY', '')).toBe(true)
    expect(appSettings.pay_amount_cents).toBe('')
    expect(appSettings.payday_frequency).toBe('MONTHLY')
  })

  it('writes nothing when the amount is invalid', () => {
    appSettings.pay_amount_cents = '450000'
    appSettings.payday_frequency = 'MONTHLY'
    expect(savePay('WEEKLY', '-5')).toBe(false)
    expect(appSettings.pay_amount_cents).toBe('450000')
    expect(appSettings.payday_frequency).toBe('MONTHLY')
  })
})

describe('readPaySettings', () => {
  it('reads the stored frequency and the amount as dollars for the form', () => {
    appSettings.payday_frequency = 'WEEKLY'
    appSettings.pay_amount_cents = '123456'
    expect(readPaySettings()).toEqual({
      frequency: 'WEEKLY',
      amountInput: '1234.56',
    })
  })

  it('is null frequency and blank amount when unset or unusable', () => {
    expect(readPaySettings()).toEqual({ frequency: null, amountInput: '' })
    appSettings.payday_frequency = 'PAYDAY'
    appSettings.pay_amount_cents = 'garbage'
    expect(readPaySettings()).toEqual({ frequency: null, amountInput: '' })
  })
})
