import { describe, expect, it, beforeEach, vi } from 'vitest'

const appSettings: Record<string, string> = {}
const accounts: Record<string, { is_closed: number }> = {}

vi.mock('@/db', () => ({
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
}))

vi.mock('./accounts', () => ({
  getAccountById: (id: string) => accounts[id] ?? null,
}))

const {
  getEssentialsSaverAccountId,
  setEssentialsSaverAccountId,
  isEssentialsUser,
  getEssentialsNomination,
  getActiveEssentialsSaverAccountId,
} = await import('./essentials')

beforeEach(() => {
  for (const key of Object.keys(appSettings)) delete appSettings[key]
  for (const key of Object.keys(accounts)) delete accounts[key]
  accounts['saver-123'] = { is_closed: 0 }
})

describe('essentials Saver nomination', () => {
  it('is null / false with nothing nominated', () => {
    expect(getEssentialsSaverAccountId()).toBeNull()
    expect(isEssentialsUser()).toBe(false)
  })

  it('nominating a Saver makes the user an Essentials user', () => {
    setEssentialsSaverAccountId('saver-123')
    expect(getEssentialsSaverAccountId()).toBe('saver-123')
    expect(isEssentialsUser()).toBe(true)
  })

  it('clearing the nomination (null) reverts to classic', () => {
    setEssentialsSaverAccountId('saver-123')
    setEssentialsSaverAccountId(null)
    expect(getEssentialsSaverAccountId()).toBeNull()
    expect(isEssentialsUser()).toBe(false)
  })

  it('treats an empty-string setting the same as unset', () => {
    setEssentialsSaverAccountId('')
    expect(getEssentialsSaverAccountId()).toBeNull()
    expect(isEssentialsUser()).toBe(false)
  })
})

describe('essentials Saver nomination: unavailable Saver', () => {
  it('is active while the nominated Saver is open', () => {
    setEssentialsSaverAccountId('saver-123')
    expect(getEssentialsNomination()).toEqual({
      status: 'active',
      accountId: 'saver-123',
    })
    expect(getActiveEssentialsSaverAccountId()).toBe('saver-123')
  })

  it('is unavailable once the nominated Saver is closed, but keeps the setting', () => {
    setEssentialsSaverAccountId('saver-123')
    accounts['saver-123'].is_closed = 1
    expect(getEssentialsNomination()).toEqual({
      status: 'unavailable',
      accountId: 'saver-123',
    })
    expect(getActiveEssentialsSaverAccountId()).toBeNull()
    expect(isEssentialsUser()).toBe(false)
    expect(getEssentialsSaverAccountId()).toBe('saver-123')
  })

  it('is unavailable when the nominated account has no row at all', () => {
    setEssentialsSaverAccountId('saver-gone')
    expect(getEssentialsNomination().status).toBe('unavailable')
    expect(getActiveEssentialsSaverAccountId()).toBeNull()
  })
})
