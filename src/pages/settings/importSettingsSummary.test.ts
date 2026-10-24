import { describe, expect, it } from 'vitest'
import { formatSettingsSummary } from './importSettingsSummary'

describe('formatSettingsSummary', () => {
  it('is None for no settings', () => {
    expect(formatSettingsSummary({})).toBe('None')
  })

  it('describes the payday', () => {
    expect(
      formatSettingsSummary({ payday_frequency: 'WEEKLY', payday_day: '3' })
    ).toMatch(/^Weekly payday \(/)
  })

  it('calls out an Essentials nomination, since it changes Spendable', () => {
    expect(
      formatSettingsSummary({
        payday_frequency: 'MONTHLY',
        essentials_saver_account_id: 'saver-1',
      })
    ).toBe('Monthly payday, Essentials Saver nominated')
    expect(
      formatSettingsSummary({ essentials_saver_account_id: 'saver-1' })
    ).toBe('Essentials Saver nominated')
  })

  it('falls back to "Some settings" when nothing it describes is present', () => {
    expect(formatSettingsSummary({ theme_mode: 'light' })).toBe('Some settings')
  })
})
