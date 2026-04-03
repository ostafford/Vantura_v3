/**
 * Profile export/import: encrypted file-based transfer of non-sensitive
 * settings, trackers, and upcoming charges between devices. Never exports
 * transactions, accounts, API tokens, or keys.
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

/** Export format version for the encrypted payload */
const EXPORT_PAYLOAD_VERSION = 2

/** File wrapper version for the outer JSON structure */
const EXPORT_FILE_VERSION = 1

/**
 * Strict whitelist of app_settings keys allowed in export.
 * Any key not in this list is NEVER exported.
 */
export const SETTINGS_WHITELIST: readonly string[] = [
  'theme',
  'accent_color',
  'payday_frequency',
  'payday_day',
  'next_payday',
  'pay_amount_cents',
  'spendable_alert_below_cents',
  'spendable_alert_below_pct_pay',
  'insights_category_colors',
  'dashboard_tour_completed',
  'dashboard_section_order',
  'categorization_rules',
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
  upcomingCharges: UpcomingChargeExportRow[]
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
  badge_color: string | null
}

export interface UpcomingChargeExportRow {
  name: string
  amount: number
  frequency: string
  next_charge_date: string
  category_id: string | null
  is_reserved: number
  reminder_days_before?: number | null
  is_subscription?: number
  cancel_by_date?: string | null
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

function collectTrackers(): TrackerExportRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, name, budget_amount, reset_frequency, reset_day, start_date,
            last_reset_date, next_reset_date, is_active, badge_color
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
      string | null,
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
      badge_color: r[9],
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

function collectUpcomingCharges(): UpcomingChargeExportRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT name, amount, frequency, next_charge_date, category_id, is_reserved,
      reminder_days_before, is_subscription, cancel_by_date
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
      number,
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
      is_subscription: r[7] ?? 0,
      cancel_by_date: r[8] ?? null,
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
  const upcomingCharges = collectUpcomingCharges()

  return {
    version: EXPORT_PAYLOAD_VERSION,
    exportedAt: new Date().toISOString(),
    appSchemaVersion: SCHEMA_VERSION,
    settings,
    trackers,
    trackerCategories,
    upcomingCharges,
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
 * Import profile from an encrypted file.
 */
export async function importProfile(
  file: File,
  passphrase: string
): Promise<void> {
  const text = await file.text()
  let wrapper: ExportFileWrapper
  try {
    wrapper = JSON.parse(text) as ExportFileWrapper
  } catch {
    throw new Error(IMPORT_ERROR_INVALID_FILE)
  }
  parseImportFile(wrapper)
  const payload = await decryptImportFile(wrapper, passphrase)
  importPayload(payload)
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
}

/** Apply whitelisted settings from payload. */
export function applySettings(settings: Record<string, string>): void {
  const whitelist = new Set(SETTINGS_WHITELIST)
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (
      whitelist.has(key as (typeof SETTINGS_WHITELIST)[number]) &&
      typeof value === 'string'
    ) {
      setAppSetting(key, value)
    }
  }
}

/** Replace trackers and tracker_categories with imported data. */
export function replaceTrackers(
  trackers: TrackerExportRow[],
  trackerCategories: { tracker_id: number; category_id: string }[]
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
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
    const badgeColor =
      t.badge_color != null && typeof t.badge_color === 'string'
        ? t.badge_color
        : null

    db.run(
      `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at, badge_color)
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
        badgeColor,
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
}

/** Replace upcoming_charges with imported data. */
export function replaceUpcomingCharges(
  upcomingCharges: UpcomingChargeExportRow[]
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
      uc.category_id != null && typeof uc.category_id === 'string'
        ? uc.category_id
        : null
    const isReserved = typeof uc.is_reserved === 'number' ? uc.is_reserved : 1
    const reminderDaysBefore =
      typeof uc.reminder_days_before === 'number'
        ? uc.reminder_days_before
        : null
    const isSubscription =
      typeof uc.is_subscription === 'number' ? uc.is_subscription : 0
    const cancelByDate =
      typeof uc.cancel_by_date === 'string' && uc.cancel_by_date
        ? uc.cancel_by_date.slice(0, 10)
        : null
    db.run(
      `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, category_id, is_reserved, reminder_days_before, is_subscription, cancel_by_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uc.name,
        uc.amount,
        uc.frequency,
        nextCharge,
        categoryId,
        isReserved,
        reminderDaysBefore,
        isSubscription,
        cancelByDate,
        now,
      ]
    )
  }
}

/**
 * Import payload into the database with optional section selection.
 * Only sections with options set to true will be applied; others are left unchanged.
 */
export function importPayloadWithOptions(
  payload: ExportPayload,
  options: ImportOptions
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')

  if (options.settings) {
    applySettings(payload.settings ?? {})
  }
  if (options.trackers) {
    replaceTrackers(payload.trackers ?? [], payload.trackerCategories ?? [])
  }
  if (options.upcomingCharges) {
    replaceUpcomingCharges(payload.upcomingCharges ?? [])
  }
  schedulePersist()
}

/**
 * Import payload into the database. Overwrites trackers, tracker_categories,
 * and upcoming_charges. Merges whitelisted settings.
 */
export function importPayload(payload: ExportPayload): void {
  importPayloadWithOptions(payload, {
    settings: true,
    trackers: true,
    upcomingCharges: true,
  })
}
