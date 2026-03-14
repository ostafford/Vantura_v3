import { useStore } from 'zustand'
import { themeStore } from '@/stores/themeStore'
import type { Theme } from '@/stores/themeStore'
import { Button } from 'react-bootstrap'

interface ThemeToggleProps {
  showLabel?: boolean
}

export function ThemeToggle({ showLabel = false }: ThemeToggleProps) {
  const theme = useStore(themeStore, (s) => s.theme)
  const setTheme = useStore(themeStore, (s) => s.setTheme)

  const next: Theme = theme === 'light' ? 'dark' : 'light'
  const label = theme === 'light' ? 'Dark' : 'Light'
  const iconClass =
    theme === 'light' ? 'mdi-weather-sunny' : 'mdi-weather-night'

  return (
    <Button
      variant="outline-secondary"
      size="sm"
      className="theme-toggle-btn"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${label} theme`}
    >
      <i className={`mdi ${iconClass}`} aria-hidden />
      {showLabel && <span className="menu-title">{label}</span>}
    </Button>
  )
}
