/**
 * Accent color state. Source of truth is app_settings in DB; this store is hydrated on init and synced on change.
 */

import { createStore } from 'zustand/vanilla'
import { getAppSetting, setAppSetting } from '@/db'
import type { AccentId } from '@/lib/accentPalettes'

const ACCENT_SETTINGS_KEY = 'accent_color'
const DEFAULT_ACCENT: AccentId = 'sky'

const VALID_ACCENTS: AccentId[] = [
  'sky',
  'mint',
  'lavender',
  'peach',
  'blush',
  'lemon',
]

function isValidAccent(value: unknown): value is AccentId {
  return typeof value === 'string' && VALID_ACCENTS.includes(value as AccentId)
}

type AccentStore = {
  accent: AccentId
  hydrated: boolean
  setAccent: (accent: AccentId) => void
  hydrateFromDb: () => void
}

export const accentStore = createStore<AccentStore>((set) => ({
  accent: DEFAULT_ACCENT,
  hydrated: false,

  setAccent(accent: AccentId) {
    set({ accent })
    setAppSetting(ACCENT_SETTINGS_KEY, accent)
  },

  hydrateFromDb() {
    try {
      const value = getAppSetting(ACCENT_SETTINGS_KEY)
      if (value && isValidAccent(value)) {
        set({ accent: value, hydrated: true })
        return
      }
      set({ accent: DEFAULT_ACCENT, hydrated: true })
    } catch {
      set({ accent: DEFAULT_ACCENT, hydrated: true })
    }
  },
}))
