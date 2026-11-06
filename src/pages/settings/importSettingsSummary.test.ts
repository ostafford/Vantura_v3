import { describe, expect, it } from 'vitest'
import { formatSettingsSummary } from './importSettingsSummary'

describe('formatSettingsSummary', () => {
  it('is None for no settings', () => {
    expect(formatSettingsSummary({})).toBe('None')
  })

  it('describes the Pay frequency', () => {
    expect(formatSettingsSummary({ payday_frequency: 'WEEKLY' })).toBe(
      'Weekly pay'
    )
  })

  it('ignores the payday day from an older export (#195)', () => {
    expect(
      formatSettingsSummary({
        payday_frequency: 'MONTHLY',
        payday_day: '104',
        next_payday: '2026-11-26',
      })
    ).toBe('Monthly pay')
  })

  it('no longer mentions an Essentials nomination from an older export (#211)', () => {
    expect(
      formatSettingsSummary({
        payday_frequency: 'MONTHLY',
        essentials_saver_account_id: 'saver-1',
      })
    ).toBe('Monthly pay')
  })

  it('falls back to "Some settings" when nothing it describes is present', () => {
    expect(formatSettingsSummary({ theme_mode: 'light' })).toBe('Some settings')
  })
})
