import { useState, useEffect, useCallback } from 'react'
import { getAppSetting } from '@/db'
import { sessionStore } from '@/stores/sessionStore'
import { syncStore } from '@/stores/syncStore'
import { toast } from '@/stores/toastStore'
import {
  performFullSync,
  formatSyncProgressMessage,
  type SyncProgress,
} from '@/services/sync'
import { UpBankUnauthorizedError, SYNC_401_MESSAGE } from '@/api/upBank'

export function useFullReSync() {
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)

  useEffect(() => {
    setLastSync(getAppSetting('last_sync'))
  }, [syncing])

  const refreshLastSync = useCallback(() => {
    setLastSync(getAppSetting('last_sync'))
  }, [])

  const handleReSync = useCallback(async () => {
    const token = sessionStore.getState().getToken()
    if (!token || syncing) return
    if (getAppSetting('demo_mode') === '1') {
      toast.info('Demo mode – no sync.')
      return
    }
    setSyncing(true)
    setSyncError(null)
    syncStore.getState().setSyncing(true)
    try {
      await performFullSync(token, (p) => {
        setSyncProgress(p)
        toast.info(formatSyncProgressMessage(p), { persistent: true })
      })
      setLastSync(getAppSetting('last_sync'))
      syncStore.getState().syncCompleted()
      toast.success('Full sync complete. All transactions updated.')
    } catch (err) {
      toast.hide()
      setSyncError(
        err instanceof UpBankUnauthorizedError
          ? SYNC_401_MESSAGE
          : err instanceof Error
            ? err.message
            : 'Sync failed. Please try again.'
      )
    } finally {
      setSyncProgress(null)
      setSyncing(false)
      syncStore.getState().setSyncing(false)
    }
  }, [syncing])

  return {
    lastSync,
    syncing,
    syncError,
    syncProgress,
    setSyncError,
    handleReSync,
    refreshLastSync,
  }
}
