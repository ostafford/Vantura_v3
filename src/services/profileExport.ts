/**
 * Profile export/import: encrypted file-based transfer of settings, trackers,
 * upcoming charges, budget plan, per-saver goal history and the Savers switched
 * on for On hand between devices. Never exports Up Bank transactions or accounts, the API token, or encryption
 * keys. Nothing here makes a network call.
 */

import { getDb, getAppSetting, setAppSetting, schedulePersist } from '@/db'
import {
  generateSalt,
  deriveKeyFromPassphrase,
  encryptToken,
  decryptToken,
  PBKDF2_ITERATIONS,
  PASSPHRASE_MIN_LENGTH,
} from '@/lib/crypto'
import { SCHEMA_VERSION } from '@/db/schema'
import { localCalendarMonthResetDates } from '@/lib/dateStr'
import { isValidTrackerResetDay, writeTrackerConfigVersion } from './trackers'

/**
 * Export format version for the encrypted payload. v10 (#204): the
 * `budgetHypotheticals` section is no longer written. v11 (#208): the
 * notification settings are no longer written. v12 (#209): the
 * `manualAccounts` and `netWorthSnapshots` sections and the Regulars'
 * `charge_type` / `linked_account_name` fields are no longer written.
 * v13 (#213): the `onHandSaverIds` section is written.
 */
const EXPORT_PAYLOAD_VERSION = 13

/** File wrapper version for the outer JSON structure */
const EXPORT_FILE_VERSION = 1

/**
 * Strict whitelist of app_settings keys allowed in export.
 * Any key not in this list is NEVER exported. (Per-saver goals moved out of
 * app_settings into the `saverGoals` payload section in v6 / #29.)
 */
export const SETTINGS_WHITELIST: readonly string[] = [
  'theme_mode',
  'payday_frequency',
  'payday_day',
  'next_payday',
  'pay_amount_cents',
  'spendable_alert_below_cents',
  'spendable_alert_below_pct_pay',
  'dashboard_tour_completed',
  'dashboard_section_order',
  'lock_timeout_minutes',
  'saver_account_order',
  'essentials_saver_account_id',
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
  /** #29 — per-saver goal history. Absent in payloads from before v6. */
  saverGoals?: SaverGoalExportRow[]
  /**
   * #213 — the Up account ids of the Savers switched on for On hand. Ids are
   * cross-database stable, so no remap. Absent in payloads from before v13.
   */
  onHandSaverIds?: string[]
}

/**
 * #29 — a `saver_goal_history` row minus its local AUTOINCREMENT `id`.
 * `saver_id` is the Up account id, which is cross-database stable, so no remap.
 */
export interface SaverGoalExportRow {
  saver_id: string
  goal_amount_cents: number
  goal_date: string | null
  created_at: string
  achieved_at: string | null
  archived_at: string | null
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
  /** #38 — cadence this row's budget is denominated in; set only on a frequency-change row. Absent before payload v7. */
  reset_frequency?: string | null
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
  /** #111 — Up `description` of the Regular's linked payments (docs/adr/0020). Absent before payload v8. */
  match_description?: string | null
}

export interface BudgetBucketExportRow {
  id: number
  name: string
  icon: string
  sort_order: number
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
  return settings
}

/** #29 — every `saver_goal_history` row, oldest cycle first, minus the local id. */
function collectSaverGoals(): SaverGoalExportRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT saver_id, goal_amount_cents, goal_date, created_at, achieved_at, archived_at
     FROM saver_goal_history ORDER BY saver_id, created_at, id`
  )
  const rows: SaverGoalExportRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      number,
      string | null,
      string,
      string | null,
      string | null,
    ]
    rows.push({
      saver_id: r[0],
      goal_amount_cents: r[1],
      goal_date: r[2],
      created_at: r[3],
      achieved_at: r[4],
      archived_at: r[5],
    })
  }
  stmt.free()
  return rows
}

/** #213 — ids of the Savers switched on for On hand, in id order. */
function collectOnHandSaverIds(): string[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id FROM accounts
     WHERE account_type = 'SAVER' AND counts_on_hand = 1 ORDER BY id`
  )
  const ids: string[] = []
  while (stmt.step()) ids.push(String(stmt.get()[0]))
  stmt.free()
  return ids
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
    `SELECT id, tracker_id, effective_from, budget_amount, reset_frequency
     FROM tracker_config_history ORDER BY tracker_id, effective_from, id`
  )
  const byConfigId = new Map<number, TrackerConfigHistoryExportRow>()
  const rows: TrackerConfigHistoryExportRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [number, number, string, number, string | null]
    const row: TrackerConfigHistoryExportRow = {
      tracker_id: r[1],
      effective_from: String(r[2]).slice(0, 10),
      budget_amount: r[3],
      category_ids: [],
      reset_frequency: r[4] ?? null,
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
      reminder_days_before, cancel_by_date, bucket_id, match_description
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
      string | null,
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
      match_description: r[9] ?? null,
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
  const saverGoals = collectSaverGoals()
  const onHandSaverIds = collectOnHandSaverIds()

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
    saverGoals,
    onHandSaverIds,
  }
}

/**
 * Encrypt the payload with a passphrase and return the file wrapper.
 */
/** User-facing error when the chosen export passphrase is too short (#32). */
export const EXPORT_ERROR_PASSPHRASE_TOO_SHORT = `Passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters.`

export async function encryptExportPayload(
  payload: ExportPayload,
  passphrase: string
): Promise<ExportFileWrapper> {
  if (passphrase.length < PASSPHRASE_MIN_LENGTH) {
    throw new Error(EXPORT_ERROR_PASSPHRASE_TOO_SHORT)
  }
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

/**
 * User-facing error when an imported tracker's reset_day isn't valid for its
 * reset_frequency (#150). The whole import is refused — nothing is written.
 */
export const IMPORT_ERROR_INVALID_TRACKER_RESET =
  'This file has a tracker with an invalid reset day. Nothing was imported.'

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

/**
 * Sections an older export may carry for features Vantura has since cut.
 * They're never imported; the importer skips them and says so rather than
 * refusing the file (#170). Each later cut adds its section here.
 */
const CUT_SECTIONS: readonly {
  key: string
  singular: string
  plural: string
}[] = [
  {
    key: 'budgetHypotheticals',
    singular: 'hypothetical line',
    plural: 'hypothetical lines',
  },
  {
    key: 'manualAccounts',
    singular: 'Net Worth account',
    plural: 'Net Worth accounts',
  },
  {
    key: 'netWorthSnapshots',
    singular: 'Net Worth history entry',
    plural: 'Net Worth history entries',
  },
]

/**
 * Settings an older export may carry for features Vantura has since cut. The
 * whitelist no longer has them, so `applySettings` already ignores them; the
 * importer names them so the user knows they were skipped (#170).
 */
const CUT_SETTINGS: readonly { keys: readonly string[]; notice: string }[] = [
  {
    // #208 — every notification setting an export ever carried (v1–v10).
    keys: [
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
    ],
    notice: 'Skipped your notification settings. Vantura no longer has them.',
  },
]

/**
 * The notice the import step shows for an older export's cut sections and
 * settings, e.g. "Skipped 2 hypothetical lines. Vantura no longer has them."
 * Null when the file carries none (or only empty sections).
 */
export function describeSkippedSections(payload: ExportPayload): string | null {
  const legacy = payload as unknown as Record<string, unknown>
  const notices: string[] = []
  for (const section of CUT_SECTIONS) {
    const rows = legacy[section.key]
    if (!Array.isArray(rows) || rows.length === 0) continue
    const noun = rows.length === 1 ? section.singular : section.plural
    notices.push(`Skipped ${rows.length} ${noun}. Vantura no longer has them.`)
  }
  const settings = payload.settings ?? {}
  for (const cut of CUT_SETTINGS) {
    if (
      cut.keys.some((key) =>
        Object.prototype.hasOwnProperty.call(settings, key)
      )
    ) {
      notices.push(cut.notice)
    }
  }
  return notices.length > 0 ? notices.join(' ') : null
}

/** Options for selective import; each section controls whether to overwrite that data. */
export interface ImportOptions {
  settings: boolean
  trackers: boolean
  upcomingCharges: boolean
  budgetPlan: boolean
}

/**
 * #206 — exports made before the Weekly Insights section was cut carry its
 * `insights` id in `dashboard_section_order`. Strip it the way migration v53
 * does, keeping every other section's position. A value that isn't a JSON
 * array is passed through: the reader already falls back to the default order.
 */
function stripCutDashboardSections(raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw
  }
  if (!Array.isArray(parsed) || !parsed.includes('insights')) return raw
  return JSON.stringify(parsed.filter((id) => id !== 'insights'))
}

/** Apply whitelisted settings from payload. */
export function applySettings(settings: Record<string, string>): void {
  const whitelist = new Set(SETTINGS_WHITELIST)
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (typeof value !== 'string') continue
    if (whitelist.has(key as (typeof SETTINGS_WHITELIST)[number])) {
      setAppSetting(
        key,
        key === 'dashboard_section_order'
          ? stripCutDashboardSections(value)
          : value
      )
    }
  }
}

/**
 * Replace budget_buckets with imported data.
 * Returns a map of old bucket ID → new bucket ID for use by replaceTrackers
 * and replaceUpcomingCharges.
 */
export function replaceBudgetPlan(
  budgetBuckets: BudgetBucketExportRow[]
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
    // An older export's PAYDAY tracker moves to MONTHLY, reset day 1, on the
    // current calendar month — the same rule as the v49 migration (#192).
    const wasPayday = t.reset_frequency === 'PAYDAY'
    const resetFrequency = wasPayday ? 'MONTHLY' : t.reset_frequency
    const resetDay = wasPayday ? 1 : t.reset_day != null ? t.reset_day : null
    // Refuse rather than clamp: the throw rolls back the whole import (#150).
    if (!isValidTrackerResetDay(resetFrequency, resetDay)) {
      throw new Error(IMPORT_ERROR_INVALID_TRACKER_RESET)
    }
    const startDate =
      typeof t.start_date === 'string' && t.start_date.length >= 10
        ? t.start_date.slice(0, 10)
        : now.slice(0, 10)
    const monthReset = wasPayday ? localCalendarMonthResetDates() : null
    const lastReset = monthReset
      ? monthReset.lastReset
      : typeof t.last_reset_date === 'string' && t.last_reset_date.length >= 10
        ? t.last_reset_date.slice(0, 10)
        : startDate
    const nextReset = monthReset
      ? monthReset.nextReset
      : typeof t.next_reset_date === 'string' && t.next_reset_date.length >= 10
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
        resetFrequency,
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
      catIds,
      ch.reset_frequency === 'PAYDAY'
        ? 'MONTHLY' // #192, as in the v49 migration
        : typeof ch.reset_frequency === 'string'
          ? ch.reset_frequency
          : null
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

/**
 * Replace upcoming_charges with imported data. An older export's
 * `charge_type` and `linked_account_name` (#118, cut in #209) are ignored: a
 * former liability repayment imports as an ordinary Regular.
 */
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
    const matchDescription =
      typeof uc.match_description === 'string' && uc.match_description
        ? uc.match_description
        : null

    db.run(
      `INSERT INTO upcoming_charges
         (name, amount, frequency, next_charge_date, category_id, is_reserved,
          reminder_days_before, cancel_by_date, bucket_id, match_description,
          created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        matchDescription,
        now,
      ]
    )
  }
}

/**
 * #29 — Replace saver_goal_history with imported data (full delete-then-reinsert).
 * Rows are keyed by the Up account id (`saver_id`), stable across the export
 * boundary, so no remap. After reinserting, re-mirror `accounts.target_amount_cents`
 * from each saver's open (non-archived) goal so AccountRow consumers stay correct.
 */
export function replaceSaverGoals(saverGoals: SaverGoalExportRow[] = []): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM saver_goal_history`)

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v !== '' ? v : null
  const rows = Array.isArray(saverGoals) ? saverGoals : []
  const openAmountBySaver = new Map<string, number>()
  for (const g of rows) {
    if (
      typeof g.saver_id !== 'string' ||
      g.saver_id === '' ||
      typeof g.goal_amount_cents !== 'number' ||
      g.goal_amount_cents <= 0 ||
      typeof g.created_at !== 'string' ||
      g.created_at === ''
    ) {
      continue
    }
    db.run(
      `INSERT INTO saver_goal_history
         (saver_id, goal_amount_cents, goal_date, created_at, achieved_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        g.saver_id,
        g.goal_amount_cents,
        str(g.goal_date),
        g.created_at,
        str(g.achieved_at),
        str(g.archived_at),
      ]
    )
    if (str(g.archived_at) == null) {
      openAmountBySaver.set(g.saver_id, g.goal_amount_cents)
    }
  }

  db.run(
    `UPDATE accounts SET target_amount_cents = NULL WHERE account_type = 'SAVER'`
  )
  for (const [saverId, cents] of openAmountBySaver) {
    db.run(`UPDATE accounts SET target_amount_cents = ? WHERE id = ?`, [
      cents,
      saverId,
    ])
  }
}

/**
 * #213 — Restore the On hand switch: every Saver goes off, then each listed id
 * that is an eligible Saver on this device (open, not joint) goes on. Ids for
 * accounts this device doesn't have are ignored. A pre-v13 payload has no
 * section, so `undefined` leaves every Saver off (#212).
 */
export function replaceOnHandSavers(ids: unknown): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`UPDATE accounts SET counts_on_hand = 0 WHERE counts_on_hand <> 0`)
  if (!Array.isArray(ids)) return
  for (const id of ids) {
    if (typeof id !== 'string' || id === '') continue
    db.run(
      `UPDATE accounts SET counts_on_hand = 1
       WHERE id = ? AND account_type = 'SAVER' AND is_closed = 0
         AND COALESCE(ownership_type, '') <> 'JOINT'`,
      [id]
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
      // Pre-v6 payloads have no saverGoals section. Guard it — an
      // unconditional replace with `[]` would wipe this device's
      // saver goals. (Pre-v6 files only ever carried a goal *date*, never the
      // amount, so there is nothing to reconstruct from them.)
      if (payload.saverGoals !== undefined) {
        replaceSaverGoals(payload.saverGoals)
      }
      replaceOnHandSavers(payload.onHandSaverIds)
    }

    // Budget plan must be imported before trackers/charges so the ID map is ready.
    let bucketIdMap = new Map<number, number>()
    if (options.budgetPlan) {
      bucketIdMap = replaceBudgetPlan(payload.budgetBuckets ?? [])
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

    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }

  schedulePersist()
}
