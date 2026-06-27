import { createStore } from 'zustand/vanilla'
import { getAppSetting, setAppSetting } from '@/db'

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
    try {
      const value = getAppSetting(THEME_SETTINGS_KEY)
      if (value && isValidTheme(value)) {
        set({ mode: value, hydrated: true })
        localStorage.setItem(THEME_LOCALSTORAGE_KEY, value)
        return
      }
      set({ mode: DEFAULT_THEME, hydrated: true })
    } catch {
      set({ mode: DEFAULT_THEME, hydrated: true })
    }
  },
}))
