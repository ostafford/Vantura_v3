import { describe, it, expect, vi, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  SETTINGS_WHITELIST,
  FORBIDDEN_KEYS,
  buildExportPayload,
  encryptExportPayload,
  decryptImportFile,
  parseImportFile,
  previewImportProfile,
  applySettings,
  replaceBudgetPlan,
  replaceTrackers,
  replaceUpcomingCharges,
  replaceSaverGoals,
  replaceOnHandSavers,
  importPayloadWithOptions,
  describeSkippedSections,
  IMPORT_ERROR_INVALID_FILE,
  IMPORT_ERROR_INVALID_TRACKER_RESET,
  IMPORT_ERROR_WRONG_PASSPHRASE,
  type ExportPayload,
  type ImportOptions,
  type TrackerExportRow,
  type TrackerConfigHistoryExportRow,
  type UpcomingChargeExportRow,
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
}

const NOTIFICATION_KEYS = [
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
  'notif_possible_payday',
  'notif_possible_payday_suggested_for',
]

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

    it('no notification key is in SETTINGS_WHITELIST (#208)', () => {
      const wl = new Set(SETTINGS_WHITELIST)
      for (const key of NOTIFICATION_KEYS) {
        expect(wl.has(key), `${key} still whitelisted`).toBe(false)
      }
    })

    it('no Spendable alert or Essentials key is in SETTINGS_WHITELIST (#211)', () => {
      const wl = new Set(SETTINGS_WHITELIST)
      for (const key of [
        'spendable_alert_below_cents',
        'spendable_alert_below_pct_pay',
        'essentials_saver_account_id',
      ]) {
        expect(wl.has(key), `${key} still whitelisted`).toBe(false)
      }
    })

    it('leaves the nominated pay source out of an export (#194)', async () => {
      const db = await import('@/db')
      vi.mocked(db.getDb).mockReturnValue(null)
      vi.mocked(db.getAppSetting).mockImplementation((key) => {
        if (key === 'payday_raw_text') return 'SYNTHETIC EMPLOYER SALARY'
        if (key === 'payday_description') return 'Synthetic Employer'
        if (key === 'pay_amount_cents') return '250000'
        return null
      })

      const payload = buildExportPayload()

      expect(payload.settings).not.toHaveProperty('payday_raw_text')
      expect(payload.settings).not.toHaveProperty('payday_description')
      expect(payload.settings.pay_amount_cents).toBe('250000')
    })

    it('leaves every notification setting out of an export (#208)', async () => {
      const db = await import('@/db')
      vi.mocked(db.getDb).mockReturnValue(null)
      vi.mocked(db.getAppSetting).mockImplementation((key) => {
        if (NOTIFICATION_KEYS.includes(key)) return '1'
        if (key === 'pay_amount_cents') return '250000'
        return null
      })

      const payload = buildExportPayload()

      for (const key of NOTIFICATION_KEYS) {
        expect(payload.settings).not.toHaveProperty(key)
      }
      expect(payload.settings.pay_amount_cents).toBe('250000')
    })

    it('imports no notification setting from an older export (#208)', async () => {
      const db = await import('@/db')
      const setAppSettingMock = vi.mocked(db.setAppSetting)
      setAppSettingMock.mockClear()
      applySettings({
        ...Object.fromEntries(NOTIFICATION_KEYS.map((key) => [key, '1'])),
        pay_amount_cents: '250000',
      })
      expect(setAppSettingMock).toHaveBeenCalledWith(
        'pay_amount_cents',
        '250000'
      )
      for (const key of NOTIFICATION_KEYS) {
        expect(setAppSettingMock).not.toHaveBeenCalledWith(
          key,
          expect.anything()
        )
      }
    })

    it('silently skips the nominated pay source when importing an older export (#194)', async () => {
      const db = await import('@/db')
      const setAppSettingMock = vi.mocked(db.setAppSetting)
      setAppSettingMock.mockClear()
      applySettings({
        payday_raw_text: 'SYNTHETIC EMPLOYER SALARY',
        payday_description: 'Synthetic Employer',
        pay_amount_cents: '250000',
      })
      expect(setAppSettingMock).toHaveBeenCalledWith(
        'pay_amount_cents',
        '250000'
      )
      expect(setAppSettingMock).not.toHaveBeenCalledWith(
        'payday_raw_text',
        expect.anything()
      )
      expect(setAppSettingMock).not.toHaveBeenCalledWith(
        'payday_description',
        expect.anything()
      )
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
            icon: 'mdi-food',
            sort_order: 0,
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
    })

    it('decryptImportFile throws IMPORT_ERROR_WRONG_PASSPHRASE on wrong passphrase', async () => {
      const wrapper = await encryptExportPayload(EMPTY_PAYLOAD, 'correct-pass')
      await expect(decryptImportFile(wrapper, 'wrong-pass')).rejects.toThrow(
        IMPORT_ERROR_WRONG_PASSPHRASE
      )
    })

    it('decryptImportFile throws when appSchemaVersion exceeds current', async () => {
      const payload: ExportPayload = { ...EMPTY_PAYLOAD, appSchemaVersion: 99 }
      const wrapper = await encryptExportPayload(payload, 'pass-phrase-1234')
      await expect(
        decryptImportFile(wrapper, 'pass-phrase-1234')
      ).rejects.toThrow(/newer app version/)
    })

    it('encryptExportPayload rejects a passphrase shorter than the minimum (#32)', async () => {
      await expect(
        encryptExportPayload(EMPTY_PAYLOAD, 'short')
      ).rejects.toThrow(/at least/)
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
      expect(payload.settings.notifications_enabled).toBeUndefined()
      expect(payload.settings.notif_large_tx_threshold_cents).toBeUndefined()
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
            icon: 'mdi-bill',
            sort_order: 0,
          },
        ],
      }
      const wrapper = await encryptExportPayload(payload, 'secret-phrase-123')
      const json = JSON.stringify(wrapper)
      const file = new File([json], 'test.json', {
        type: 'application/json',
      })

      const result = await previewImportProfile(file, 'secret-phrase-123')

      expect(result.settings).toEqual(payload.settings)
      expect(result.trackers).toEqual([])
      expect(result.budgetBuckets).toEqual(payload.budgetBuckets)
    })

    it('throws IMPORT_ERROR_WRONG_PASSPHRASE on wrong passphrase', async () => {
      const wrapper = await encryptExportPayload(
        EMPTY_PAYLOAD,
        'correct-phrase-12'
      )
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

    it('applySettings strips the cut Weekly Insights section from an older export’s section order (#206)', async () => {
      const db = await import('@/db')
      const setAppSettingMock = vi.mocked(db.setAppSetting)
      setAppSettingMock.mockClear()
      applySettings({
        dashboard_section_order: JSON.stringify([
          'trackers',
          'insights',
          'month_summary',
          'upcoming',
        ]),
      })
      expect(setAppSettingMock).toHaveBeenCalledWith(
        'dashboard_section_order',
        JSON.stringify(['trackers', 'month_summary', 'upcoming'])
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

    it('applySettings ignores retired saver_goal_date_* keys (moved to saverGoals in v6)', async () => {
      const db = await import('@/db')
      const setAppSettingMock = vi.mocked(db.setAppSetting)
      applySettings({ saver_goal_date_abc123: '2027-06-01' })
      expect(setAppSettingMock).not.toHaveBeenCalledWith(
        'saver_goal_date_abc123',
        expect.anything()
      )
    })
  })
})

describe('replaceBudgetPlan after the anchors table is dropped (#210)', () => {
  let SQL: SqlJsStatic
  let realDb: Database

  beforeEach(async () => {
    SQL = await initSqlJs()
    const { runSchema } = await import('@/db/schema')
    realDb = new SQL.Database()
    runSchema(realDb)

    const db = await import('@/db')
    vi.mocked(db.getDb).mockReturnValue(realDb as never)
    vi.mocked(db.schedulePersist).mockImplementation(() => {})
  })

  const tableExists = (name: string) =>
    realDb.exec(
      `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [name]
    ).length > 0

  it('replaces the buckets on a database with no anchors table', () => {
    expect(tableExists('budget_transaction_anchors')).toBe(false)
    realDb.run(
      `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES ('Old', 'mdi-wallet', 0, '2026-01-01')`
    )

    const map = replaceBudgetPlan([
      { id: 999, name: 'Bills', icon: 'mdi-wallet', sort_order: 0 },
    ])

    expect(
      realDb.exec(`SELECT id, name FROM budget_buckets`)[0].values
    ).toEqual([[map.get(999), 'Bills']])
  })

  it('exports no anchors or future-items section', () => {
    realDb.run(
      `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES ('Bills', 'mdi-wallet', 0, '2026-01-01')`
    )
    const keys = Object.keys(buildExportPayload())
    expect(keys.some((k) => /anchor/i.test(k))).toBe(false)
    expect(keys.some((k) => /future/i.test(k))).toBe(false)
  })

  it('imports an older export carrying a stray anchors section, writing nothing for it', () => {
    const older = {
      version: 12,
      exportedAt: '2026-02-15T00:00:00.000Z',
      appSchemaVersion: 50,
      settings: {},
      trackers: [],
      trackerCategories: [],
      upcomingCharges: [],
      budgetBuckets: [
        { id: 4, name: 'Bills', icon: 'mdi-wallet', sort_order: 0 },
      ],
      budget_transaction_anchors: [
        { bucket_id: 4, transaction_id: 'tx-1', description_pattern: 'X' },
      ],
    } as unknown as ExportPayload

    expect(() =>
      importPayloadWithOptions(older, {
        settings: true,
        trackers: true,
        upcomingCharges: true,
        budgetPlan: true,
      })
    ).not.toThrow()
    expect(realDb.exec(`SELECT name FROM budget_buckets`)[0].values).toEqual([
      ['Bills'],
    ])
    expect(tableExists('budget_transaction_anchors')).toBe(false)
  })
})

/**
 * #36 — real-DB coverage for the import writers that had none:
 * replaceTrackers, replaceUpcomingCharges, and the importPayloadWithOptions
 * orchestrator. Each runs delete-then-reinsert against a live in-memory
 * sql.js DB, so id remapping,
 * category-existence filtering, config-history synthesis and per-section
 * option gating are exercised for real rather than mocked.
 */
describe('profile import writers: real-DB coverage (#36)', () => {
  let SQL: SqlJsStatic
  let realDb: Database

  beforeEach(async () => {
    SQL = await initSqlJs()
    const { runSchema } = await import('@/db/schema')
    realDb = new SQL.Database()
    runSchema(realDb)

    const db = await import('@/db')
    vi.mocked(db.getDb).mockReturnValue(realDb as never)
    vi.mocked(db.schedulePersist).mockImplementation(() => {})
  })

  // ── fixtures & readback helpers ─────────────────────────────────────────

  function insertCategory(id: string, name = id): void {
    realDb.run(
      `INSERT INTO categories (id, name, parent_id) VALUES (?, ?, NULL)`,
      [id, name]
    )
  }

  function trackerExport(
    over: Partial<TrackerExportRow> = {}
  ): TrackerExportRow {
    return {
      id: 1,
      name: 'Food',
      budget_amount: 30000,
      reset_frequency: 'MONTHLY',
      reset_day: 1,
      start_date: '2026-01-01',
      last_reset_date: '2026-02-01',
      next_reset_date: '2026-03-01',
      is_active: 1,
      bucket_id: null,
      ...over,
    }
  }

  function chargeExport(
    over: Partial<UpcomingChargeExportRow> = {}
  ): UpcomingChargeExportRow {
    return {
      name: 'Rent',
      amount: 180000,
      frequency: 'MONTHLY',
      next_charge_date: '2026-03-01',
      category_id: null,
      ...over,
    }
  }

  function emptyPayload(over: Partial<ExportPayload> = {}): ExportPayload {
    return {
      version: 1,
      exportedAt: '2026-02-15T00:00:00.000Z',
      appSchemaVersion: 2,
      settings: {},
      trackers: [],
      trackerCategories: [],
      upcomingCharges: [],
      budgetBuckets: [],
      ...over,
    }
  }

  const ALL_ON: ImportOptions = {
    settings: true,
    trackers: true,
    upcomingCharges: true,
    budgetPlan: true,
  }

  // ── #204: Hypothetical lines are cut ────────────────────────────────────

  it('exports no hypothetical-lines section (#204)', () => {
    realDb.run(
      `INSERT INTO budget_buckets (name, icon, sort_order, created_at)
       VALUES ('Household', 'mdi-home', 0, '2026-01-01')`
    )
    const payload = buildExportPayload()
    expect(payload.budgetBuckets.map((b) => b.name)).toEqual(['Household'])
    expect(Object.keys(payload)).not.toContain('budgetHypotheticals')
  })

  /** A v9-or-earlier payload, which still carries hypothetical lines. */
  function olderExportWithHypotheticals(): ExportPayload {
    return {
      ...emptyPayload({
        version: 9,
        budgetBuckets: [
          { id: 3, name: 'Household', icon: 'mdi-home', sort_order: 0 },
        ],
      }),
      budgetHypotheticals: [
        {
          bucket_id: 3,
          name: 'Maybe gym',
          amount_cents: 8000,
          frequency: 'MONTHLY',
          is_hypothetical: 1,
        },
        {
          bucket_id: 3,
          name: 'Maybe streaming',
          amount_cents: 1500,
          frequency: 'MONTHLY',
          is_hypothetical: 1,
        },
      ],
    } as ExportPayload
  }

  it('imports an older export that still has hypothetical lines, skipping them (#204)', () => {
    importPayloadWithOptions(olderExportWithHypotheticals(), ALL_ON)
    expect(
      realDb.exec(`SELECT name, icon FROM budget_buckets`)[0].values
    ).toEqual([['Household', 'mdi-home']])
  })

  describe('describeSkippedSections (#204, #208)', () => {
    it('names the hypothetical lines an older export carries, since they are not imported', () => {
      expect(describeSkippedSections(olderExportWithHypotheticals())).toBe(
        'Skipped 2 hypothetical lines. Vantura no longer has them.'
      )
    })

    it('uses the singular for one line', () => {
      const payload = olderExportWithHypotheticals() as ExportPayload & {
        budgetHypotheticals: unknown[]
      }
      payload.budgetHypotheticals = payload.budgetHypotheticals.slice(0, 1)
      expect(describeSkippedSections(payload)).toBe(
        'Skipped 1 hypothetical line. Vantura no longer has them.'
      )
    })

    it('says the notification settings were skipped when an older export carries any (#208)', () => {
      expect(
        describeSkippedSections({
          ...emptyPayload(),
          settings: { notif_bills: '1', pay_amount_cents: '250000' },
        })
      ).toBe('Skipped your notification settings. Vantura no longer has them.')
    })

    it('lists every skipped kind together', () => {
      const payload = olderExportWithHypotheticals()
      payload.settings = { ...payload.settings, notifications_enabled: '1' }
      expect(describeSkippedSections(payload)).toBe(
        'Skipped 2 hypothetical lines. Vantura no longer has them. ' +
          'Skipped your notification settings. Vantura no longer has them.'
      )
    })

    it('is null when nothing is skipped: a current export, or an empty section', () => {
      expect(describeSkippedSections(emptyPayload())).toBeNull()
      expect(
        describeSkippedSections({
          ...emptyPayload(),
          budgetHypotheticals: [],
        } as ExportPayload)
      ).toBeNull()
    })
  })

  function readTrackers(): Array<{
    id: number
    name: string
    budget_amount: number
    bucket_id: number | null
    last_reset_date: string
  }> {
    const stmt = realDb.prepare(
      `SELECT id, name, budget_amount, bucket_id, last_reset_date FROM trackers ORDER BY id`
    )
    const out: Array<{
      id: number
      name: string
      budget_amount: number
      bucket_id: number | null
      last_reset_date: string
    }> = []
    while (stmt.step()) {
      const r = stmt.get() as [number, string, number, number | null, string]
      out.push({
        id: r[0],
        name: r[1],
        budget_amount: r[2],
        bucket_id: r[3],
        last_reset_date: r[4],
      })
    }
    stmt.free()
    return out
  }

  function trackerCategoryIds(trackerId: number): string[] {
    const stmt = realDb.prepare(
      `SELECT category_id FROM tracker_categories WHERE tracker_id = ? ORDER BY category_id`
    )
    stmt.bind([trackerId])
    const out: string[] = []
    while (stmt.step()) out.push(stmt.get()[0] as string)
    stmt.free()
    return out
  }

  function configHistory(
    trackerId: number
  ): Array<{ id: number; effective_from: string; budget_amount: number }> {
    const stmt = realDb.prepare(
      `SELECT id, effective_from, budget_amount FROM tracker_config_history
       WHERE tracker_id = ? ORDER BY effective_from`
    )
    stmt.bind([trackerId])
    const out: Array<{
      id: number
      effective_from: string
      budget_amount: number
    }> = []
    while (stmt.step()) {
      const r = stmt.get() as [number, string, number]
      out.push({ id: r[0], effective_from: r[1], budget_amount: r[2] })
    }
    stmt.free()
    return out
  }

  function configHistoryCategoryIds(configId: number): string[] {
    const stmt = realDb.prepare(
      `SELECT category_id FROM tracker_config_history_categories
       WHERE config_id = ? ORDER BY category_id`
    )
    stmt.bind([configId])
    const out: string[] = []
    while (stmt.step()) out.push(stmt.get()[0] as string)
    stmt.free()
    return out
  }

  function readCharges(): Array<{
    name: string
    category_id: string | null
    reminder_days_before: number | null
    cancel_by_date: string | null
    bucket_id: number | null
    next_charge_date: string
  }> {
    const stmt = realDb.prepare(
      `SELECT name, category_id, reminder_days_before, cancel_by_date, bucket_id, next_charge_date
       FROM upcoming_charges ORDER BY id`
    )
    const out: Array<{
      name: string
      category_id: string | null
      reminder_days_before: number | null
      cancel_by_date: string | null
      bucket_id: number | null
      next_charge_date: string
    }> = []
    while (stmt.step()) {
      const r = stmt.get() as [
        string,
        string | null,
        number | null,
        string | null,
        number | null,
        string,
      ]
      out.push({
        name: r[0],
        category_id: r[1],
        reminder_days_before: r[2],
        cancel_by_date: r[3],
        bucket_id: r[4],
        next_charge_date: r[5],
      })
    }
    stmt.free()
    return out
  }

  // ── replaceTrackers ────────────────────────────────────────────────────

  describe('replaceTrackers', () => {
    it('wipes existing trackers, categories and config-history, then inserts the imported set with fresh ids', () => {
      insertCategory('groceries')
      realDb.run(
        `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at)
         VALUES ('Old', 5000, 'WEEKLY', 1, '2026-01-01', '2026-02-01', '2026-02-08', 1, '2026-01-01')`
      )
      const oldId = realDb.exec('SELECT last_insert_rowid()')[0]
        .values[0][0] as number
      realDb.run(
        `INSERT INTO tracker_categories (tracker_id, category_id) VALUES (?, 'groceries')`,
        [oldId]
      )
      realDb.run(
        `INSERT INTO tracker_config_history (tracker_id, effective_from, budget_amount, created_at)
         VALUES (?, '2026-02-01', 5000, '2026-01-01')`,
        [oldId]
      )

      replaceTrackers([trackerExport({ id: 5, name: 'Imported' })], [])

      const rows = readTrackers()
      expect(rows).toHaveLength(1)
      expect(rows[0].name).toBe('Imported')
      expect(rows[0].id).not.toBe(oldId)
      expect(trackerCategoryIds(oldId)).toEqual([])
      expect(configHistory(oldId)).toEqual([])
    })

    it('remaps bucket_id through the provided map and nulls references the map does not cover', () => {
      replaceTrackers(
        [
          trackerExport({ id: 1, name: 'Mapped', bucket_id: 10 }),
          trackerExport({ id: 2, name: 'Unmapped', bucket_id: 99 }),
          trackerExport({ id: 3, name: 'NoBucket', bucket_id: null }),
        ],
        [],
        [],
        new Map([[10, 777]])
      )

      const byName = Object.fromEntries(
        readTrackers().map((t) => [t.name, t.bucket_id])
      )
      expect(byName).toEqual({ Mapped: 777, Unmapped: null, NoBucket: null })
    })

    it('remaps tracker_categories onto new tracker ids and drops categories that do not exist locally', () => {
      insertCategory('groceries')

      replaceTrackers(
        [trackerExport({ id: 1 })],
        [
          { tracker_id: 1, category_id: 'groceries' },
          { tracker_id: 1, category_id: 'ghost' },
          { tracker_id: 999, category_id: 'groceries' },
        ]
      )

      const newId = readTrackers()[0].id
      expect(trackerCategoryIds(newId)).toEqual(['groceries'])
    })

    it('imports config-history rows, remapping tracker ids and filtering unknown categories', () => {
      insertCategory('groceries')

      const history: TrackerConfigHistoryExportRow[] = [
        {
          tracker_id: 1,
          effective_from: '2026-01-20',
          budget_amount: 22000,
          category_ids: ['groceries', 'ghost'],
        },
      ]
      replaceTrackers(
        [trackerExport({ id: 1, budget_amount: 30000 })],
        [{ tracker_id: 1, category_id: 'groceries' }],
        history
      )

      const newId = readTrackers()[0].id
      const rows = configHistory(newId)
      expect(rows).toEqual([
        expect.objectContaining({
          effective_from: '2026-01-20',
          budget_amount: 22000,
        }),
      ])
      expect(configHistoryCategoryIds(rows[0].id)).toEqual(['groceries'])
    })

    it('synthesises one genesis config row per tracker when the payload carries no history (pre-v4 export)', () => {
      insertCategory('groceries')

      replaceTrackers(
        [
          trackerExport({
            id: 1,
            budget_amount: 30000,
            last_reset_date: '2026-02-01',
          }),
        ],
        [{ tracker_id: 1, category_id: 'groceries' }]
      )

      const newId = readTrackers()[0].id
      const rows = configHistory(newId)
      expect(rows).toEqual([
        expect.objectContaining({
          effective_from: '2026-02-01',
          budget_amount: 30000,
        }),
      ])
      expect(configHistoryCategoryIds(rows[0].id)).toEqual(['groceries'])
    })

    it('skips structurally invalid tracker rows without aborting the rest', () => {
      replaceTrackers(
        [
          { id: 1, name: 'Valid' } as unknown as TrackerExportRow,
          { ...trackerExport({ id: 2, name: 'AlsoValid' }) },
          {
            ...trackerExport({ id: 3 }),
            budget_amount: 'nope' as unknown as number,
          },
        ],
        []
      )

      // id:1 is missing budget_amount/reset_frequency; id:3 has a non-number
      // budget — both dropped, id:2 survives.
      expect(readTrackers().map((t) => t.name)).toEqual(['AlsoValid'])
    })
  })

  // ── replaceUpcomingCharges ─────────────────────────────────────────────

  describe('replaceUpcomingCharges', () => {
    it("round-trips a Regular's payment link (docs/adr/0020) and leaves a file without one unlinked", () => {
      realDb.run(
        `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at, match_raw_text, match_description)
         VALUES ('Oura', 1000, 'MONTHLY', '2026-03-23', '2026-01-01', 'OURARING, OULU', 'Oura')`
      )
      const exported = buildExportPayload().upcomingCharges

      replaceUpcomingCharges([
        ...exported,
        chargeExport({ name: 'From an older file' }),
      ])

      const rows = realDb.exec(
        `SELECT name, match_description FROM upcoming_charges ORDER BY id`
      )[0].values
      expect(rows).toEqual([
        ['Oura', 'Oura'],
        ['From an older file', null],
      ])
    })

    it('wipes existing charges and inserts the imported set', () => {
      realDb.run(
        `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at)
         VALUES ('Stale', 100, 'MONTHLY', '2026-01-01', '2026-01-01')`
      )

      replaceUpcomingCharges([chargeExport({ name: 'Fresh' })])

      expect(readCharges().map((c) => c.name)).toEqual(['Fresh'])
    })

    it('remaps bucket_id through the map and nulls references the map does not cover', () => {
      replaceUpcomingCharges(
        [
          chargeExport({ name: 'Mapped', bucket_id: 3 }),
          chargeExport({ name: 'Unmapped', bucket_id: 42 }),
          chargeExport({ name: 'NoBucket' }),
        ],
        new Map([[3, 555]])
      )

      const byName = Object.fromEntries(
        readCharges().map((c) => [c.name, c.bucket_id])
      )
      expect(byName).toEqual({ Mapped: 555, Unmapped: null, NoBucket: null })
    })

    it('keeps category_id only when the category exists locally, otherwise stores null', () => {
      insertCategory('rent')

      replaceUpcomingCharges([
        chargeExport({ name: 'Real', category_id: 'rent' }),
        chargeExport({ name: 'Ghost', category_id: 'does-not-exist' }),
      ])

      const byName = Object.fromEntries(
        readCharges().map((c) => [c.name, c.category_id])
      )
      expect(byName).toEqual({ Real: 'rent', Ghost: null })
    })

    it('applies field defaults and trims next_charge_date to a plain date', () => {
      replaceUpcomingCharges([
        {
          name: 'Minimal',
          amount: 1200,
          frequency: 'WEEKLY',
          next_charge_date: '2026-05-01T12:34:56.000Z',
        } as UpcomingChargeExportRow,
      ])

      expect(readCharges()[0]).toEqual(
        expect.objectContaining({
          name: 'Minimal',
          reminder_days_before: null,
          cancel_by_date: null,
          next_charge_date: '2026-05-01',
        })
      )
    })

    it('skips structurally invalid charge rows', () => {
      replaceUpcomingCharges([
        {
          name: 'NoAmount',
          frequency: 'MONTHLY',
          next_charge_date: '2026-01-01',
        } as unknown as UpcomingChargeExportRow,
        chargeExport({ name: 'Good' }),
      ])

      expect(readCharges().map((c) => c.name)).toEqual(['Good'])
    })
  })

  // ── importPayloadWithOptions ──────────────────────────────────────────

  describe('importPayloadWithOptions', () => {
    it('refuses a file with a MONTHLY tracker reset_day past 28 and writes nothing (#150)', () => {
      realDb.run(
        `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at)
         VALUES ('Keep me', 9999, 'MONTHLY', 5, '2026-01-01', '2026-02-05', '2026-03-05', 1, '2026-01-01')`
      )

      expect(() =>
        importPayloadWithOptions(
          emptyPayload({
            budgetBuckets: [
              { id: 7, name: 'Bills', icon: 'mdi-wallet', sort_order: 0 },
            ],
            trackers: [
              trackerExport({ reset_frequency: 'MONTHLY', reset_day: 31 }),
            ],
          }),
          ALL_ON
        )
      ).toThrow(IMPORT_ERROR_INVALID_TRACKER_RESET)

      // The whole import rolled back: local tracker kept, bucket not added.
      expect(readTrackers().map((t) => t.name)).toEqual(['Keep me'])
      expect(
        realDb.exec(`SELECT COUNT(*) FROM budget_buckets`)[0].values[0][0]
      ).toBe(0)
    })

    it('refuses a tracker with an unknown reset_frequency (#150)', () => {
      expect(() =>
        importPayloadWithOptions(
          emptyPayload({
            trackers: [
              trackerExport({ reset_frequency: 'YEARLY', reset_day: 1 }),
            ],
          }),
          ALL_ON
        )
      ).toThrow(IMPORT_ERROR_INVALID_TRACKER_RESET)
      expect(readTrackers()).toEqual([])
    })

    it('accepts every reset_day the app itself writes (#150)', () => {
      importPayloadWithOptions(
        emptyPayload({
          trackers: [
            trackerExport({
              id: 1,
              name: 'W',
              reset_frequency: 'WEEKLY',
              reset_day: 7,
            }),
            trackerExport({
              id: 2,
              name: 'M',
              reset_frequency: 'MONTHLY',
              reset_day: 28,
            }),
          ],
        }),
        ALL_ON
      )
      expect(
        readTrackers()
          .map((t) => t.name)
          .sort()
      ).toEqual(['M', 'W'])
    })

    it("imports an older export's PAYDAY tracker as MONTHLY day 1 on the current calendar month, with its config history as MONTHLY (#192)", () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 2, 15, 10, 0, 0))
      try {
        importPayloadWithOptions(
          emptyPayload({
            trackers: [
              trackerExport({
                id: 3,
                name: 'P',
                reset_frequency: 'PAYDAY',
                reset_day: null,
                start_date: '2025-11-20',
                last_reset_date: '2026-02-20',
                next_reset_date: '2026-03-20',
              }),
            ],
            trackerConfigHistory: [
              {
                tracker_id: 3,
                effective_from: '2025-11-20',
                budget_amount: 40000,
                category_ids: [],
              },
              {
                tracker_id: 3,
                effective_from: '2026-01-20',
                budget_amount: 30000,
                category_ids: [],
                reset_frequency: 'PAYDAY',
              },
            ],
          }),
          ALL_ON
        )
      } finally {
        vi.useRealTimers()
      }
      expect(
        realDb.exec(
          `SELECT name, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date FROM trackers`
        )[0].values
      ).toEqual([['P', 'MONTHLY', 1, '2025-11-20', '2026-03-01', '2026-04-01']])
      expect(
        realDb.exec(
          `SELECT effective_from, budget_amount, reset_frequency FROM tracker_config_history ORDER BY effective_from`
        )[0].values
      ).toEqual([
        ['2025-11-20', 40000, null],
        ['2026-01-20', 30000, 'MONTHLY'],
      ])
    })

    it('applies the budget plan before trackers so payload bucket_ids remap onto the freshly-inserted local buckets', () => {
      const payload = emptyPayload({
        budgetBuckets: [
          { id: 7, name: 'Bills', icon: 'mdi-wallet', sort_order: 0 },
        ],
        trackers: [trackerExport({ id: 1, name: 'Rent watch', bucket_id: 7 })],
      })

      importPayloadWithOptions(payload, ALL_ON)

      const newBucketId = realDb.exec(
        `SELECT id FROM budget_buckets WHERE name = 'Bills'`
      )[0].values[0][0] as number
      expect(readTrackers()[0].bucket_id).toBe(newBucketId)
    })

    it('leaves existing data untouched for sections whose option is false', () => {
      realDb.run(
        `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at)
         VALUES ('Keep me', 9999, 'MONTHLY', 1, '2026-01-01', '2026-02-01', '2026-03-01', 1, '2026-01-01')`
      )

      importPayloadWithOptions(
        emptyPayload({
          trackers: [trackerExport({ id: 1, name: 'Should not appear' })],
          upcomingCharges: [chargeExport({ name: 'Should not appear' })],
        }),
        {
          settings: false,
          trackers: false,
          upcomingCharges: false,
          budgetPlan: false,
        }
      )

      expect(readTrackers().map((t) => t.name)).toEqual(['Keep me'])
      expect(readCharges()).toEqual([])
    })

    it('with budgetPlan disabled, tracker and charge bucket references resolve to null (empty id map)', () => {
      importPayloadWithOptions(
        emptyPayload({
          trackers: [trackerExport({ id: 1, bucket_id: 7 })],
          upcomingCharges: [chargeExport({ name: 'C', bucket_id: 7 })],
        }),
        {
          settings: false,
          trackers: true,
          upcomingCharges: true,
          budgetPlan: false,
        }
      )

      expect(readTrackers()[0].bucket_id).toBeNull()
      expect(readCharges()[0].bucket_id).toBeNull()
    })

    it('imports a full payload coherently, with cross-references intact', () => {
      insertCategory('groceries')
      insertCategory('rent')

      const payload = emptyPayload({
        budgetBuckets: [
          { id: 2, name: 'Essentials', icon: 'mdi-wallet', sort_order: 0 },
        ],
        trackers: [trackerExport({ id: 1, name: 'Grocery run', bucket_id: 2 })],
        trackerCategories: [{ tracker_id: 1, category_id: 'groceries' }],
        upcomingCharges: [
          chargeExport({ name: 'Rent', category_id: 'rent', bucket_id: 2 }),
        ],
      })

      importPayloadWithOptions(payload, ALL_ON)

      const bucketId = realDb.exec(
        `SELECT id FROM budget_buckets WHERE name = 'Essentials'`
      )[0].values[0][0] as number
      const tracker = readTrackers()[0]
      expect(tracker.name).toBe('Grocery run')
      expect(tracker.bucket_id).toBe(bucketId)
      expect(trackerCategoryIds(tracker.id)).toEqual(['groceries'])
      // every tracker ends up with a config-history row (genesis synthesised here)
      expect(configHistory(tracker.id)).toHaveLength(1)

      const charge = readCharges()[0]
      expect(charge).toEqual(
        expect.objectContaining({
          name: 'Rent',
          category_id: 'rent',
          bucket_id: bucketId,
        })
      )
    })
  })

  // ── #35: importPayloadWithOptions is wrapped in one transaction ─────────

  describe('importPayloadWithOptions: transactional rollback (#35)', () => {
    /**
     * A corrupted export could carry a non-scalar where a scalar is expected;
     * sql.js throws when it tries to bind one. Here `reset_day` is an object,
     * so `replaceTrackers` throws mid-import — after `replaceBudgetPlan` has
     * already deleted and rewritten `budget_buckets`.
     */
    function payloadThatThrowsInTrackers(): ExportPayload {
      return emptyPayload({
        budgetBuckets: [
          { id: 1, name: 'Imported', icon: 'mdi-wallet', sort_order: 0 },
        ],
        trackers: [
          {
            ...trackerExport({ id: 1, name: 'Bad' }),
            reset_day: {} as unknown as number,
          },
        ],
      })
    }

    it('rolls the DB back to its pre-import state when a section throws partway', () => {
      realDb.run(
        `INSERT INTO budget_buckets (name, icon, sort_order, created_at)
         VALUES ('Existing', 'mdi-wallet', 0, '2026-01-01')`
      )
      realDb.run(
        `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at)
         VALUES ('Existing charge', 1000, 'MONTHLY', '2026-01-01', '2026-01-01')`
      )

      expect(() =>
        importPayloadWithOptions(payloadThatThrowsInTrackers(), ALL_ON)
      ).toThrow()

      // replaceBudgetPlan's DELETE + reinsert was undone.
      const bucketNames = (
        realDb.exec(`SELECT name FROM budget_buckets`)[0]?.values ?? []
      ).map((r) => r[0])
      expect(bucketNames).toEqual(['Existing'])
      // The section that never ran is untouched.
      expect(readCharges().map((c) => c.name)).toEqual(['Existing charge'])
      // No partial tracker rows.
      expect(readTrackers()).toEqual([])
    })

    it('leaves no transaction open after a rollback', () => {
      expect(() =>
        importPayloadWithOptions(payloadThatThrowsInTrackers(), ALL_ON)
      ).toThrow()

      // A still-open transaction would make this BEGIN throw
      // ("cannot start a transaction within a transaction").
      expect(() => realDb.run('BEGIN')).not.toThrow()
      realDb.run('ROLLBACK')
    })

    it('commits every section when the import completes without error', () => {
      insertCategory('groceries')
      realDb.run(
        `INSERT INTO budget_buckets (name, icon, sort_order, created_at)
         VALUES ('Stale', 'mdi-wallet', 0, '2026-01-01')`
      )

      importPayloadWithOptions(
        emptyPayload({
          budgetBuckets: [
            { id: 1, name: 'Fresh', icon: 'mdi-wallet', sort_order: 0 },
          ],
          trackers: [trackerExport({ id: 1, name: 'T', bucket_id: 1 })],
          trackerCategories: [{ tracker_id: 1, category_id: 'groceries' }],
          upcomingCharges: [chargeExport({ name: 'C' })],
        }),
        ALL_ON
      )

      const bucketNames = realDb
        .exec(`SELECT name FROM budget_buckets`)[0]
        .values.map((r) => r[0])
      expect(bucketNames).toEqual(['Fresh'])
      expect(readTrackers().map((t) => t.name)).toEqual(['T'])
      expect(readCharges().map((c) => c.name)).toEqual(['C'])
      // Transaction was closed by COMMIT, not left dangling.
      expect(() => realDb.run('BEGIN')).not.toThrow()
      realDb.run('ROLLBACK')
    })
  })

  describe('Saver goal history export/import (#29)', () => {
    function insertSaver(id: string, balance: number, target: number | null) {
      realDb.run(
        `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, target_amount_cents)
         VALUES (?, ?, 'SAVER', ?, '2026-01-01', '2026-01-01', ?)`,
        [id, id, balance, target]
      )
    }
    function insertGoal(
      saverId: string,
      amount: number,
      opts: {
        date?: string | null
        achieved?: string | null
        archived?: string | null
      } = {}
    ) {
      realDb.run(
        `INSERT INTO saver_goal_history
           (saver_id, goal_amount_cents, goal_date, created_at, achieved_at, archived_at)
         VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z', ?, ?)`,
        [
          saverId,
          amount,
          opts.date ?? null,
          opts.achieved ?? null,
          opts.archived ?? null,
        ]
      )
    }
    function readGoals() {
      const stmt = realDb.prepare(
        `SELECT saver_id, goal_amount_cents, goal_date, achieved_at, archived_at
         FROM saver_goal_history ORDER BY saver_id, goal_amount_cents`
      )
      const out: unknown[][] = []
      while (stmt.step()) out.push(stmt.get() as unknown[])
      stmt.free()
      return out
    }

    it('buildExportPayload carries every saver_goal_history row minus the local id', () => {
      insertSaver('sav-1', 500000, 400000)
      insertGoal('sav-1', 300000, {
        achieved: '2026-03-01',
        archived: '2026-04-01',
      })
      insertGoal('sav-1', 400000, { date: '2026-12-01' })

      const payload = buildExportPayload()
      expect(payload.version).toBe(19)
      expect(payload.saverGoals).toEqual([
        {
          saver_id: 'sav-1',
          goal_amount_cents: 300000,
          goal_date: null,
          created_at: '2026-01-01T00:00:00.000Z',
          achieved_at: '2026-03-01',
          archived_at: '2026-04-01',
        },
        {
          saver_id: 'sav-1',
          goal_amount_cents: 400000,
          goal_date: '2026-12-01',
          created_at: '2026-01-01T00:00:00.000Z',
          achieved_at: null,
          archived_at: null,
        },
      ])
      expect(payload.saverGoals?.[0]).not.toHaveProperty('id')
    })

    it('replaceSaverGoals wipes and reinserts, re-mirroring target_amount_cents from the open row', () => {
      insertSaver('sav-1', 500000, 999999) // stale mirror
      insertSaver('sav-2', 10000, 111111)
      insertGoal('sav-1', 111, {}) // pre-existing junk to be wiped

      replaceSaverGoals([
        {
          saver_id: 'sav-1',
          goal_amount_cents: 300000,
          goal_date: null,
          created_at: '2026-01-01T00:00:00.000Z',
          achieved_at: '2026-03-01',
          archived_at: '2026-04-01',
        },
        {
          saver_id: 'sav-1',
          goal_amount_cents: 400000,
          goal_date: '2026-12-01',
          created_at: '2026-05-01T00:00:00.000Z',
          achieved_at: null,
          archived_at: null,
        },
      ])

      expect(readGoals()).toEqual([
        ['sav-1', 300000, null, '2026-03-01', '2026-04-01'],
        ['sav-1', 400000, '2026-12-01', null, null],
      ])
      // sav-1's mirror follows its open goal; sav-2 (no goal in the import) is cleared.
      const t = realDb.exec(
        `SELECT id, target_amount_cents FROM accounts WHERE account_type = 'SAVER' ORDER BY id`
      )
      expect(t[0].values).toEqual([
        ['sav-1', 400000],
        ['sav-2', null],
      ])
    })

    it('skips structurally invalid rows', () => {
      insertSaver('sav-1', 1, null)
      replaceSaverGoals([
        {
          saver_id: '',
          goal_amount_cents: 100,
          goal_date: null,
          created_at: 'x',
          achieved_at: null,
          archived_at: null,
        },
        {
          saver_id: 'sav-1',
          goal_amount_cents: 0,
          goal_date: null,
          created_at: 'x',
          achieved_at: null,
          archived_at: null,
        },
        {
          saver_id: 'sav-1',
          goal_amount_cents: 500,
          goal_date: null,
          created_at: '',
          achieved_at: null,
          archived_at: null,
        },
      ])
      expect(readGoals()).toEqual([])
    })

    it('a pre-v6 payload (no saverGoals section) leaves local goals untouched', () => {
      insertSaver('sav-1', 500000, 400000)
      insertGoal('sav-1', 400000, { date: '2026-12-01' })

      const v5Payload = emptyPayload()
      expect(v5Payload.saverGoals).toBeUndefined()
      importPayloadWithOptions(v5Payload, ALL_ON)

      expect(readGoals()).toEqual([['sav-1', 400000, '2026-12-01', null, null]])
    })

    it('settings: true with an explicit empty saverGoals clears local goals', () => {
      insertSaver('sav-1', 500000, 400000)
      insertGoal('sav-1', 400000, {})

      importPayloadWithOptions(emptyPayload({ saverGoals: [] }), ALL_ON)

      expect(readGoals()).toEqual([])
      const t = realDb.exec(
        `SELECT target_amount_cents FROM accounts WHERE id = 'sav-1'`
      )
      expect(t[0].values[0][0]).toBeNull()
    })
  })
  describe('On hand switch export/import (#213)', () => {
    function insertAccount(
      id: string,
      opts: {
        type?: string
        on?: 0 | 1
        joint?: boolean
        closed?: boolean
      } = {}
    ) {
      realDb.run(
        `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at,
           ownership_type, is_closed, counts_on_hand)
         VALUES (?, ?, ?, 1000, '2026-01-01', '2026-01-01', ?, ?, ?)`,
        [
          id,
          id,
          opts.type ?? 'SAVER',
          opts.joint ? 'JOINT' : 'INDIVIDUAL',
          opts.closed ? 1 : 0,
          opts.on ?? 0,
        ]
      )
    }
    function switchedOn(): string[] {
      const r = realDb.exec(
        `SELECT id FROM accounts WHERE counts_on_hand = 1 ORDER BY id`
      )
      return r.length ? r[0].values.map((v) => String(v[0])) : []
    }

    it('exports the ids of the Savers switched on, and no others', () => {
      insertAccount('spend', { type: 'TRANSACTIONAL' })
      insertAccount('sav-a', { on: 1 })
      insertAccount('sav-b')
      insertAccount('sav-c', { on: 1 })

      const payload = buildExportPayload()
      expect(payload.onHandSaverIds).toEqual(['sav-a', 'sav-c'])
    })

    it('round-trips: the switch is restored for accounts that exist, the rest are ignored', () => {
      insertAccount('sav-a', { on: 1 })
      insertAccount('sav-b')
      const exported = buildExportPayload()

      realDb.run(`UPDATE accounts SET counts_on_hand = 0`)
      realDb.run(`UPDATE accounts SET counts_on_hand = 1 WHERE id = 'sav-b'`)
      importPayloadWithOptions(
        emptyPayload({
          version: 13,
          onHandSaverIds: [...(exported.onHandSaverIds ?? []), 'not-here'],
        }),
        ALL_ON
      )

      expect(switchedOn()).toEqual(['sav-a'])
      expect(
        realDb.exec(`SELECT COUNT(*) FROM accounts WHERE id = 'not-here'`)[0]
          .values[0][0]
      ).toBe(0)
    })

    it('an older export without the section imports with every Saver off', () => {
      insertAccount('sav-a', { on: 1 })
      insertAccount('sav-b', { on: 1 })

      const older = emptyPayload({ version: 12 })
      expect(older.onHandSaverIds).toBeUndefined()
      importPayloadWithOptions(older, ALL_ON)

      expect(switchedOn()).toEqual([])
    })

    it('never switches on a joint, closed or non-Saver account', () => {
      insertAccount('spend', { type: 'TRANSACTIONAL' })
      insertAccount('joint', { joint: true })
      insertAccount('closed', { closed: true })
      insertAccount('sav-a')

      replaceOnHandSavers(['spend', 'joint', 'closed', 'sav-a', '', 42])

      expect(switchedOn()).toEqual(['sav-a'])
    })

    it('leaves the switch alone when settings are not imported', () => {
      insertAccount('sav-a', { on: 1 })

      importPayloadWithOptions(emptyPayload({ version: 12 }), {
        ...ALL_ON,
        settings: false,
      })

      expect(switchedOn()).toEqual(['sav-a'])
    })
  })

  describe('Regular paid marks export/import (#214)', () => {
    function addRegular(name: string, date: string): number {
      realDb.run(
        `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at)
         VALUES (?, 5000, 'MONTHLY', ?, '2026-01-01')`,
        [name, date]
      )
      return Number(realDb.exec(`SELECT last_insert_rowid()`)[0].values[0][0])
    }
    function readMarks(): unknown[][] {
      const r = realDb.exec(
        `SELECT c.name, m.occurrence_date, m.marked_at
         FROM regular_paid_marks m JOIN upcoming_charges c ON c.id = m.regular_id
         ORDER BY c.name, m.occurrence_date`
      )
      return r.length ? r[0].values : []
    }

    it('exports each Regular with its marks', () => {
      const power = addRegular('Power', '2026-01-10')
      addRegular('Gym', '2026-01-12')
      realDb.run(
        `INSERT INTO regular_paid_marks VALUES (?, '2026-03-10', '2026-03-12T00:00:00.000Z'),
                                               (?, '2026-02-10', '2026-02-11T00:00:00.000Z')`,
        [power, power]
      )

      const charges = buildExportPayload().upcomingCharges
      expect(charges.map((c) => [c.name, c.paid_marks])).toEqual([
        [
          'Power',
          [
            {
              occurrence_date: '2026-02-10',
              marked_at: '2026-02-11T00:00:00.000Z',
            },
            {
              occurrence_date: '2026-03-10',
              marked_at: '2026-03-12T00:00:00.000Z',
            },
          ],
        ],
        ['Gym', []],
      ])
    })

    it('round-trips the marks onto the re-created Regulars, replacing the device’s own', () => {
      const power = addRegular('Power', '2026-01-10')
      realDb.run(
        `INSERT INTO regular_paid_marks VALUES (?, '2026-03-10', '2026-03-12T00:00:00.000Z')`,
        [power]
      )
      const exported = buildExportPayload().upcomingCharges
      // This device's own state, which the import replaces.
      const local = addRegular('Local', '2026-01-05')
      realDb.run(
        `INSERT INTO regular_paid_marks VALUES (?, '2026-03-05', '2026-03-06T00:00:00.000Z')`,
        [local]
      )

      replaceUpcomingCharges(exported)

      expect(readMarks()).toEqual([
        ['Power', '2026-03-10', '2026-03-12T00:00:00.000Z'],
      ])
      // The Regular has a new id, and the mark follows it.
      const newId = realDb.exec(`SELECT id FROM upcoming_charges`)[0]
        .values[0][0]
      expect(newId).not.toBe(power)
      expect(
        realDb.exec(`SELECT regular_id FROM regular_paid_marks`)[0].values[0][0]
      ).toBe(newId)
    })

    it('an older export without marks imports with none', () => {
      const power = addRegular('Power', '2026-01-10')
      realDb.run(
        `INSERT INTO regular_paid_marks VALUES (?, '2026-03-10', '2026-03-12T00:00:00.000Z')`,
        [power]
      )
      const older = emptyPayload({
        version: 13,
        upcomingCharges: [chargeExport({ name: 'Power' })],
      })
      expect(older.upcomingCharges[0].paid_marks).toBeUndefined()

      importPayloadWithOptions(older, ALL_ON)

      expect(readCharges().map((c) => c.name)).toEqual(['Power'])
      expect(readMarks()).toEqual([])
    })

    it('skips malformed marks', () => {
      replaceUpcomingCharges([
        chargeExport({
          name: 'Power',
          paid_marks: [
            { occurrence_date: '2026-3-10', marked_at: 'x' },
            { occurrence_date: '2026-03-10', marked_at: '' },
            {
              occurrence_date: '2026-03-01',
              marked_at: '2026-03-02T00:00:00.000Z',
            },
            null as never,
          ],
        }),
      ])
      expect(readMarks()).toEqual([
        ['Power', '2026-03-01', '2026-03-02T00:00:00.000Z'],
      ])
    })

    it('leaves the marks alone when Regulars are not imported', () => {
      const power = addRegular('Power', '2026-01-10')
      realDb.run(
        `INSERT INTO regular_paid_marks VALUES (?, '2026-03-10', '2026-03-12T00:00:00.000Z')`,
        [power]
      )
      importPayloadWithOptions(emptyPayload({ version: 13 }), {
        ...ALL_ON,
        upcomingCharges: false,
      })
      expect(readMarks()).toEqual([
        ['Power', '2026-03-10', '2026-03-12T00:00:00.000Z'],
      ])
    })
  })

  // ── #209: Net Worth is cut ──────────────────────────────────────────────

  describe('Net Worth cut (#209)', () => {
    /** A v11-or-earlier payload, which still carries Net Worth. */
    function olderExportWithNetWorth(): ExportPayload {
      return {
        ...emptyPayload({
          version: 11,
          budgetBuckets: [
            { id: 3, name: 'Debts', icon: 'mdi-cash', sort_order: 0 },
          ],
          upcomingCharges: [
            {
              ...chargeExport({
                name: 'Mortgage repayment',
                amount: 250000,
                frequency: 'FORTNIGHTLY',
                next_charge_date: '2026-03-06',
                reminder_days_before: 2,
                cancel_by_date: '2027-12-31',
                bucket_id: 3,
                match_description: 'HOMELOAN',
              }),
              is_reserved: 1,
              charge_type: 'LIABILITY_REPAYMENT',
              linked_account_name: 'Home Loan',
            } as UpcomingChargeExportRow,
          ],
        }),
        manualAccounts: [
          {
            name: 'Home Loan',
            institution: null,
            account_type: 'MORTGAGE',
            kind: 'liability',
            balance_cents: 45000000,
            credit_limit_cents: null,
            interest_rate_bps: null,
            rate_type: null,
            fixed_rate_expiry_date: null,
            notes: null,
            sort_order: 0,
            last_updated_at: '2026-02-10',
            created_at: '2026-01-01',
          },
          {
            name: 'Super',
            institution: null,
            account_type: 'SUPER',
            kind: 'asset',
            balance_cents: 9000000,
            credit_limit_cents: null,
            interest_rate_bps: null,
            rate_type: null,
            fixed_rate_expiry_date: null,
            notes: null,
            sort_order: 1,
            last_updated_at: '2026-02-10',
            created_at: '2026-01-01',
          },
        ],
        netWorthSnapshots: [
          {
            snapshot_date: '2026-02-14',
            up_bank_cents: 500000,
            manual_assets_cents: 9000000,
            manual_liabilities_cents: 45000000,
          },
          {
            snapshot_date: '2026-02-15',
            up_bank_cents: 510000,
            manual_assets_cents: 9000000,
            manual_liabilities_cents: 45000000,
          },
          {
            snapshot_date: '2026-02-16',
            up_bank_cents: 520000,
            manual_assets_cents: 9000000,
            manual_liabilities_cents: 45000000,
          },
        ],
      } as ExportPayload
    }

    it('exports no Net Worth sections and no liability fields on Regulars', () => {
      realDb.run(
        `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at)
         VALUES ('Mortgage repayment', 250000, 'MONTHLY', '2026-03-01', '2026-01-01')`
      )
      const payload = buildExportPayload()
      expect(payload.version).toBe(19)
      expect(Object.keys(payload)).not.toContain('manualAccounts')
      expect(Object.keys(payload)).not.toContain('netWorthSnapshots')
      expect(payload.upcomingCharges).toHaveLength(1)
      expect(Object.keys(payload.upcomingCharges[0])).not.toContain(
        'charge_type'
      )
      expect(Object.keys(payload.upcomingCharges[0])).not.toContain(
        'linked_account_name'
      )
    })

    it("imports an older export's liability repayment as an ordinary Regular, every surviving field intact", () => {
      importPayloadWithOptions(olderExportWithNetWorth(), ALL_ON)

      const bucketId = realDb.exec(
        `SELECT id FROM budget_buckets WHERE name = 'Debts'`
      )[0].values[0][0]
      expect(
        realDb.exec(
          `SELECT name, amount, frequency, next_charge_date,
                  reminder_days_before, cancel_by_date, bucket_id, match_description
           FROM upcoming_charges`
        )[0].values
      ).toEqual([
        [
          'Mortgage repayment',
          250000,
          'FORTNIGHTLY',
          '2026-03-06',
          2,
          '2027-12-31',
          bucketId,
          'HOMELOAN',
        ],
      ])
    })

    it('skips the Net Worth sections of an older export without failing the import', () => {
      expect(() =>
        importPayloadWithOptions(olderExportWithNetWorth(), ALL_ON)
      ).not.toThrow()
      const tables = realDb
        .exec(`SELECT name FROM sqlite_master WHERE type = 'table'`)[0]
        .values.map((r) => String(r[0]))
      expect(tables).not.toContain('manual_accounts')
      expect(tables).not.toContain('net_worth_snapshots')
    })

    it('names the skipped Net Worth accounts and history entries', () => {
      expect(describeSkippedSections(olderExportWithNetWorth())).toBe(
        'Skipped 2 Net Worth accounts. Vantura no longer has them. ' +
          'Skipped 3 Net Worth history entries. Vantura no longer has them.'
      )
    })

    it('uses the singular for one of each', () => {
      const payload = olderExportWithNetWorth() as ExportPayload & {
        manualAccounts: unknown[]
        netWorthSnapshots: unknown[]
      }
      payload.manualAccounts = payload.manualAccounts.slice(0, 1)
      payload.netWorthSnapshots = payload.netWorthSnapshots.slice(0, 1)
      expect(describeSkippedSections(payload)).toBe(
        'Skipped 1 Net Worth account. Vantura no longer has them. ' +
          'Skipped 1 Net Worth history entry. Vantura no longer has them.'
      )
    })

    it('says nothing for empty Net Worth sections, or for liability fields on Regulars alone', () => {
      const payload = {
        ...olderExportWithNetWorth(),
        manualAccounts: [],
        netWorthSnapshots: [],
      } as ExportPayload
      expect(describeSkippedSections(payload)).toBeNull()
    })
  })

  // ── #211: Spendable is cut ──────────────────────────────────────────────

  describe('Spendable cut (#211)', () => {
    const CUT_KEYS = [
      'spendable_alert_below_cents',
      'spendable_alert_below_pct_pay',
      'essentials_saver_account_id',
    ]

    /** A v14-or-earlier payload, which still carries the Spendable settings. */
    function olderExportWithSpendable(): ExportPayload {
      return emptyPayload({
        version: 14,
        settings: {
          pay_amount_cents: '450000',
          spendable_alert_below_cents: '50000',
          spendable_alert_below_pct_pay: '0',
          essentials_saver_account_id: 'saver-1',
        },
        upcomingCharges: [
          { ...chargeExport({ name: 'Rent' }), is_reserved: 1 },
          {
            ...chargeExport({
              name: 'Domain',
              amount: 1500,
              frequency: 'YEARLY',
              next_charge_date: '2027-03-01',
              reminder_days_before: 7,
            }),
            is_reserved: 0,
          },
        ] as UpcomingChargeExportRow[],
      })
    }

    it('exports no Spendable settings and no is_reserved on Regulars', async () => {
      const db = await import('@/db')
      vi.mocked(db.getAppSetting).mockImplementation((key) =>
        CUT_KEYS.includes(key) ? '1' : key === 'pay_amount_cents' ? '1' : null
      )
      realDb.run(
        `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at)
         VALUES ('Rent', 180000, 'MONTHLY', '2026-03-01', '2026-01-01')`
      )
      const payload = buildExportPayload()
      expect(payload.version).toBe(19)
      for (const key of CUT_KEYS) {
        expect(payload.settings[key], key).toBeUndefined()
      }
      expect(payload.settings.pay_amount_cents).toBe('1')
      expect(payload.upcomingCharges).toHaveLength(1)
      expect(Object.keys(payload.upcomingCharges[0])).not.toContain(
        'is_reserved'
      )
    })

    it('imports an older export without its Spendable settings, every Regular counted, the rest intact', async () => {
      const db = await import('@/db')
      vi.mocked(db.setAppSetting).mockClear()

      importPayloadWithOptions(olderExportWithSpendable(), ALL_ON)

      const written = vi.mocked(db.setAppSetting).mock.calls.map(([key]) => key)
      for (const key of CUT_KEYS) expect(written, key).not.toContain(key)
      expect(written).toContain('pay_amount_cents')
      expect(
        realDb.exec(
          `SELECT name, amount, frequency, next_charge_date, reminder_days_before
           FROM upcoming_charges ORDER BY id`
        )[0].values
      ).toEqual([
        ['Rent', 180000, 'MONTHLY', '2026-03-01', null],
        ['Domain', 1500, 'YEARLY', '2027-03-01', 7],
      ])
    })

    it('says what it skipped', () => {
      expect(describeSkippedSections(olderExportWithSpendable())).toBe(
        'Skipped your Spendable alert. Vantura no longer has it. ' +
          'Skipped your Essentials Saver. Vantura no longer has it. ' +
          '1 Regular had “Include in Spendable” off. It now counts in Still to go out.'
      )
    })

    it('counts every Regular that had Include in Spendable off', () => {
      const payload = olderExportWithSpendable()
      payload.settings = {}
      payload.upcomingCharges = [
        ...payload.upcomingCharges,
        { ...chargeExport({ name: 'Gym' }), is_reserved: 0 },
      ] as UpcomingChargeExportRow[]
      expect(describeSkippedSections(payload)).toBe(
        '2 Regulars had “Include in Spendable” off. They now count in Still to go out.'
      )
    })

    it('says nothing when every Regular had it on and no Spendable setting is present', () => {
      const payload = olderExportWithSpendable()
      payload.settings = { pay_amount_cents: '450000' }
      payload.upcomingCharges = payload.upcomingCharges.slice(0, 1)
      expect(describeSkippedSections(payload)).toBeNull()
    })
  })

  // ── #195: the payday date is cut ────────────────────────────────────────

  describe('payday date cut (#195)', () => {
    const CUT_KEYS = ['next_payday', 'payday_day']

    it('no payday date key is in SETTINGS_WHITELIST; pay amount and frequency are', () => {
      const wl = new Set(SETTINGS_WHITELIST)
      for (const key of CUT_KEYS) {
        expect(wl.has(key), `${key} still whitelisted`).toBe(false)
      }
      expect(wl.has('pay_amount_cents')).toBe(true)
      expect(wl.has('payday_frequency')).toBe(true)
    })

    it('leaves the payday date out of an export', async () => {
      const db = await import('@/db')
      vi.mocked(db.getDb).mockReturnValue(null)
      vi.mocked(db.getAppSetting).mockImplementation((key) => {
        if (key === 'next_payday') return '2026-11-26'
        if (key === 'payday_day') return '104'
        if (key === 'pay_amount_cents') return '320000'
        if (key === 'payday_frequency') return 'FORTNIGHTLY'
        return null
      })

      const payload = buildExportPayload()

      expect(payload.version).toBe(19)
      for (const key of CUT_KEYS) {
        expect(payload.settings).not.toHaveProperty(key)
      }
      expect(payload.settings.pay_amount_cents).toBe('320000')
      expect(payload.settings.payday_frequency).toBe('FORTNIGHTLY')
    })

    it('silently skips the payday date when importing an older export', async () => {
      const db = await import('@/db')
      vi.mocked(db.setAppSetting).mockClear()
      const older = emptyPayload({
        version: 15,
        settings: {
          next_payday: '2026-11-26',
          payday_day: '104',
          pay_amount_cents: '320000',
          payday_frequency: 'FORTNIGHTLY',
        },
      })

      importPayloadWithOptions(older, ALL_ON)

      const written = vi.mocked(db.setAppSetting).mock.calls.map(([key]) => key)
      for (const key of CUT_KEYS) expect(written, key).not.toContain(key)
      expect(db.setAppSetting).toHaveBeenCalledWith(
        'pay_amount_cents',
        '320000'
      )
      expect(db.setAppSetting).toHaveBeenCalledWith(
        'payday_frequency',
        'FORTNIGHTLY'
      )
      // Silent: no skipped-settings notice for the payday date.
      expect(describeSkippedSections(older)).toBeNull()
    })
  })
})
