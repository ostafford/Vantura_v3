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
  replaceNetWorth,
  importPayloadWithOptions,
  IMPORT_ERROR_INVALID_FILE,
  IMPORT_ERROR_WRONG_PASSPHRASE,
  type ExportPayload,
  type ImportOptions,
  type BudgetBucketExportRow,
  type TrackerExportRow,
  type TrackerConfigHistoryExportRow,
  type UpcomingChargeExportRow,
  type ManualAccountExportRow,
  type NetWorthSnapshotExportRow,
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

describe('replaceBudgetPlan: budget_transaction_anchors preservation', () => {
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

  function insertBucket(name: string): number {
    realDb.run(
      `INSERT INTO budget_buckets (name, icon, sort_order, created_at) VALUES (?, 'mdi-wallet', 0, '2026-01-01')`,
      [name]
    )
    return realDb.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  }

  function insertAnchor(bucketId: number, transactionId: string): void {
    realDb.run(
      `INSERT INTO budget_transaction_anchors (bucket_id, transaction_id, description_pattern, frequency, created_at)
       VALUES (?, ?, 'PATTERN', 'MONTHLY', '2026-01-01')`,
      [bucketId, transactionId]
    )
  }

  function anchorBucketIds(): number[] {
    const stmt = realDb.prepare(
      `SELECT bucket_id FROM budget_transaction_anchors ORDER BY id`
    )
    const ids: number[] = []
    while (stmt.step()) ids.push(stmt.get()[0] as number)
    stmt.free()
    return ids
  }

  it('remaps anchors to the new bucket id when the bucket name survives the import', () => {
    const billsId = insertBucket('Bills')
    insertAnchor(billsId, 'tx-1')

    const imported: BudgetBucketExportRow[] = [
      { id: 999, name: 'Bills', icon: 'mdi-wallet', sort_order: 0 },
    ]
    const bucketIdMap = replaceBudgetPlan(imported, [])
    const newBillsId = bucketIdMap.get(999)

    expect(newBillsId).toBeDefined()
    expect(newBillsId).not.toBe(billsId)
    expect(anchorBucketIds()).toEqual([newBillsId])
  })

  it('deletes anchors whose bucket name does not survive the import', () => {
    const groceriesId = insertBucket('Groceries')
    insertAnchor(groceriesId, 'tx-2')

    const imported: BudgetBucketExportRow[] = [
      { id: 999, name: 'Entertainment', icon: 'mdi-wallet', sort_order: 0 },
    ]
    replaceBudgetPlan(imported, [])

    expect(anchorBucketIds()).toEqual([])
  })

  it('leaves anchors on unrelated surviving buckets untouched when other buckets are dropped', () => {
    const billsId = insertBucket('Bills')
    const groceriesId = insertBucket('Groceries')
    insertAnchor(billsId, 'tx-1')
    insertAnchor(groceriesId, 'tx-2')

    // Only "Bills" is re-imported; "Groceries" is dropped from the plan.
    const imported: BudgetBucketExportRow[] = [
      { id: 1, name: 'Bills', icon: 'mdi-wallet', sort_order: 0 },
    ]
    const bucketIdMap = replaceBudgetPlan(imported, [])
    const newBillsId = bucketIdMap.get(1)

    expect(anchorBucketIds()).toEqual([newBillsId])
  })
})

/**
 * #36 — real-DB coverage for the import writers that had none:
 * replaceTrackers, replaceUpcomingCharges, and the importPayloadWithOptions
 * orchestrator. Each runs delete-then-reinsert against a live in-memory
 * sql.js DB (matching the replaceBudgetPlan block above), so id remapping,
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
      is_reserved: 1,
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
      budgetHypotheticals: [],
      ...over,
    }
  }

  const ALL_ON: ImportOptions = {
    settings: true,
    trackers: true,
    upcomingCharges: true,
    budgetPlan: true,
    netWorth: true,
  }

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
    is_reserved: number
    reminder_days_before: number | null
    cancel_by_date: string | null
    bucket_id: number | null
    next_charge_date: string
  }> {
    const stmt = realDb.prepare(
      `SELECT name, category_id, is_reserved, reminder_days_before, cancel_by_date, bucket_id, next_charge_date
       FROM upcoming_charges ORDER BY id`
    )
    const out: Array<{
      name: string
      category_id: string | null
      is_reserved: number
      reminder_days_before: number | null
      cancel_by_date: string | null
      bucket_id: number | null
      next_charge_date: string
    }> = []
    while (stmt.step()) {
      const r = stmt.get() as [
        string,
        string | null,
        number,
        number | null,
        string | null,
        number | null,
        string,
      ]
      out.push({
        name: r[0],
        category_id: r[1],
        is_reserved: r[2],
        reminder_days_before: r[3],
        cancel_by_date: r[4],
        bucket_id: r[5],
        next_charge_date: r[6],
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
    it('wipes existing charges and inserts the imported set', () => {
      realDb.run(
        `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, is_reserved, created_at)
         VALUES ('Stale', 100, 'MONTHLY', '2026-01-01', 1, '2026-01-01')`
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
          is_reserved: 1,
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
         VALUES ('Keep me', 9999, 'PAYDAY', NULL, '2026-01-01', '2026-02-01', '2026-03-01', 1, '2026-01-01')`
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
          netWorth: false,
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
          netWorth: false,
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
        `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, is_reserved, created_at)
         VALUES ('Existing charge', 1000, 'MONTHLY', '2026-01-01', 1, '2026-01-01')`
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

  // ── #34: Net Worth (manual_accounts + net_worth_snapshots) ─────────────

  describe('Net Worth export/import (#34)', () => {
    function insertManualAccount(over: Partial<Record<string, unknown>> = {}) {
      const row = {
        name: 'Mortgage',
        institution: 'Big Bank',
        account_type: 'MORTGAGE',
        kind: 'liability',
        balance_cents: 45000000,
        credit_limit_cents: null,
        interest_rate_bps: 599,
        rate_type: 'variable',
        fixed_rate_expiry_date: null,
        notes: 'offset linked',
        sort_order: 0,
        last_updated_at: '2026-02-10T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        ...over,
      }
      realDb.run(
        `INSERT INTO manual_accounts
           (name, institution, account_type, kind, balance_cents, credit_limit_cents,
            interest_rate_bps, rate_type, fixed_rate_expiry_date, notes, sort_order,
            last_updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.name,
          row.institution,
          row.account_type,
          row.kind,
          row.balance_cents,
          row.credit_limit_cents,
          row.interest_rate_bps,
          row.rate_type,
          row.fixed_rate_expiry_date,
          row.notes,
          row.sort_order,
          row.last_updated_at,
          row.created_at,
        ] as never[]
      )
    }

    function insertSnapshot(
      date: string,
      up = 100000,
      assets = 0,
      liabilities = 0
    ) {
      realDb.run(
        `INSERT INTO net_worth_snapshots (snapshot_date, up_bank_cents, manual_assets_cents, manual_liabilities_cents)
         VALUES (?, ?, ?, ?)`,
        [date, up, assets, liabilities]
      )
    }

    function readManualAccounts() {
      const stmt = realDb.prepare(
        `SELECT name, account_type, kind, balance_cents, interest_rate_bps, notes,
                sort_order, last_updated_at, created_at
         FROM manual_accounts ORDER BY sort_order, id`
      )
      const out: Array<Record<string, unknown>> = []
      while (stmt.step()) {
        const r = stmt.get() as [
          string,
          string,
          string,
          number,
          number | null,
          string | null,
          number,
          string,
          string,
        ]
        out.push({
          name: r[0],
          account_type: r[1],
          kind: r[2],
          balance_cents: r[3],
          interest_rate_bps: r[4],
          notes: r[5],
          sort_order: r[6],
          last_updated_at: r[7],
          created_at: r[8],
        })
      }
      stmt.free()
      return out
    }

    function readSnapshots() {
      const stmt = realDb.prepare(
        `SELECT snapshot_date, up_bank_cents, manual_assets_cents, manual_liabilities_cents
         FROM net_worth_snapshots ORDER BY snapshot_date`
      )
      const out: Array<[string, number, number, number]> = []
      while (stmt.step())
        out.push(stmt.get() as [string, number, number, number])
      stmt.free()
      return out
    }

    it('buildExportPayload carries manual_accounts (minus id) and net_worth_snapshots', () => {
      insertManualAccount({ name: 'Mortgage' })
      insertManualAccount({
        name: 'Shares',
        account_type: 'INVESTMENT',
        kind: 'asset',
        sort_order: 1,
      })
      insertSnapshot('2026-02-01', 500000, 10000, 45000000)

      const payload = buildExportPayload()

      expect(payload.version).toBe(5)
      expect(payload.manualAccounts?.map((a) => a.name)).toEqual([
        'Mortgage',
        'Shares',
      ])
      expect(payload.manualAccounts?.[0]).not.toHaveProperty('id')
      expect(payload.manualAccounts?.[0]).toMatchObject({
        account_type: 'MORTGAGE',
        kind: 'liability',
        balance_cents: 45000000,
        interest_rate_bps: 599,
        last_updated_at: '2026-02-10T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
      })
      expect(payload.netWorthSnapshots).toEqual([
        {
          snapshot_date: '2026-02-01',
          up_bank_cents: 500000,
          manual_assets_cents: 10000,
          manual_liabilities_cents: 45000000,
        },
      ])
    })

    it('replaceNetWorth wipes both tables and reinserts, preserving exported timestamps', () => {
      insertManualAccount({ name: 'Stale local account' })
      insertSnapshot('2025-12-31')

      const accounts: ManualAccountExportRow[] = [
        {
          name: 'Imported Mortgage',
          institution: null,
          account_type: 'MORTGAGE',
          kind: 'liability',
          balance_cents: 30000000,
          credit_limit_cents: null,
          interest_rate_bps: 610,
          rate_type: 'fixed',
          fixed_rate_expiry_date: '2027-06-30',
          notes: null,
          sort_order: 0,
          last_updated_at: '2026-02-14T00:00:00.000Z',
          created_at: '2025-08-01T00:00:00.000Z',
        },
      ]
      replaceNetWorth(accounts, [
        {
          snapshot_date: '2026-02-14',
          up_bank_cents: 1234,
          manual_assets_cents: 0,
          manual_liabilities_cents: 30000000,
        },
      ])

      expect(readManualAccounts()).toEqual([
        {
          name: 'Imported Mortgage',
          account_type: 'MORTGAGE',
          kind: 'liability',
          balance_cents: 30000000,
          interest_rate_bps: 610,
          notes: null,
          sort_order: 0,
          last_updated_at: '2026-02-14T00:00:00.000Z',
          created_at: '2025-08-01T00:00:00.000Z',
        },
      ])
      expect(readSnapshots()).toEqual([['2026-02-14', 1234, 0, 30000000]])
    })

    it('replaceNetWorth with empty arrays clears both tables', () => {
      insertManualAccount()
      insertSnapshot('2026-01-15')

      replaceNetWorth([], [])

      expect(readManualAccounts()).toEqual([])
      expect(readSnapshots()).toEqual([])
    })

    it('replaceNetWorth skips structurally invalid account and snapshot rows', () => {
      replaceNetWorth(
        [
          {
            name: '',
            account_type: 'X',
            kind: 'asset',
            balance_cents: 1,
          } as ManualAccountExportRow,
          {
            name: 'NoBalance',
            account_type: 'X',
            kind: 'asset',
          } as unknown as ManualAccountExportRow,
          {
            name: 'BadKind',
            institution: null,
            account_type: 'SAVINGS',
            kind: 'wealth' as unknown as 'asset',
            balance_cents: 100,
            credit_limit_cents: null,
            interest_rate_bps: null,
            rate_type: null,
            fixed_rate_expiry_date: null,
            notes: null,
            sort_order: 0,
            last_updated_at: '2026-02-01T00:00:00.000Z',
            created_at: '2026-02-01T00:00:00.000Z',
          },
          {
            name: 'Good',
            institution: null,
            account_type: 'SAVINGS',
            kind: 'asset',
            balance_cents: 5000,
            credit_limit_cents: null,
            interest_rate_bps: null,
            rate_type: null,
            fixed_rate_expiry_date: null,
            notes: null,
            sort_order: 0,
            last_updated_at: '2026-02-01T00:00:00.000Z',
            created_at: '2026-02-01T00:00:00.000Z',
          },
        ],
        [
          {
            snapshot_date: 'bad',
            up_bank_cents: 1,
            manual_assets_cents: 0,
            manual_liabilities_cents: 0,
          } as NetWorthSnapshotExportRow,
          {
            snapshot_date: '2026-02-01',
            up_bank_cents: 9,
            manual_assets_cents: 0,
            manual_liabilities_cents: 0,
          },
        ]
      )

      expect(readManualAccounts().map((a) => a.name)).toEqual(['Good'])
      expect(readSnapshots()).toEqual([['2026-02-01', 9, 0, 0]])
    })

    it('importPayloadWithOptions honours the netWorth toggle', () => {
      insertManualAccount({ name: 'Keep when off' })

      // netWorth: false → existing manual account untouched
      importPayloadWithOptions(
        emptyPayload({
          manualAccounts: [
            {
              name: 'Should not appear',
              institution: null,
              account_type: 'SAVINGS',
              kind: 'asset',
              balance_cents: 1,
              credit_limit_cents: null,
              interest_rate_bps: null,
              rate_type: null,
              fixed_rate_expiry_date: null,
              notes: null,
              sort_order: 0,
              last_updated_at: '2026-02-01T00:00:00.000Z',
              created_at: '2026-02-01T00:00:00.000Z',
            },
          ],
        }),
        { ...ALL_ON, netWorth: false }
      )
      expect(readManualAccounts().map((a) => a.name)).toEqual(['Keep when off'])

      // netWorth: true → replaced
      importPayloadWithOptions(
        emptyPayload({
          manualAccounts: [
            {
              name: 'Imported',
              institution: null,
              account_type: 'SAVINGS',
              kind: 'asset',
              balance_cents: 2,
              credit_limit_cents: null,
              interest_rate_bps: null,
              rate_type: null,
              fixed_rate_expiry_date: null,
              notes: null,
              sort_order: 0,
              last_updated_at: '2026-02-01T00:00:00.000Z',
              created_at: '2026-02-01T00:00:00.000Z',
            },
          ],
          netWorthSnapshots: [
            {
              snapshot_date: '2026-02-01',
              up_bank_cents: 3,
              manual_assets_cents: 2,
              manual_liabilities_cents: 0,
            },
          ],
        }),
        ALL_ON
      )
      expect(readManualAccounts().map((a) => a.name)).toEqual(['Imported'])
      expect(readSnapshots()).toEqual([['2026-02-01', 3, 2, 0]])
    })

    it('netWorth: true on a pre-v5 payload (no Net Worth section) is a no-op, not a wipe', () => {
      insertManualAccount({ name: 'Pre-existing' })
      insertSnapshot('2026-01-01')

      // A v4 payload has no manualAccounts / netWorthSnapshots key at all.
      // Without the `manualAccounts !== undefined` guard in
      // importPayloadWithOptions, `netWorth: true` would run
      // replaceNetWorth([], []) and DELETE both tables with nothing to
      // reinsert. The guard makes an absent section a skip regardless of
      // caller — the wizard no longer has to be the only thing stopping it.
      const v4Payload = emptyPayload()
      expect(v4Payload.manualAccounts).toBeUndefined()

      importPayloadWithOptions(v4Payload, { ...ALL_ON, netWorth: true })

      expect(readManualAccounts().map((a) => a.name)).toEqual(['Pre-existing'])
      expect(readSnapshots()).toEqual([['2026-01-01', 100000, 0, 0]])
    })

    it('netWorth: true with an explicitly empty manualAccounts still clears both tables', () => {
      insertManualAccount({ name: 'Wiped' })
      insertSnapshot('2026-01-01')

      // `manualAccounts: []` is a present-but-empty section: a real replace-all
      // that intentionally clears the device, distinct from an absent section.
      importPayloadWithOptions(emptyPayload({ manualAccounts: [] }), {
        ...ALL_ON,
        netWorth: true,
      })

      expect(readManualAccounts()).toEqual([])
      expect(readSnapshots()).toEqual([])
    })
  })
})
