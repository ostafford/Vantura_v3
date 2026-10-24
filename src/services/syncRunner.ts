/**
 * One place that starts an incremental sync, so two can never run at once,
 * plus the stale-data auto-sync (GLOSSARY *Stale data*: re-sync quietly when
 * the last sync is over 30 minutes old). Callers that show their own UI
 * (Navbar, Dashboard) use `runSync`; the app layout calls `autoSyncIfStale`
 * on every unlock and every page change.
 */

import { getAppSetting } from '@/db'
import { performSync } from '@/services/sync'
import { sessionStore } from '@/stores/sessionStore'
import { syncStore } from '@/stores/syncStore'
import { toast } from '@/stores/toastStore'
import { UpBankUnauthorizedError, SYNC_401_MESSAGE } from '@/api/upBank'

export const STALE_SYNC_THRESHOLD_MS = 30 * 60 * 1000

/** True when `lastSync` is missing, unparseable, or at least 30 minutes old. */
export function isSyncStale(lastSync: string | null, now: number): boolean {
  if (!lastSync) return true
  const at = new Date(lastSync).getTime()
  if (Number.isNaN(at)) return true
  return now - at >= STALE_SYNC_THRESHOLD_MS
}

/**
 * Runs an incremental sync unless one is already running (`syncStore.syncing`
 * is the single guard every sync entry point checks). Signals completion on
 * success; rethrows on failure so the caller decides what to show.
 */
export async function runSync(token: string): Promise<'ran' | 'skipped'> {
  if (syncStore.getState().syncing) return 'skipped'
  syncStore.getState().setSyncing(true)
  try {
    await performSync(token, () => {})
    syncStore.getState().syncCompleted()
    return 'ran'
  } finally {
    syncStore.getState().setSyncing(false)
  }
}

/**
 * The last token Up rejected with a 401. Auto-sync runs on every page change,
 * so without this a revoked token would hit Up and show the message on every
 * navigation; updating the token (a different string) resumes auto-sync.
 */
let rejectedToken: string | null = null

/**
 * Quiet re-sync when data is stale. A network/offline failure stays silent —
 * the "Nh old" badge covers it — but a 401 is shown (once per token), since a
 * revoked or expired token never fixes itself.
 */
export async function autoSyncIfStale(): Promise<void> {
  const token = sessionStore.getState().getToken()
  if (!token || token === rejectedToken) return
  if (getAppSetting('demo_mode') === '1') return
  if (!isSyncStale(getAppSetting('last_sync'), Date.now())) return
  try {
    await runSync(token)
  } catch (err) {
    if (err instanceof UpBankUnauthorizedError) {
      rejectedToken = token
      toast.error(SYNC_401_MESSAGE)
    }
  }
}
