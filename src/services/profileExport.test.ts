import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SETTINGS_WHITELIST,
  FORBIDDEN_KEYS,
  buildExportPayload,
  encryptExportPayload,
  decryptImportFile,
  parseImportFile,
  type ExportPayload,
} from './profileExport'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
  getAppSetting: vi.fn(),
  setAppSetting: vi.fn(),
  schedulePersist: vi.fn(),
}))

describe('profileExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('security: whitelist vs forbidden keys', () => {
    it('SETTINGS_WHITELIST and FORBIDDEN_KEYS are disjoint', () => {
      const whitelistSet = new Set(SETTINGS_WHITELIST)
      for (const key of FORBIDDEN_KEYS) {
        expect(whitelistSet.has(key)).toBe(false)
      }
    })

    it('no forbidden key is exported in settings', async () => {
      const db = await import('@/db')
      vi.mocked(db.getDb).mockReturnValue(null)
      vi.mocked(db.getAppSetting).mockImplementation((key) => {
        if (key === 'theme') return 'dark'
        if (key === 'accent_color') return 'blue'
        return null
      })
      const payload = buildExportPayload()
      for (const key of FORBIDDEN_KEYS) {
        expect(payload.settings[key]).toBeUndefined()
      }
    })
  })

  describe('encryptExportPayload and decryptImportFile', () => {
    it('round-trips payload correctly', async () => {
      const payload: ExportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appSchemaVersion: 2,
        settings: { theme: 'dark', accent_color: 'teal' },
        trackers: [],
        trackerCategories: [],
        upcomingCharges: [],
      }
      const wrapper = await encryptExportPayload(payload, 'test-passphrase')
      expect(wrapper.salt).toBeDefined()
      expect(wrapper.ciphertext).toBeDefined()
      expect(wrapper.iterations).toBeGreaterThan(0)
      expect(wrapper.formatVersion).toBe(1)

      const decrypted = await decryptImportFile(wrapper, 'test-passphrase')
      expect(decrypted.settings).toEqual(payload.settings)
      expect(decrypted.trackers).toEqual(payload.trackers)
      expect(decrypted.trackerCategories).toEqual(payload.trackerCategories)
      expect(decrypted.upcomingCharges).toEqual(payload.upcomingCharges)
    })

    it('decryptImportFile throws on wrong passphrase', async () => {
      const payload: ExportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appSchemaVersion: 2,
        settings: {},
        trackers: [],
        trackerCategories: [],
        upcomingCharges: [],
      }
      const wrapper = await encryptExportPayload(payload, 'correct-pass')
      await expect(decryptImportFile(wrapper, 'wrong-pass')).rejects.toThrow()
    })

    it('decryptImportFile throws when appSchemaVersion exceeds current', async () => {
      const payload: ExportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appSchemaVersion: 99,
        settings: {},
        trackers: [],
        trackerCategories: [],
        upcomingCharges: [],
      }
      const wrapper = await encryptExportPayload(payload, 'pass')
      await expect(decryptImportFile(wrapper, 'pass')).rejects.toThrow(
        /newer app version/
      )
    })
  })

  describe('parseImportFile', () => {
    it('throws when salt is missing', () => {
      expect(() =>
        parseImportFile({
          salt: '',
          iterations: 100000,
          ciphertext: 'abc',
          formatVersion: 1,
        })
      ).toThrow('missing salt, ciphertext, or iterations')
    })

    it('throws when ciphertext is missing', () => {
      expect(() =>
        parseImportFile({
          salt: 'abc',
          iterations: 100000,
          ciphertext: '',
          formatVersion: 1,
        })
      ).toThrow('missing salt, ciphertext, or iterations')
    })

    it('throws when iterations is not a number', () => {
      expect(() =>
        parseImportFile({
          salt: 'abc',
          iterations: '100000' as unknown as number,
          ciphertext: 'xyz',
          formatVersion: 1,
        })
      ).toThrow('missing salt, ciphertext, or iterations')
    })
  })

  describe('buildExportPayload', () => {
    it('returns empty arrays when db is null', async () => {
      const db = await import('@/db')
      vi.mocked(db.getDb).mockReturnValue(null)
      vi.mocked(db.getAppSetting).mockReturnValue(null)

      const payload = buildExportPayload()

      expect(payload.trackers).toEqual([])
      expect(payload.trackerCategories).toEqual([])
      expect(payload.upcomingCharges).toEqual([])
      expect(payload.settings).toEqual({})
    })

    it('includes only whitelisted settings', async () => {
      const db = await import('@/db')
      vi.mocked(db.getDb).mockReturnValue(null)
      vi.mocked(db.getAppSetting).mockImplementation((key) => {
        if (key === 'theme') return 'dark'
        if (key === 'payday_frequency') return 'MONTHLY'
        if (key === 'api_token_encrypted') return 'secret-value'
        return null
      })

      const payload = buildExportPayload()

      expect(payload.settings.theme).toBe('dark')
      expect(payload.settings.payday_frequency).toBe('MONTHLY')
      expect(payload.settings.api_token_encrypted).toBeUndefined()
    })
  })
})
