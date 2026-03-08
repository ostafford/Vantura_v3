/**
 * Browser Notifications API wrapper for bill reminders.
 * Local-only; no server push. User must grant permission.
 */

import { getAppSetting, setAppSetting } from '@/db'

const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled'
const LAST_NOTIFICATION_DATE_KEY = 'last_notification_date'

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

/**
 * Check if we already fired due-soon notifications today (avoid spamming).
 */
export function hasNotifiedToday(): boolean {
  const last = getAppSetting(LAST_NOTIFICATION_DATE_KEY)
  const today = new Date().toISOString().slice(0, 10)
  return last === today
}

export function markNotifiedToday(): void {
  const today = new Date().toISOString().slice(0, 10)
  setAppSetting(LAST_NOTIFICATION_DATE_KEY, today)
}
