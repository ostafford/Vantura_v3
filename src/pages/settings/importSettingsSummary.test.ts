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

  it('no longer mentions an Essentials nomination from an older export (#211)', () => {
    expect(
      formatSettingsSummary({
        payday_frequency: 'MONTHLY',
        essentials_saver_account_id: 'saver-1',
      })
    ).toBe('Monthly payday')
  })

  it('falls back to "Some settings" when nothing it describes is present', () => {
    expect(formatSettingsSummary({ theme_mode: 'light' })).toBe('Some settings')
  })
})
