/**
 * Profile export/import: encrypted file-based transfer of settings, trackers,
 * upcoming charges, budget plan, and Net Worth manual accounts + snapshot
 * history between devices. Never exports Up Bank transactions or accounts, the
 * API token, or encryption keys. The manual-account balances / institution
 * names / notes that #34 added are only ever written to the passphrase-encrypted
 * bundle and stay on-device — nothing here makes a network call.
 */

import { getDb, getAppSetting, setAppSetting, schedulePersist } from '@/db'
import {
  generateSalt,
  deriveKeyFromPassphrase,
  encryptToken,
  decryptToken,
  PBKDF2_ITERATIONS,
} from '@/lib/crypto'
import { SCHEMA_VERSION } from '@/db/schema'
import { writeTrackerConfigVersion } from './trackers'

/** Export format version for the encrypted payload */
const EXPORT_PAYLOAD_VERSION = 5

/** File wrapper version for the outer JSON structure */
const EXPORT_FILE_VERSION = 1

/**
 * Strict whitelist of app_settings keys allowed in export.
 * Any key not in this list is NEVER exported (except saver_goal_date_* prefix).
 */
export const SETTINGS_WHITELIST: readonly string[] = [
  'theme_mode',
  'payday_frequency',
  'payday_day',
  'next_payday',
  'pay_amount_cents',
  'payday_raw_text',
  'payday_description',
  'spendable_alert_below_cents',
  'spendable_alert_below_pct_pay',
  'dashboard_tour_completed',
  'dashboard_section_order',
  'lock_timeout_minutes',
  'saver_account_order',
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
] as const

/**
 * Keys that must NEVER appear in export. Used by tests to guard against mistakes.
 */
export const FORBIDDEN_KEYS: readonly string[] = [
  'api_token_encrypted',
  'encryption_salt',
  'last_sync',
  'schema_version',
]

export interface ExportPayload {
  version: number
  exportedAt: string
  appSchemaVersion: number
  settings: Record<string, string>
  trackers: TrackerExportRow[]
  trackerCategories: { tracker_id: number; category_id: string }[]
  /** #16 — per-tracker config timeline. Absent in payloads from before v4. */
  trackerConfigHistory?: TrackerConfigHistoryExportRow[]
  upcomingCharges: UpcomingChargeExportRow[]
  budgetBuckets: BudgetBucketExportRow[]
  budgetHypotheticals: BudgetHypotheticalExportRow[]
  /** #34 — Net Worth manual accounts. Absent in payloads from before v5. */
  manualAccounts?: ManualAccountExportRow[]
  /** #34 — Net Worth daily snapshot history. Absent in payloads from before v5. */
  netWorthSnapshots?: NetWorthSnapshotExportRow[]
}

export interface TrackerExportRow {
  id: number
  name: string
  budget_amount: number
  reset_frequency: string
  reset_day: number | null
  start_date: string
  last_reset_date: string
  next_reset_date: string
  is_active: number
  bucket_id: number | null
}

export interface TrackerConfigHistoryExportRow {
  tracker_id: number
  effective_from: string
  budget_amount: number
  category_ids: string[]
}

export interface UpcomingChargeExportRow {
  name: string
  amount: number
  frequency: string
  next_charge_date: string
  category_id: string | null
  is_reserved: number
  reminder_days_before?: number | null
  cancel_by_date?: string | null
  bucket_id?: number | null
}

export interface BudgetBucketExportRow {
  id: number
  name: string
  icon: string
  sort_order: number
}

export interface BudgetHypotheticalExportRow {
  bucket_id: number
  name: string
  amount_cents: number
  frequency: string
  is_hypothetical: number
}

/**
 * #34 — a `manual_accounts` row minus its local AUTOINCREMENT `id` (no
 * cross-database identity, same as `upcoming_charges`). `last_updated_at` and
 * `created_at` are carried through as-exported rather than reset on import — a
 * restored account should report when its balance was actually last confirmed.
 */
export interface ManualAccountExportRow {
  name: string
  institution: string | null
  account_type: string
  kind: string
  balance_cents: number
  credit_limit_cents: number | null
  interest_rate_bps: number | null
  rate_type: string | null
  fixed_rate_expiry_date: string | null
  notes: string | null
  sort_order: number
  last_updated_at: string
  created_at: string
}

/** #34 — a `net_worth_snapshots` row verbatim; `snapshot_date` is the PK and is
 * itself cross-database stable, so no id remap is needed. */
export interface NetWorthSnapshotExportRow {
  snapshot_date: string
  up_bank_cents: number
  manual_assets_cents: number
  manual_liabilities_cents: number
}

export interface ExportFileWrapper {
  salt: string
  iterations: number
  ciphertext: string
  formatVersion: number
}

function collectWhitelistedSettings(): Record<string, string> {
  const settings: Record<string, string> = {}
  const whitelist = new Set(SETTINGS_WHITELIST)
  for (const key of whitelist) {
    const value = getAppSetting(key)
    if (value != null && value !== '') {
      settings[key] = value
    }
  }
  // Dynamic per-saver goal dates (key: saver_goal_date_<accountId>)
  const db = getDb()
  if (db) {
    const stmt = db.prepare(
      `SELECT key, value FROM app_settings WHERE key LIKE 'saver_goal_date_%'`
    )
    while (stmt.step()) {
      const [k, v] = stmt.get() as [string, string]
      if (v != null && v !== '') settings[k] = v
    }
    stmt.free()
  }
  return settings
}

function collectTrackers(): TrackerExportRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, name, budget_amount, reset_frequency, reset_day, start_date,
            last_reset_date, next_reset_date, is_active, bucket_id
     FROM trackers ORDER BY id`
  )
  const rows: TrackerExportRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [
      number,
      string,
      number,
      string,
      number | null,
      string,
      string,
      string,
      number,
      number | null,
    ]
    rows.push({
      id: r[0],
      name: r[1],
      budget_amount: r[2],
      reset_frequency: r[3],
      reset_day: r[4],
      start_date: r[5],
      last_reset_date: r[6],
      next_reset_date: r[7],
      is_active: r[8],
      bucket_id: r[9] ?? null,
    })
  }
  stmt.free()
  return rows
}

function collectTrackerCategories(): {
  tracker_id: number
  category_id: string
}[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT tracker_id, category_id FROM tracker_categories ORDER BY tracker_id, category_id`
  )
  const rows: { tracker_id: number; category_id: string }[] = []
  while (stmt.step()) {
    const r = stmt.get() as [number, string]
    rows.push({ tracker_id: r[0], category_id: r[1] })
  }
  stmt.free()
  return rows
}

function collectTrackerConfigHistory(): TrackerConfigHistoryExportRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, tracker_id, effective_from, budget_amount
     FROM tracker_config_history ORDER BY tracker_id, effective_from, id`
  )
  const byConfigId = new Map<number, TrackerConfigHistoryExportRow>()
  const rows: TrackerConfigHistoryExportRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [number, number, string, number]
    const row: TrackerConfigHistoryExportRow = {
      tracker_id: r[1],
      effective_from: String(r[2]).slice(0, 10),
      budget_amount: r[3],
      category_ids: [],
    }
    byConfigId.set(r[0], row)
    rows.push(row)
  }
  stmt.free()
  const catStmt = db.prepare(
    `SELECT config_id, category_id FROM tracker_config_history_categories`
  )
  while (catStmt.step()) {
    const r = catStmt.get() as [number, string]
    byConfigId.get(r[0])?.category_ids.push(r[1])
  }
  catStmt.free()
  return rows
}

function collectUpcomingCharges(): UpcomingChargeExportRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT name, amount, frequency, next_charge_date, category_id, is_reserved,
      reminder_days_before, cancel_by_date, bucket_id
     FROM upcoming_charges ORDER BY id`
  )
  const rows: UpcomingChargeExportRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      number,
      string,
      string,
      string | null,
      number,
      number | null,
      string | null,
      number | null,
    ]
    rows.push({
      name: r[0],
      amount: r[1],
      frequency: r[2],
      next_charge_date: r[3],
      category_id: r[4],
      is_reserved: r[5],
      reminder_days_before: r[6] ?? null,
      cancel_by_date: r[7] ?? null,
      bucket_id: r[8] ?? null,
    })
  }
  stmt.free()
  return rows
}

function collectBudgetBuckets(): BudgetBucketExportRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, name, icon, sort_order
     FROM budget_buckets ORDER BY sort_order, id`
  )
  const rows: BudgetBucketExportRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [number, string, string, number]
    rows.push({
      id: r[0],
      name: r[1],
      icon: r[2],
      sort_order: r[3],
    })
  }
  stmt.free()
  return rows
}

function collectBudgetHypotheticals(): BudgetHypotheticalExportRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT bucket_id, name, amount_cents, frequency, is_hypothetical
     FROM budget_hypotheticals ORDER BY bucket_id, id`
  )
  const rows: BudgetHypotheticalExportRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [number, string, number, string, number]
    rows.push({
      bucket_id: r[0],
      name: r[1],
      amount_cents: r[2],
      frequency: r[3],
      is_hypothetical: r[4],
    })
  }
  stmt.free()
  return rows
}

function collectManualAccounts(): ManualAccountExportRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT name, institution, account_type, kind, balance_cents,
            credit_limit_cents, interest_rate_bps, rate_type,
            fixed_rate_expiry_date, notes, sort_order, last_updated_at, created_at
     FROM manual_accounts ORDER BY sort_order, id`
  )
  const rows: ManualAccountExportRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      string | null,
      string,
      string,
      number,
      number | null,
      number | null,
      string | null,
      string | null,
      string | null,
      number,
      string,
      string,
    ]
    rows.push({
      name: r[0],
      institution: r[1],
      account_type: r[2],
      kind: r[3],
      balance_cents: r[4],
      credit_limit_cents: r[5],
      interest_rate_bps: r[6],
      rate_type: r[7],
      fixed_rate_expiry_date: r[8],
      notes: r[9],
      sort_order: r[10],
      last_updated_at: r[11],
      created_at: r[12],
    })
  }
  stmt.free()
  return rows
}

function collectNetWorthSnapshots(): NetWorthSnapshotExportRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT snapshot_date, up_bank_cents, manual_assets_cents, manual_liabilities_cents
     FROM net_worth_snapshots ORDER BY snapshot_date`
  )
  const rows: NetWorthSnapshotExportRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [string, number, number, number]
    rows.push({
      snapshot_date: r[0],
      up_bank_cents: r[1],
      manual_assets_cents: r[2],
      manual_liabilities_cents: r[3],
    })
  }
  stmt.free()
  return rows
}

/**
 * Build the plain-text export payload (before encryption).
 */
export function buildExportPayload(): ExportPayload {
  const settings = collectWhitelistedSettings()
  const trackers = collectTrackers()
  const trackerCategories = collectTrackerCategories()
  const trackerConfigHistory = collectTrackerConfigHistory()
  const upcomingCharges = collectUpcomingCharges()
  const budgetBuckets = collectBudgetBuckets()
  const budgetHypotheticals = collectBudgetHypotheticals()
  const manualAccounts = collectManualAccounts()
  const netWorthSnapshots = collectNetWorthSnapshots()

  return {
    version: EXPORT_PAYLOAD_VERSION,
    exportedAt: new Date().toISOString(),
    appSchemaVersion: SCHEMA_VERSION,
    settings,
    trackers,
    trackerCategories,
    trackerConfigHistory,
    upcomingCharges,
    budgetBuckets,
    budgetHypotheticals,
    manualAccounts,
    netWorthSnapshots,
  }
}

/**
 * Encrypt the payload with a passphrase and return the file wrapper.
 */
export async function encryptExportPayload(
  payload: ExportPayload,
  passphrase: string
): Promise<ExportFileWrapper> {
  const salt = generateSalt()
  const key = await deriveKeyFromPassphrase(passphrase, salt)
  const json = JSON.stringify(payload)
  const ciphertext = await encryptToken(json, key)
  return {
    salt,
    iterations: PBKDF2_ITERATIONS,
    ciphertext,
    formatVersion: EXPORT_FILE_VERSION,
  }
}

/**
 * Export profile to an encrypted file and trigger download.
 */
export async function exportProfile(passphrase: string): Promise<void> {
  const db = getDb()
  if (!db) throw new Error('Database not ready')

  const payload = buildExportPayload()
  const wrapper = await encryptExportPayload(payload, passphrase)
  const json = JSON.stringify(wrapper)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `vantura-settings-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** User-facing error when the import file format is invalid. */
export const IMPORT_ERROR_INVALID_FILE =
  'This file is not a valid Vantura settings export.'

/** User-facing error when the passphrase does not match the file. */
export const IMPORT_ERROR_WRONG_PASSPHRASE =
  'Incorrect passphrase for this settings file. Please try again.'

/**
 * Read and parse an import file. Throws if invalid structure.
 */
export function parseImportFile(file: ExportFileWrapper): ExportFileWrapper {
  if (
    typeof file.salt !== 'string' ||
    file.salt === '' ||
    typeof file.ciphertext !== 'string' ||
    file.ciphertext === '' ||
    typeof file.iterations !== 'number'
  ) {
    throw new Error(IMPORT_ERROR_INVALID_FILE)
  }
  return file
}

/**
 * Decrypt and parse an import file without writing to the database.
 * Use for preview before applying selective import.
 */
export async function previewImportProfile(
  file: File,
  passphrase: string
): Promise<ExportPayload> {
  const text = await file.text()
  let wrapper: ExportFileWrapper
  try {
    wrapper = JSON.parse(text) as ExportFileWrapper
  } catch {
    throw new Error(IMPORT_ERROR_INVALID_FILE)
  }
  parseImportFile(wrapper)
  return decryptImportFile(wrapper, passphrase)
}

/**
 * Decrypt a file wrapper and parse the payload.
 */
export async function decryptImportFile(
  wrapper: ExportFileWrapper,
  passphrase: string
): Promise<ExportPayload> {
  const { salt, iterations, ciphertext } = wrapper
  if (!salt || !ciphertext || typeof iterations !== 'number') {
    throw new Error(IMPORT_ERROR_INVALID_FILE)
  }
  const key = await deriveKeyFromPassphrase(passphrase, salt)
  let json: string
  try {
    json = await decryptToken(ciphertext, key)
  } catch {
    throw new Error(IMPORT_ERROR_WRONG_PASSPHRASE)
  }
  let payload: ExportPayload
  try {
    payload = JSON.parse(json) as ExportPayload
  } catch {
    throw new Error(IMPORT_ERROR_INVALID_FILE)
  }

  if (
    typeof payload.version !== 'number' ||
    typeof payload.appSchemaVersion !== 'number'
  ) {
    throw new Error(IMPORT_ERROR_INVALID_FILE)
  }
  if (payload.appSchemaVersion > SCHEMA_VERSION) {
    throw new Error(
      'Import file was created with a newer app version. Please update Vantura and try again.'
    )
  }

  return payload
}

function categoryExists(
  db: ReturnType<typeof getDb>,
  categoryId: string
): boolean {
  if (!db) return false
  const stmt = db.prepare(`SELECT 1 FROM categories WHERE id = ?`)
  stmt.bind([categoryId])
  const found = stmt.step()
  stmt.free()
  return found
}

/** Options for selective import; each section controls whether to overwrite that data. */
export interface ImportOptions {
  settings: boolean
  trackers: boolean
  upcomingCharges: boolean
  budgetPlan: boolean
  /** #34 — manual_accounts + net_worth_snapshots (Net Worth). */
  netWorth: boolean
}

/** Apply whitelisted settings from payload. */
export function applySettings(settings: Record<string, string>): void {
  const whitelist = new Set(SETTINGS_WHITELIST)
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (typeof value !== 'string') continue
    if (
      whitelist.has(key as (typeof SETTINGS_WHITELIST)[number]) ||
      key.startsWith('saver_goal_date_')
    ) {
      setAppSetting(key, value)
    }
  }
}

/**
 * Replace budget_buckets and budget_hypotheticals with imported data.
 * Returns a map of old bucket ID → new bucket ID for use by replaceTrackers
 * and replaceUpcomingCharges.
 */
export function replaceBudgetPlan(
  budgetBuckets: BudgetBucketExportRow[],
  budgetHypotheticals: BudgetHypotheticalExportRow[]
): Map<number, number> {
  const db = getDb()
  if (!db) throw new Error('Database not ready')

  // budget_transaction_anchors link real local transactions to a bucket —
  // losing that link is real data loss unrelated to what's being imported.
  // Match existing local buckets to imported ones by name (best-effort; the
  // only identifier that can survive an export/import across databases,
  // since ids are local-database-specific) so anchors on a bucket that
  // still exists after the swap are remapped, not destroyed.
  const existingBucketsStmt = db.prepare(`SELECT id, name FROM budget_buckets`)
  const existingIdByName = new Map<string, number>()
  while (existingBucketsStmt.step()) {
    const [id, name] = existingBucketsStmt.get() as [number, string]
    existingIdByName.set(name, id)
  }
  existingBucketsStmt.free()

  db.run(`DELETE FROM budget_hypotheticals`)
  db.run(`DELETE FROM budget_buckets`)

  const now = new Date().toISOString()
  const bucketIdMap = new Map<number, number>()

  const bucketsArr = Array.isArray(budgetBuckets) ? budgetBuckets : []
  for (const b of bucketsArr) {
    if (typeof b.name !== 'string' || b.name === '') continue
    const icon = typeof b.icon === 'string' && b.icon ? b.icon : 'mdi-wallet'
    const sortOrder = typeof b.sort_order === 'number' ? b.sort_order : 0
    db.run(
      `INSERT INTO budget_buckets (name, icon, sort_order, created_at)
       VALUES (?, ?, ?, ?)`,
      [b.name, icon, sortOrder, now]
    )
    const result = db.exec('SELECT last_insert_rowid()')
    const newId = (result[0]?.values?.[0]?.[0] as number) ?? 0
    const oldId = typeof b.id === 'number' ? b.id : bucketsArr.indexOf(b) + 1
    bucketIdMap.set(oldId, newId)

    const existingLocalId = existingIdByName.get(b.name)
    if (existingLocalId != null) {
      db.run(
        `UPDATE budget_transaction_anchors SET bucket_id = ? WHERE bucket_id = ?`,
        [newId, existingLocalId]
      )
    }
  }

  // Anchors whose bucket didn't survive the swap (renamed or removed) now
  // point at a deleted bucket id — clean those up.
  db.run(
    `DELETE FROM budget_transaction_anchors WHERE bucket_id NOT IN (SELECT id FROM budget_buckets)`
  )

  const hypsArr = Array.isArray(budgetHypotheticals) ? budgetHypotheticals : []
  for (const h of hypsArr) {
    if (
      typeof h.name !== 'string' ||
      typeof h.amount_cents !== 'number' ||
      typeof h.frequency !== 'string'
    ) {
      continue
    }
    const newBucketId = bucketIdMap.get(h.bucket_id)
    if (newBucketId == null) continue
    const isHyp = typeof h.is_hypothetical === 'number' ? h.is_hypothetical : 0
    db.run(
      `INSERT INTO budget_hypotheticals
         (bucket_id, name, amount_cents, frequency, is_hypothetical, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newBucketId, h.name, h.amount_cents, h.frequency, isHyp, now]
    )
  }

  return bucketIdMap
}

/** Replace trackers, tracker_categories and tracker_config_history with imported data. */
export function replaceTrackers(
  trackers: TrackerExportRow[],
  trackerCategories: { tracker_id: number; category_id: string }[],
  trackerConfigHistory: TrackerConfigHistoryExportRow[] = [],
  bucketIdMap: Map<number, number> = new Map()
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM tracker_config_history_categories`)
  db.run(`DELETE FROM tracker_config_history`)
  db.run(`DELETE FROM tracker_categories`)
  db.run(`DELETE FROM trackers`)

  const now = new Date().toISOString()
  const trackerIdMap = new Map<number, number>()
  const trackersArr = Array.isArray(trackers) ? trackers : []
  for (const t of trackersArr) {
    if (
      typeof t.name !== 'string' ||
      typeof t.budget_amount !== 'number' ||
      typeof t.reset_frequency !== 'string'
    ) {
      continue
    }
    const resetDay = t.reset_day != null ? t.reset_day : null
    const startDate =
      typeof t.start_date === 'string' && t.start_date.length >= 10
        ? t.start_date.slice(0, 10)
        : now.slice(0, 10)
    const lastReset =
      typeof t.last_reset_date === 'string' && t.last_reset_date.length >= 10
        ? t.last_reset_date.slice(0, 10)
        : startDate
    const nextReset =
      typeof t.next_reset_date === 'string' && t.next_reset_date.length >= 10
        ? t.next_reset_date.slice(0, 10)
        : startDate
    const isActive = typeof t.is_active === 'number' ? t.is_active : 1
    const bucketId =
      t.bucket_id != null ? (bucketIdMap.get(t.bucket_id) ?? null) : null

    db.run(
      `INSERT INTO trackers
         (name, budget_amount, reset_frequency, reset_day, start_date,
          last_reset_date, next_reset_date, is_active, created_at, bucket_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.name,
        t.budget_amount,
        t.reset_frequency,
        resetDay,
        startDate,
        lastReset,
        nextReset,
        isActive,
        now,
        bucketId,
      ]
    )
    const result = db.exec('SELECT last_insert_rowid()')
    const newId = (result[0]?.values?.[0]?.[0] as number) ?? 0
    const oldId = typeof t.id === 'number' ? t.id : trackersArr.indexOf(t) + 1
    trackerIdMap.set(oldId, newId)
  }

  const tcArr = Array.isArray(trackerCategories) ? trackerCategories : []
  for (const tc of tcArr) {
    if (
      typeof tc.tracker_id !== 'number' ||
      typeof tc.category_id !== 'string' ||
      tc.category_id === ''
    ) {
      continue
    }
    const newTrackerId = trackerIdMap.get(tc.tracker_id)
    if (newTrackerId == null) continue
    if (!categoryExists(db, tc.category_id)) continue
    db.run(
      `INSERT OR IGNORE INTO tracker_categories (tracker_id, category_id) VALUES (?, ?)`,
      [newTrackerId, tc.category_id]
    )
  }

  // Config history (#16). Remap tracker ids; drop unknown categories. Every
  // tracker that ends up with no history row gets a synthesised genesis row
  // (from a pre-v4 export, or one whose rows were all invalid) so "config as of
  // day D" stays defined for the split calc.
  const chArr = Array.isArray(trackerConfigHistory) ? trackerConfigHistory : []
  const trackersWithHistory = new Set<number>()
  for (const ch of chArr) {
    if (
      typeof ch.tracker_id !== 'number' ||
      typeof ch.effective_from !== 'string' ||
      ch.effective_from.length < 10 ||
      typeof ch.budget_amount !== 'number'
    ) {
      continue
    }
    const newTrackerId = trackerIdMap.get(ch.tracker_id)
    if (newTrackerId == null) continue
    const catIds = (
      Array.isArray(ch.category_ids) ? ch.category_ids : []
    ).filter((c): c is string => typeof c === 'string' && categoryExists(db, c))
    writeTrackerConfigVersion(
      db,
      newTrackerId,
      ch.effective_from.slice(0, 10),
      ch.budget_amount,
      catIds
    )
    trackersWithHistory.add(newTrackerId)
  }
  for (const newId of trackerIdMap.values()) {
    if (trackersWithHistory.has(newId)) continue
    const trackerRow = db.exec(
      `SELECT last_reset_date, budget_amount FROM trackers WHERE id = ?`,
      [newId]
    )
    const effectiveFrom = String(
      trackerRow[0]?.values?.[0]?.[0] ?? now.slice(0, 10)
    ).slice(0, 10)
    const budgetAmount = Number(trackerRow[0]?.values?.[0]?.[1] ?? 0)
    const catRows = db.exec(
      `SELECT category_id FROM tracker_categories WHERE tracker_id = ?`,
      [newId]
    )
    const cats = (catRows[0]?.values ?? []).map((c) => String(c[0]))
    writeTrackerConfigVersion(db, newId, effectiveFrom, budgetAmount, cats)
  }
}

/** Replace upcoming_charges with imported data. */
export function replaceUpcomingCharges(
  upcomingCharges: UpcomingChargeExportRow[],
  bucketIdMap: Map<number, number> = new Map()
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM upcoming_charges`)

  const now = new Date().toISOString()
  const charges = Array.isArray(upcomingCharges) ? upcomingCharges : []
  for (const uc of charges) {
    if (
      typeof uc.name !== 'string' ||
      typeof uc.amount !== 'number' ||
      typeof uc.frequency !== 'string' ||
      typeof uc.next_charge_date !== 'string'
    ) {
      continue
    }
    const nextCharge =
      uc.next_charge_date.length >= 10
        ? uc.next_charge_date.slice(0, 10)
        : now.slice(0, 10)
    const categoryId =
      uc.category_id != null &&
      typeof uc.category_id === 'string' &&
      categoryExists(db, uc.category_id)
        ? uc.category_id
        : null
    const isReserved = typeof uc.is_reserved === 'number' ? uc.is_reserved : 1
    const reminderDaysBefore =
      typeof uc.reminder_days_before === 'number'
        ? uc.reminder_days_before
        : null
    const cancelByDate =
      typeof uc.cancel_by_date === 'string' && uc.cancel_by_date
        ? uc.cancel_by_date.slice(0, 10)
        : null
    const bucketId =
      uc.bucket_id != null ? (bucketIdMap.get(uc.bucket_id) ?? null) : null

    db.run(
      `INSERT INTO upcoming_charges
         (name, amount, frequency, next_charge_date, category_id, is_reserved,
          reminder_days_before, cancel_by_date, bucket_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uc.name,
        uc.amount,
        uc.frequency,
        nextCharge,
        categoryId,
        isReserved,
        reminderDaysBefore,
        cancelByDate,
        bucketId,
        now,
      ]
    )
  }
}

/**
 * #34 — Replace manual_accounts and net_worth_snapshots with imported data.
 * Both are full delete-then-reinsert (ADR-0013). manual_accounts.id is local
 * AUTOINCREMENT so it is dropped on export and regenerated here; nothing
 * references it across the export boundary. net_worth_snapshots carry no
 * manual-account foreign keys — they are pre-aggregated daily totals keyed by
 * date — so they just copy across.
 */
export function replaceNetWorth(
  manualAccounts: ManualAccountExportRow[] = [],
  netWorthSnapshots: NetWorthSnapshotExportRow[] = []
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM net_worth_snapshots`)
  db.run(`DELETE FROM manual_accounts`)

  const now = new Date().toISOString()
  const accounts = Array.isArray(manualAccounts) ? manualAccounts : []
  for (const a of accounts) {
    if (
      typeof a.name !== 'string' ||
      a.name === '' ||
      typeof a.account_type !== 'string' ||
      (a.kind !== 'asset' && a.kind !== 'liability') ||
      typeof a.balance_cents !== 'number'
    ) {
      continue
    }
    const str = (v: unknown): string | null =>
      typeof v === 'string' && v !== '' ? v : null
    const num = (v: unknown): number | null =>
      typeof v === 'number' ? v : null
    const lastUpdatedAt =
      typeof a.last_updated_at === 'string' && a.last_updated_at
        ? a.last_updated_at
        : now
    const createdAt =
      typeof a.created_at === 'string' && a.created_at ? a.created_at : now
    db.run(
      `INSERT INTO manual_accounts
         (name, institution, account_type, kind, balance_cents, credit_limit_cents,
          interest_rate_bps, rate_type, fixed_rate_expiry_date, notes, sort_order,
          last_updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.name,
        str(a.institution),
        a.account_type,
        a.kind,
        a.balance_cents,
        num(a.credit_limit_cents),
        num(a.interest_rate_bps),
        str(a.rate_type),
        str(a.fixed_rate_expiry_date),
        str(a.notes),
        typeof a.sort_order === 'number' ? a.sort_order : 0,
        lastUpdatedAt,
        createdAt,
      ]
    )
  }

  const snapshots = Array.isArray(netWorthSnapshots) ? netWorthSnapshots : []
  for (const s of snapshots) {
    if (
      typeof s.snapshot_date !== 'string' ||
      s.snapshot_date.length < 10 ||
      typeof s.up_bank_cents !== 'number' ||
      typeof s.manual_assets_cents !== 'number' ||
      typeof s.manual_liabilities_cents !== 'number'
    ) {
      continue
    }
    db.run(
      `INSERT OR REPLACE INTO net_worth_snapshots
         (snapshot_date, up_bank_cents, manual_assets_cents, manual_liabilities_cents)
       VALUES (?, ?, ?, ?)`,
      [
        s.snapshot_date.slice(0, 10),
        s.up_bank_cents,
        s.manual_assets_cents,
        s.manual_liabilities_cents,
      ]
    )
  }
}

/**
 * Import payload into the database with optional section selection.
 * Budget plan is applied first so bucket IDs can be remapped for trackers
 * and upcoming charges.
 *
 * The whole import runs inside a single SQLite transaction: each `replace*`
 * helper does its own DELETE-then-reinsert, so without this a throw partway
 * through (a malformed row sql.js refuses to bind, say) would leave the DB
 * half-rewritten and the next page load would quietly treat that as the new
 * state. On any error we ROLLBACK to the pre-import state and rethrow.
 *
 * This is the only sql.js write path that wraps itself in an explicit
 * transaction. The `replace*` / `applySettings` helpers must stay
 * non-transactional so this outer BEGIN/COMMIT is never nested (SQLite has no
 * nested transactions).
 */
export function importPayloadWithOptions(
  payload: ExportPayload,
  options: ImportOptions
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')

  db.run('BEGIN')
  try {
    if (options.settings) {
      applySettings(payload.settings ?? {})
    }

    // Budget plan must be imported before trackers/charges so the ID map is ready.
    let bucketIdMap = new Map<number, number>()
    if (options.budgetPlan) {
      bucketIdMap = replaceBudgetPlan(
        payload.budgetBuckets ?? [],
        payload.budgetHypotheticals ?? []
      )
    }

    if (options.trackers) {
      replaceTrackers(
        payload.trackers ?? [],
        payload.trackerCategories ?? [],
        payload.trackerConfigHistory ?? [],
        bucketIdMap
      )
    }
    if (options.upcomingCharges) {
      replaceUpcomingCharges(payload.upcomingCharges ?? [], bucketIdMap)
    }
    if (options.netWorth) {
      replaceNetWorth(
        payload.manualAccounts ?? [],
        payload.netWorthSnapshots ?? []
      )
    }

    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }

  schedulePersist()
}
