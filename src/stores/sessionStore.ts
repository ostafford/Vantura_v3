/**
 * Session state: unlocked flag and in-memory API token.
 * Never persisted. Cleared on Lock or tab close.
 */

import { createStore } from 'zustand/vanilla'

type SessionStore = {
  unlocked: boolean
  apiToken: string | null
  /** Bumped whenever lock_timeout_minutes changes, so useInactivityLock can
   *  pick up the new value immediately instead of waiting for the next
   *  lock/unlock cycle. */
  lockTimeoutVersion: number
  setUnlocked: (token: string) => void
  lock: () => void
  getToken: () => string | null
  bumpLockTimeoutVersion: () => void
}

export const sessionStore = createStore<SessionStore>((set, get) => ({
  unlocked: false,
  apiToken: null,
  lockTimeoutVersion: 0,

  setUnlocked(token: string) {
    set({ unlocked: true, apiToken: token })
  },

  lock() {
    set({ unlocked: false, apiToken: null })
  },

  getToken() {
    return get().apiToken
  },

  bumpLockTimeoutVersion() {
    set({ lockTimeoutVersion: get().lockTimeoutVersion + 1 })
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    sessionStore.getState().lock()
  })
}
