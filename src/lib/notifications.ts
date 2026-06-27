/**
 * Browser Notifications API wrapper + local notification history.
 * Local-only; no server push. User must grant permission.
 */

import { getDb, getAppSetting, setAppSetting, schedulePersist } from '@/db'
import { APP_VERSION } from '@/lib/appVersion'
import type { Milestone } from '@/data/changelog'

const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled'
const LAST_NOTIFICATION_DATE_KEY = 'last_notification_date'

// ─── OS permission / master toggle ───────────────────────────────────────────

export function isNotificationSupported(): boolean {
  return 'Notification' in window
}

export function getNotificationsEnabled(): boolean {
  return getAppSetting(NOTIFICATIONS_ENABLED_KEY) === '1'
}

export function setNotificationsEnabled(enabled: boolean): void {
  setAppSetting(NOTIFICATIONS_ENABLED_KEY, enabled ? '1' : '0')
}

export function getNotificationPermission(): NotificationPermission | null {
  if (!isNotificationSupported()) return null
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function showNotification(title: string, body: string): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted')
    return
  try {
    new Notification(title, { body })
  } catch {
    // Notification constructor can throw in some environments
  }
}

/** Check if we already fired due-soon notifications today (avoid spamming). */
export function hasNotifiedToday(): boolean {
  const last = getAppSetting(LAST_NOTIFICATION_DATE_KEY)
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return last === today
}

export function markNotifiedToday(): void {
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  setAppSetting(LAST_NOTIFICATION_DATE_KEY, today)
}

// ─── Per-type toggle helpers ──────────────────────────────────────────────────

export type NotifType =
  | 'bills'
  | 'tracker_overspent'
  | 'tracker_pace'
  | 'spendable_low'
  | 'payday'
  | 'large_tx'
  | 'saver_milestone'
  | 'sync_stale'

/** Returns true if the per-type sub-toggle is on (defaults to true for most types). */
export function getNotifTypeEnabled(type: NotifType): boolean {
  const raw = getAppSetting(`notif_${type}`)
  // Default on for most types; large_tx and sync_stale default off (need user opt-in)
  if (raw === null) {
    return type !== 'large_tx' && type !== 'sync_stale'
  }
  return raw === '1'
}

export function setNotifTypeEnabled(type: NotifType, enabled: boolean): void {
  setAppSetting(`notif_${type}`, enabled ? '1' : '0')
}

export function getLargeTxThresholdCents(): number {
  const raw = getAppSetting('notif_large_tx_threshold_cents')
  if (!raw) return 20000 // default $200
  const parsed = parseInt(raw, 10)
  return Number.isNaN(parsed) || parsed <= 0 ? 20000 : parsed
}

export function setLargeTxThresholdCents(cents: number): void {
  setAppSetting('notif_large_tx_threshold_cents', String(cents))
}

// ─── Notification history ─────────────────────────────────────────────────────

export interface NotificationHistoryItem {
  id: number
  type: string
  title: string
  body: string
  link_path: string | null
  link_label: string | null
  created_at: string
  read_at: string | null
}

const HISTORY_RETENTION_DAYS = 30

function todayDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Insert a notification into history and prune entries older than 30 days. */
export function addNotificationToHistory(
  type: string,
  title: string,
  body: string,
  linkPath: string | null = null,
  linkLabel: string | null = null
): void {
  const db = getDb()
  if (!db) return
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO notification_history (type, title, body, link_path, link_label, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [type, title, body, linkPath, linkLabel, now]
  )
  pruneOldNotifications()
  schedulePersist()
}

/** All notifications from the last 30 days, newest first. */
export function getNotificationHistory(): NotificationHistoryItem[] {
  const db = getDb()
  if (!db) return []
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS)
  const cutoffIso = cutoff.toISOString()
  const stmt = db.prepare(
    `SELECT id, type, title, body, link_path, link_label, created_at, read_at
     FROM notification_history
     WHERE created_at >= ?
     ORDER BY created_at DESC`
  )
  stmt.bind([cutoffIso])
  const out: NotificationHistoryItem[] = []
  while (stmt.step()) {
    const r = stmt.get() as [
      number,
      string,
      string,
      string,
      string | null,
      string | null,
      string,
      string | null,
    ]
    out.push({
      id: r[0],
      type: r[1],
      title: r[2],
      body: r[3],
      link_path: r[4],
      link_label: r[5],
      created_at: r[6],
      read_at: r[7],
    })
  }
  stmt.free()
  return out
}

/** Count of unread notification history entries from the last 30 days. */
export function getUnreadCount(): number {
  const db = getDb()
  if (!db) return 0
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS)
  const cutoffIso = cutoff.toISOString()
  const stmt = db.prepare(
    `SELECT COUNT(*) FROM notification_history WHERE read_at IS NULL AND created_at >= ?`
  )
  stmt.bind([cutoffIso])
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
}

/** Mark the given notification IDs as read (sets read_at to now). */
export function markNotificationsRead(ids: number[]): void {
  const db = getDb()
  if (!db || ids.length === 0) return
  const now = new Date().toISOString()
  const placeholders = ids.map(() => '?').join(',')
  db.run(
    `UPDATE notification_history SET read_at = ? WHERE id IN (${placeholders}) AND read_at IS NULL`,
    [now, ...ids]
  )
  schedulePersist()
}

/** Mark all notifications as read. */
export function markAllNotificationsRead(): void {
  const db = getDb()
  if (!db) return
  const now = new Date().toISOString()
  db.run(`UPDATE notification_history SET read_at = ? WHERE read_at IS NULL`, [
    now,
  ])
  schedulePersist()
}

/** Delete a single notification history entry by id. */
export function dismissNotification(id: number): void {
  const db = getDb()
  if (!db) return
  db.run(`DELETE FROM notification_history WHERE id = ?`, [id])
  schedulePersist()
}

/** Delete all notification history entries. */
export function clearAllNotifications(): void {
  const db = getDb()
  if (!db) return
  db.run(`DELETE FROM notification_history`)
  schedulePersist()
}

/** Delete entries older than HISTORY_RETENTION_DAYS. Called after every insert. */
export function pruneOldNotifications(): void {
  const db = getDb()
  if (!db) return
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS)
  db.run(`DELETE FROM notification_history WHERE created_at < ?`, [
    cutoff.toISOString(),
  ])
}

// ─── What's New seeding ───────────────────────────────────────────────────────

const WHATS_NEW_SEEDED_KEY = 'vantura_notif_whats_new_seeded'

/**
 * Insert each milestone as a `whats_new` notification entry.
 * Runs at most once per app version — tracked in localStorage so it
 * survives page reloads without duplicating entries.
 */
export function seedWhatsNewNotifications(milestones: Milestone[]): void {
  if (!milestones.length) return
  if (localStorage.getItem(WHATS_NEW_SEEDED_KEY) === APP_VERSION) return

  for (const m of milestones) {
    const body =
      m.items.length > 1
        ? `${m.items[0].text} +${m.items.length - 1} more`
        : m.items[0].text
    addNotificationToHistory(
      'whats_new',
      `v${m.version} — ${m.heading}`,
      body,
      '/changelog',
      'View changelog'
    )
  }

  localStorage.setItem(WHATS_NEW_SEEDED_KEY, APP_VERSION)
}

// ─── Per-check guard helpers ──────────────────────────────────────────────────

/** True if the guard key for this check type was already set to today's date. */
export function hasCheckedToday(guardKey: string): boolean {
  const stored = getAppSetting(guardKey)
  return stored === todayDateString()
}

export function markCheckedToday(guardKey: string): void {
  setAppSetting(guardKey, todayDateString())
}
