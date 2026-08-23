import { describe, expect, it, beforeEach, vi } from 'vitest'

const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
}))

const { getNotifTypeEnabled, hasFiredForValue, markFiredForValue } =
  await import('./notifications')

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

describe('hasFiredForValue / markFiredForValue', () => {
  it('has not fired when the guard key is unset', () => {
    expect(hasFiredForValue('notif_to_1', '2026-04-01')).toBe(false)
  })

  it('has not fired when the stored value differs from the value checked', () => {
    markFiredForValue('notif_to_1', '2026-03-01')
    expect(hasFiredForValue('notif_to_1', '2026-04-01')).toBe(false)
  })

  it('has fired once the exact value is marked', () => {
    markFiredForValue('notif_to_1', '2026-04-01')
    expect(hasFiredForValue('notif_to_1', '2026-04-01')).toBe(true)
  })

  it('re-fires when the value changes after being marked (e.g. a new period)', () => {
    markFiredForValue('notif_to_1', '2026-04-01')
    expect(hasFiredForValue('notif_to_1', '2026-05-01')).toBe(false)
  })

  it('supports a fixed sentinel for a plain "has this ever fired" guard', () => {
    expect(hasFiredForValue('notif_bill_settled_1_2026-04-01', '1')).toBe(false)
    markFiredForValue('notif_bill_settled_1_2026-04-01', '1')
    expect(hasFiredForValue('notif_bill_settled_1_2026-04-01', '1')).toBe(true)
  })
})
