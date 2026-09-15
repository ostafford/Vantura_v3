import { describe, expect, it, beforeEach, vi } from 'vitest'

const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
}))

const {
  getEssentialsSaverAccountId,
  setEssentialsSaverAccountId,
  isEssentialsUser,
} = await import('./essentials')

beforeEach(() => {
  for (const key of Object.keys(appSettings)) delete appSettings[key]
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
