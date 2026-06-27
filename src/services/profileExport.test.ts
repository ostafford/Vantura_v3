import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SETTINGS_WHITELIST,
  FORBIDDEN_KEYS,
  buildExportPayload,
  encryptExportPayload,
  decryptImportFile,
  parseImportFile,
  previewImportProfile,
  applySettings,
  IMPORT_ERROR_INVALID_FILE,
  IMPORT_ERROR_WRONG_PASSPHRASE,
  type ExportPayload,
} from './profileExport'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
  getAppSetting: vi.fn(),
  setAppSetting: vi.fn(),
  schedulePersist: vi.fn(),
}))

const EMPTY_PAYLOAD: ExportPayload = {
  version: 1,
  exportedAt: new Date().toISOString(),
  appSchemaVersion: 2,
  settings: {},
  trackers: [],
  trackerCategories: [],
  upcomingCharges: [],
  budgetBuckets: [],
  budgetHypotheticals: [],
}

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

    it('notification preference keys are in SETTINGS_WHITELIST', () => {
      const notifKeys = [
        'notifications_enabled',
        'notif_bills',
        'notif_tracker_overspent',
        'notif_tracker_pace',
        'notif_spendable_low',
        'notif_payday',
        'notif_large_tx',
        'notif_saver_milestone',
        'notif_sync_stale',
        'notif_large_tx_threshold_cents',
      ]
      const wl = new Set(SETTINGS_WHITELIST)
      for (const key of notifKeys) {
        expect(wl.has(key), `${key} missing from whitelist`).toBe(true)
      }
    })

    it('payday_raw_text and payday_description are in SETTINGS_WHITELIST', () => {
      const wl = new Set(SETTINGS_WHITELIST)
      expect(wl.has('payday_raw_text')).toBe(true)
      expect(wl.has('payday_description')).toBe(true)
    })

    it('lock_timeout_minutes and saver_account_order are in SETTINGS_WHITELIST', () => {
      const wl = new Set(SETTINGS_WHITELIST)
      expect(wl.has('lock_timeout_minutes')).toBe(true)
      expect(wl.has('saver_account_order')).toBe(true)
    })
  })

  describe('encryptExportPayload and decryptImportFile', () => {
    it('round-trips payload correctly', async () => {
      const payload: ExportPayload = {
        ...EMPTY_PAYLOAD,
        version: 1,
        appSchemaVersion: 2,
        settings: { theme: 'dark', accent_color: 'teal' },
        budgetBuckets: [
          {
            id: 1,
            name: 'Food',
            colour: 'sky',
            icon: 'mdi-food',
            sort_order: 0,
          },
        ],
        budgetHypotheticals: [
          {
            bucket_id: 1,
            name: 'Lunch',
            amount_cents: 2000,
            frequency: 'WEEKLY',
            is_hypothetical: 0,
          },
        ],
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
      expect(decrypted.budgetBuckets).toEqual(payload.budgetBuckets)
      expect(decrypted.budgetHypotheticals).toEqual(payload.budgetHypotheticals)
    })

    it('decryptImportFile throws IMPORT_ERROR_WRONG_PASSPHRASE on wrong passphrase', async () => {
      const wrapper = await encryptExportPayload(EMPTY_PAYLOAD, 'correct-pass')
      await expect(decryptImportFile(wrapper, 'wrong-pass')).rejects.toThrow(
        IMPORT_ERROR_WRONG_PASSPHRASE
      )
    })

    it('decryptImportFile throws when appSchemaVersion exceeds current', async () => {
      const payload: ExportPayload = { ...EMPTY_PAYLOAD, appSchemaVersion: 99 }
      const wrapper = await encryptExportPayload(payload, 'pass')
      await expect(decryptImportFile(wrapper, 'pass')).rejects.toThrow(
        /newer app version/
      )
    })
  })

  describe('parseImportFile', () => {
    it('throws IMPORT_ERROR_INVALID_FILE when salt is missing', () => {
      expect(() =>
        parseImportFile({
          salt: '',
          iterations: 100000,
          ciphertext: 'abc',
          formatVersion: 1,
        })
      ).toThrow(IMPORT_ERROR_INVALID_FILE)
    })

    it('throws IMPORT_ERROR_INVALID_FILE when ciphertext is missing', () => {
      expect(() =>
        parseImportFile({
          salt: 'abc',
          iterations: 100000,
          ciphertext: '',
          formatVersion: 1,
        })
      ).toThrow(IMPORT_ERROR_INVALID_FILE)
    })

    it('throws IMPORT_ERROR_INVALID_FILE when iterations is not a number', () => {
      expect(() =>
        parseImportFile({
          salt: 'abc',
          iterations: '100000' as unknown as number,
          ciphertext: 'xyz',
          formatVersion: 1,
        })
      ).toThrow(IMPORT_ERROR_INVALID_FILE)
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
      expect(payload.budgetBuckets).toEqual([])
      expect(payload.budgetHypotheticals).toEqual([])
      expect(payload.settings).toEqual({})
    })

    it('includes only whitelisted settings', async () => {
      const db = await import('@/db')
      vi.mocked(db.getDb).mockReturnValue(null)
      vi.mocked(db.getAppSetting).mockImplementation((key) => {
        if (key === 'theme') return 'dark'
        if (key === 'payday_frequency') return 'MONTHLY'
        if (key === 'api_token_encrypted') return 'secret-value'
        if (key === 'lock_timeout_minutes') return '10'
        if (key === 'notifications_enabled') return '1'
        if (key === 'notif_large_tx_threshold_cents') return '50000'
        return null
      })

      const payload = buildExportPayload()

      expect(payload.settings.theme).toBeUndefined()
      expect(payload.settings.payday_frequency).toBe('MONTHLY')
      expect(payload.settings.api_token_encrypted).toBeUndefined()
      expect(payload.settings.lock_timeout_minutes).toBe('10')
      expect(payload.settings.notifications_enabled).toBe('1')
      expect(payload.settings.notif_large_tx_threshold_cents).toBe('50000')
    })
  })

  describe('previewImportProfile', () => {
    it('returns decrypted payload without writing', async () => {
      const payload: ExportPayload = {
        ...EMPTY_PAYLOAD,
        settings: { theme: 'light' },
        budgetBuckets: [
          {
            id: 1,
            name: 'Bills',
            colour: 'rose',
            icon: 'mdi-bill',
            sort_order: 0,
          },
        ],
      }
      const wrapper = await encryptExportPayload(payload, 'secret')
      const json = JSON.stringify(wrapper)
      const file = new File([json], 'test.json', {
        type: 'application/json',
      })

      const result = await previewImportProfile(file, 'secret')

      expect(result.settings).toEqual(payload.settings)
      expect(result.trackers).toEqual([])
      expect(result.budgetBuckets).toEqual(payload.budgetBuckets)
    })

    it('throws IMPORT_ERROR_WRONG_PASSPHRASE on wrong passphrase', async () => {
      const wrapper = await encryptExportPayload(EMPTY_PAYLOAD, 'correct')
      const file = new File([JSON.stringify(wrapper)], 'test.json', {
        type: 'application/json',
      })

      await expect(previewImportProfile(file, 'wrong')).rejects.toThrow(
        IMPORT_ERROR_WRONG_PASSPHRASE
      )
    })

    it('throws IMPORT_ERROR_INVALID_FILE for invalid JSON file', async () => {
      const file = new File(['not valid json'], 'test.json', {
        type: 'application/json',
      })

      await expect(previewImportProfile(file, 'any')).rejects.toThrow(
        IMPORT_ERROR_INVALID_FILE
      )
    })
  })

  describe('importPayloadWithOptions and applySettings', () => {
    it('applySettings updates only whitelisted keys', async () => {
      const db = await import('@/db')
      const setAppSettingMock = vi.mocked(db.setAppSetting)
      applySettings({ payday_frequency: 'WEEKLY' })
      expect(setAppSettingMock).toHaveBeenCalledWith(
        'payday_frequency',
        'WEEKLY'
      )
    })

    it('applySettings ignores non-whitelisted keys', async () => {
      const db = await import('@/db')
      const setAppSettingMock = vi.mocked(db.setAppSetting)
      applySettings({
        theme_mode: 'light',
        api_token_encrypted: 'evil',
      } as Record<string, string>)
      expect(setAppSettingMock).toHaveBeenCalledWith('theme_mode', 'light')
      expect(setAppSettingMock).not.toHaveBeenCalledWith(
        'api_token_encrypted',
        expect.anything()
      )
    })

    it('applySettings passes through saver_goal_date_* dynamic keys', async () => {
      const db = await import('@/db')
      const setAppSettingMock = vi.mocked(db.setAppSetting)
      applySettings({ saver_goal_date_abc123: '2027-06-01' })
      expect(setAppSettingMock).toHaveBeenCalledWith(
        'saver_goal_date_abc123',
        '2027-06-01'
      )
    })

    it('applySettings passes through notification preference keys', async () => {
      const db = await import('@/db')
      const setAppSettingMock = vi.mocked(db.setAppSetting)
      applySettings({
        notifications_enabled: '1',
        notif_large_tx: '0',
        notif_large_tx_threshold_cents: '30000',
        lock_timeout_minutes: '15',
      })
      expect(setAppSettingMock).toHaveBeenCalledWith(
        'notifications_enabled',
        '1'
      )
      expect(setAppSettingMock).toHaveBeenCalledWith('notif_large_tx', '0')
      expect(setAppSettingMock).toHaveBeenCalledWith(
        'notif_large_tx_threshold_cents',
        '30000'
      )
      expect(setAppSettingMock).toHaveBeenCalledWith(
        'lock_timeout_minutes',
        '15'
      )
    })
  })
})
