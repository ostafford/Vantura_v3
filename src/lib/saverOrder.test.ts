import { describe, expect, it, beforeEach, vi } from 'vitest'

const appSettings: Record<string, string> = {}
const SAVER_ORDER_KEY = 'saver_account_order'

vi.mock('@/db', () => ({
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
}))

const { getSaverOrder, setSaverOrder } = await import('./saverOrder')

beforeEach(() => {
  for (const key of Object.keys(appSettings)) delete appSettings[key]
})

describe('getSaverOrder', () => {
  it('returns knownIds as-is when nothing is stored', () => {
    expect(getSaverOrder(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('returns knownIds as-is on invalid JSON', () => {
    appSettings[SAVER_ORDER_KEY] = 'not json'
    expect(getSaverOrder(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('preserves stored order and drops ids no longer known', () => {
    appSettings[SAVER_ORDER_KEY] = JSON.stringify(['c', 'x', 'a'])
    expect(getSaverOrder(['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
  })

  it('appends a newly-added saver missing from the stored order', () => {
    appSettings[SAVER_ORDER_KEY] = JSON.stringify(['b', 'a'])
    expect(getSaverOrder(['a', 'b', 'c'])).toEqual(['b', 'a', 'c'])
  })

  it('setSaverOrder round-trips through getSaverOrder', () => {
    setSaverOrder(['c', 'b', 'a'])
    expect(getSaverOrder(['a', 'b', 'c'])).toEqual(['c', 'b', 'a'])
  })
})
