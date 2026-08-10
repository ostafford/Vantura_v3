import { describe, expect, it, beforeEach, vi } from 'vitest'

const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
}))

const { getNotifTypeEnabled } = await import('./notifications')

beforeEach(() => {
  for (const key of Object.keys(appSettings)) delete appSettings[key]
})

describe('getNotifTypeEnabled', () => {
  // Changed 2026-08-10: every type used to default on except large_tx/sync_stale,
  // which required manual opt-in. Now all types default on uniformly — the user
  // opts *out* per type instead of some types requiring opt-in.
  const allTypes = [
    'bills',
    'tracker_overspent',
    'tracker_pace',
    'spendable_low',
    'payday',
    'possible_payday',
    'large_tx',
    'saver_milestone',
    'sync_stale',
  ] as const

  it.each(allTypes)('%s defaults to enabled when unset', (type) => {
    expect(getNotifTypeEnabled(type)).toBe(true)
  })

  it('respects an explicit off setting', () => {
    appSettings['notif_large_tx'] = '0'
    expect(getNotifTypeEnabled('large_tx')).toBe(false)
  })

  it('respects an explicit on setting', () => {
    appSettings['notif_sync_stale'] = '1'
    expect(getNotifTypeEnabled('sync_stale')).toBe(true)
  })
})
