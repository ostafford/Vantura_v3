import { createStore } from 'zustand/vanilla'
import { setAppSetting } from '@/db'
import { loadValidatedSetting } from '@/lib/loadValidatedSetting'

export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_SETTINGS_KEY = 'theme_mode'
export const THEME_LOCALSTORAGE_KEY = 'vantura_theme_mode'
const DEFAULT_THEME: ThemeMode = 'dark'
const VALID_THEMES: ThemeMode[] = ['light', 'dark', 'system']

function isValidTheme(value: unknown): value is ThemeMode {
  return typeof value === 'string' && VALID_THEMES.includes(value as ThemeMode)
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return mode
}

type ThemeStore = {
  mode: ThemeMode
  hydrated: boolean
  setMode: (mode: ThemeMode) => void
  hydrateFromDb: () => void
}

export const themeStore = createStore<ThemeStore>((set) => ({
  mode: DEFAULT_THEME,
  hydrated: false,

  setMode(mode: ThemeMode) {
    set({ mode })
    setAppSetting(THEME_SETTINGS_KEY, mode)
    localStorage.setItem(THEME_LOCALSTORAGE_KEY, mode)
  },

  hydrateFromDb() {
    const mode = loadValidatedSetting(
      THEME_SETTINGS_KEY,
      (raw) => (isValidTheme(raw) ? raw : null),
      DEFAULT_THEME
    )
    set({ mode, hydrated: true })
    try {
      localStorage.setItem(THEME_LOCALSTORAGE_KEY, mode)
    } catch {
      // Storage unavailable (private mode / quota / disabled). App.tsx's theme
      // effect re-mirrors this on its next run and index.html's pre-paint
      // script falls back to its own default — a failed write must not wedge
      // the boot sequence, which calls hydrateFromDb() outside any try/catch.
    }
  },
}))
