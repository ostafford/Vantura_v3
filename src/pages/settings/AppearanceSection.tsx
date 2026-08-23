import { useStore } from 'zustand'
import { themeStore, type ThemeMode } from '@/stores/themeStore'

export function AppearanceSection() {
  const themeMode = useStore(themeStore, (s) => s.mode)

  return (
    <>
      <h6 className="text-muted mb-2">Theme</h6>
      <p className="small text-muted mb-3">
        Choose how Vantura looks. System follows your device's light or dark
        setting automatically.
      </p>
      <div className="d-flex gap-2" role="group" aria-label="Choose theme mode">
        {[
          {
            id: 'light' as ThemeMode,
            icon: 'mdi-white-balance-sunny',
            label: 'Light',
          },
          {
            id: 'dark' as ThemeMode,
            icon: 'mdi-moon-waning-crescent',
            label: 'Dark',
          },
          {
            id: 'system' as ThemeMode,
            icon: 'mdi-laptop',
            label: 'System',
          },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            type="button"
            className={`btn btn-sm ${themeMode === id ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => themeStore.getState().setMode(id)}
            aria-pressed={themeMode === id}
          >
            <i className={`mdi ${icon} me-1`} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </>
  )
}
