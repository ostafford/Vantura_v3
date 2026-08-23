import { useSplitNavSection } from '@/hooks/useSplitNavSection'
import { Form } from 'react-bootstrap'
import { isNotificationSupported } from '@/lib/notifications'
import { AboutSection } from './settings/AboutSection'
import { AppearanceSection } from './settings/AppearanceSection'
import { PaydaySection } from './settings/PaydaySection'
import { DashboardSectionOrderForm } from './settings/DashboardSectionOrderForm'
import { NotificationsSection } from './settings/NotificationsSection'
import { SecuritySection } from './settings/SecuritySection'
import { DataSection } from './settings/DataSection'

const SETTINGS_ACTIVE_SECTION_KEY = 'vantura_settings_active_section'
const LEGACY_SETTINGS_ACCORDION_KEY = 'vantura_settings_accordion'

function getSettingsSectionKeys(): string[] {
  return [
    'about',
    'appearance',
    'payday',
    'dashboard-sections',
    ...(isNotificationSupported() ? (['notifications'] as const) : []),
    'security',
    'data',
  ]
}

const SETTINGS_SECTION_LABELS: Record<string, string> = {
  about: 'About',
  appearance: 'Appearance',
  payday: 'Payday',
  'dashboard-sections': 'Dashboard sections',
  notifications: 'Notifications',
  security: 'Security',
  data: 'Data',
}

const SETTINGS_SECTION_ICONS: Record<string, string> = {
  about: 'mdi-information-outline',
  appearance: 'mdi-palette-outline',
  payday: 'mdi-calendar-today',
  'dashboard-sections': 'mdi-view-dashboard-outline',
  notifications: 'mdi-bell-outline',
  security: 'mdi-shield-lock-outline',
  data: 'mdi-database-outline',
}

export function Settings() {
  const sectionKeys = getSettingsSectionKeys()
  const { activeSection, selectSection } = useSplitNavSection({
    storageKey: SETTINGS_ACTIVE_SECTION_KEY,
    defaultSection: 'about',
    sectionKeys,
    legacyMigrate: (keys) => {
      try {
        // Migrate users who previously landed on the old 'help' section
        const currentRaw = localStorage.getItem(SETTINGS_ACTIVE_SECTION_KEY)
        if (currentRaw === 'help') return 'about'
        const oldRaw = localStorage.getItem(LEGACY_SETTINGS_ACCORDION_KEY)
        if (oldRaw) {
          const parsed = JSON.parse(oldRaw) as unknown
          if (Array.isArray(parsed)) {
            const first = parsed.find(
              (k): k is string => typeof k === 'string' && keys.includes(k)
            )
            if (first) return first
          }
        }
      } catch {
        /* ignore */
      }
      return null
    },
  })

  return (
    <div>
      <div className="sticky-toolbar">
        <div className="page-header" style={{ margin: 0 }}>
          <h3 className="page-title">
            <span className="page-title-icon">
              <i className="mdi mdi-cog" aria-hidden />
            </span>
            Settings
          </h3>
        </div>
      </div>

      <div className="settings-layout">
        <div className="row g-0 settings-layout-row">
          <aside className="col-md-4 col-lg-3 border-end settings-nav-column d-none d-md-block">
            <nav
              className="list-group list-group-flush settings-nav"
              aria-label="Settings sections"
            >
              {sectionKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`list-group-item list-group-item-action border-0 rounded-0 d-flex align-items-center gap-2 ${
                    activeSection === key ? 'active' : ''
                  }`}
                  onClick={() => selectSection(key)}
                  aria-current={activeSection === key ? 'page' : undefined}
                >
                  <i
                    className={`mdi ${SETTINGS_SECTION_ICONS[key] ?? 'mdi-circle-small'}`}
                    style={{ fontSize: '1rem', opacity: 0.75, flexShrink: 0 }}
                    aria-hidden
                  />
                  {SETTINGS_SECTION_LABELS[key] ?? key}
                </button>
              ))}
            </nav>
          </aside>
          <div className="col-12 d-md-none mb-3 px-3">
            <Form.Label
              htmlFor="settings-section-mobile"
              className="small text-muted"
            >
              Section
            </Form.Label>
            <Form.Select
              id="settings-section-mobile"
              value={activeSection}
              onChange={(e) => selectSection(e.target.value)}
              aria-label="Settings section"
            >
              {sectionKeys.map((key) => (
                <option key={key} value={key}>
                  {SETTINGS_SECTION_LABELS[key] ?? key}
                </option>
              ))}
            </Form.Select>
          </div>
          <div
            className={`col-12 col-md-8 col-lg-9 settings-panel-column ${
              activeSection === 'appearance' ? 'settings-panel-appearance' : ''
            }`}
          >
            <div className="settings-panel">
              <h2 className="h5 mb-3 fw-medium">
                {SETTINGS_SECTION_LABELS[activeSection] ?? activeSection}
              </h2>
              {activeSection === 'about' && <AboutSection />}
              {activeSection === 'appearance' && <AppearanceSection />}
              {activeSection === 'payday' && <PaydaySection />}
              {activeSection === 'dashboard-sections' && (
                <>
                  <p className="small text-muted mb-3">
                    Reorder sections on the Dashboard. You can also drag
                    sections to reorder on the Dashboard itself.
                  </p>
                  <DashboardSectionOrderForm />
                </>
              )}
              {activeSection === 'notifications' &&
                isNotificationSupported() && <NotificationsSection />}
              {activeSection === 'security' && <SecuritySection />}
              {activeSection === 'data' && <DataSection />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
