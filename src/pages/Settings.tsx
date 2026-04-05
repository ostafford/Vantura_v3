import { useState, useEffect } from 'react'
import { PageBreadcrumb } from '@/components/PageBreadcrumb'
import { useSplitNavSection } from '@/hooks/useSplitNavSection'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { Button, Modal, Spinner, Form } from 'react-bootstrap'
import { getAppSetting, setAppSetting, deleteDatabase } from '@/db'
import { accentStore } from '@/stores/accentStore'
import { toast } from '@/stores/toastStore'
import { ACCENT_PALETTES, type AccentId } from '@/lib/accentPalettes'
import { sessionStore } from '@/stores/sessionStore'
import {
  deriveKeyFromPassphrase,
  decryptToken,
  encryptToken,
} from '@/lib/crypto'
import { validateUpBankToken } from '@/api/upBank'
import { type PaydayFrequency, getPaydayDayOptions } from '@/lib/payday'
import { setDashboardTourCompleted } from '@/lib/dashboardTour'
import {
  getDashboardSectionOrder,
  setDashboardSectionOrder,
  DEFAULT_DASHBOARD_SECTION_ORDER,
  DASHBOARD_SECTION_LABELS,
  type DashboardSectionId,
} from '@/lib/dashboardSections'
import {
  getCategorizationRules,
  setCategorizationRules,
  type CategorizationRule,
} from '@/services/transactionUserData'
import { getCategories } from '@/services/categories'
import { formatSyncProgressMessage } from '@/services/sync'
import {
  exportProfile,
  previewImportProfile,
  importPayloadWithOptions,
  buildExportPayload,
  type ExportPayload,
  type TrackerExportRow,
  type UpcomingChargeExportRow,
  IMPORT_ERROR_WRONG_PASSPHRASE,
} from '@/services/profileExport'
import {
  isNotificationSupported,
  getNotificationsEnabled,
  setNotificationsEnabled,
  getNotificationPermission,
  requestNotificationPermission,
} from '@/lib/notifications'
import { useFullReSync } from '@/hooks/useFullReSync'

const SETTINGS_ACTIVE_SECTION_KEY = 'vantura_settings_active_section'
const LEGACY_SETTINGS_ACCORDION_KEY = 'vantura_settings_accordion'

function getSettingsSectionKeys(): string[] {
  return [
    'help',
    'appearance',
    'payday',
    'categorization',
    'dashboard-sections',
    ...(isNotificationSupported() ? (['notifications'] as const) : []),
    'data',
  ]
}

const SETTINGS_SECTION_LABELS: Record<string, string> = {
  help: 'Help',
  appearance: 'Appearance',
  payday: 'Payday',
  categorization: 'Categorization rules',
  'dashboard-sections': 'Dashboard sections',
  notifications: 'Notifications',
  data: 'Data',
}

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return 'Unknown'
  }
}

function formatSettingsSummary(settings: Record<string, string>): string {
  if (!settings || Object.keys(settings).length === 0) return 'None'
  const parts: string[] = []
  const theme = settings.theme
  if (theme) parts.push(theme === 'light' ? 'Light theme' : 'Dark theme')
  const accent = settings.accent_color
  if (accent && ACCENT_PALETTES[accent as AccentId]) {
    parts.push(ACCENT_PALETTES[accent as AccentId].label + ' accent')
  }
  const freq = settings.payday_frequency
  if (freq) {
    const label =
      freq === 'WEEKLY'
        ? 'Weekly'
        : freq === 'FORTNIGHTLY'
          ? 'Fortnightly'
          : freq === 'MONTHLY'
            ? 'Monthly'
            : freq
    const day = settings.payday_day
    parts.push(day ? `${label} payday (day ${day})` : `${label} payday`)
  }
  return parts.length > 0 ? parts.join(', ') : 'Some settings'
}

function formatTrackersSummary(trackers: TrackerExportRow[]): string {
  if (!Array.isArray(trackers) || trackers.length === 0) return 'None'
  const names = trackers.slice(0, 3).map((t) => t.name)
  const more = trackers.length > 3 ? ` +${trackers.length - 3} more` : ''
  return `${trackers.length} trackers (${names.join(', ')}${more})`
}

function formatUpcomingSummary(charges: UpcomingChargeExportRow[]): string {
  if (!Array.isArray(charges) || charges.length === 0) return 'None'
  return `${charges.length} upcoming charge${charges.length !== 1 ? 's' : ''}`
}

function CategorizationRulesForm() {
  const [rules, setRules] = useState<CategorizationRule[]>(() =>
    getCategorizationRules()
  )
  const [newPattern, setNewPattern] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')
  const categories = getCategories()

  const addRule = () => {
    const pattern = newPattern.trim()
    if (!pattern || !newCategoryId) return
    const rule: CategorizationRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      pattern,
      categoryId: newCategoryId,
    }
    const next = [...rules, rule]
    setRules(next)
    setCategorizationRules(next)
    setNewPattern('')
    setNewCategoryId('')
  }
  const removeRule = (id: string) => {
    const next = rules.filter((r) => r.id !== id)
    setRules(next)
    setCategorizationRules(next)
  }

  return (
    <div>
      <p className="small text-muted mb-3">
        When a transaction description contains the pattern (case-insensitive),
        that category is suggested on the Transactions page. No AI; rules only.
      </p>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <Form.Control
          type="text"
          placeholder="Pattern (e.g. COLES)"
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          style={{ maxWidth: 200 }}
        />
        <Form.Select
          value={newCategoryId}
          onChange={(e) => setNewCategoryId(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          <option value="">Category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Form.Select>
        <Button variant="outline-primary" size="sm" onClick={addRule}>
          Add rule
        </Button>
      </div>
      <ul className="list-group list-group-flush">
        {rules.map((r) => (
          <li
            key={r.id}
            className="list-group-item d-flex justify-content-between align-items-center"
          >
            <span className="text-break">
              &quot;{r.pattern}&quot; →{' '}
              {categories.find((c) => c.id === r.categoryId)?.name ??
                r.categoryId}
            </span>
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => removeRule(r.id)}
              aria-label={`Remove rule for ${r.pattern}`}
            >
              <i className="mdi mdi-delete" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      {rules.length === 0 && (
        <p className="small text-muted mb-0 mt-2">No rules yet.</p>
      )}
    </div>
  )
}

function DashboardSectionOrderForm() {
  const [order, setOrder] = useState<DashboardSectionId[]>(() =>
    getDashboardSectionOrder()
  )

  const moveUp = (index: number) => {
    if (index <= 0) return
    const next = [...order]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    setOrder(next)
    setDashboardSectionOrder(next)
  }
  const moveDown = (index: number) => {
    if (index >= order.length - 1) return
    const next = [...order]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    setOrder(next)
    setDashboardSectionOrder(next)
  }
  const resetToDefault = () => {
    setOrder([...DEFAULT_DASHBOARD_SECTION_ORDER])
    setDashboardSectionOrder([...DEFAULT_DASHBOARD_SECTION_ORDER])
  }

  return (
    <div>
      <ul className="list-group list-group-flush mb-3">
        {order.map((id, index) => (
          <li
            key={id}
            className="list-group-item d-flex justify-content-between align-items-center"
          >
            <span>{DASHBOARD_SECTION_LABELS[id]}</span>
            <div className="btn-group btn-group-sm">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => moveUp(index)}
                disabled={index === 0}
                aria-label={`Move ${DASHBOARD_SECTION_LABELS[id]} up`}
              >
                <i className="mdi mdi-chevron-up" aria-hidden />
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => moveDown(index)}
                disabled={index === order.length - 1}
                aria-label={`Move ${DASHBOARD_SECTION_LABELS[id]} down`}
              >
                <i className="mdi mdi-chevron-down" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button
        variant="outline-secondary"
        size="sm"
        onClick={resetToDefault}
        aria-label="Reset dashboard section order to default"
      >
        Reset to default order
      </Button>
    </div>
  )
}

export function Settings() {
  const {
    lastSync,
    syncing,
    syncError,
    syncProgress,
    setSyncError,
    handleReSync,
    refreshLastSync,
  } = useFullReSync()
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showUpdateTokenModal, setShowUpdateTokenModal] = useState(false)
  const [updateTokenPassphrase, setUpdateTokenPassphrase] = useState('')
  const [updateTokenNewToken, setUpdateTokenNewToken] = useState('')
  const [updateTokenError, setUpdateTokenError] = useState<string | null>(null)
  const [updateTokenLoading, setUpdateTokenLoading] = useState(false)
  const [updateTokenSuccess, setUpdateTokenSuccess] = useState(false)
  const [paydayFrequency, setPaydayFrequency] =
    useState<PaydayFrequency>('MONTHLY')
  const [paydayDay, setPaydayDay] = useState(1)
  const [nextPayday, setNextPayday] = useState('')
  const [paydayPayAmount, setPaydayPayAmount] = useState('')
  const [paydayError, setPaydayError] = useState<string | null>(null)
  const [paydaySuccess, setPaydaySuccess] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportPassphrase, setExportPassphrase] = useState('')
  const [exportPassphraseConfirm, setExportPassphraseConfirm] = useState('')
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPassphrase, setImportPassphrase] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importErrorField, setImportErrorField] = useState<
    'file' | 'passphrase' | null
  >(null)
  const [importing, setImporting] = useState(false)
  const [importStep, setImportStep] = useState<1 | 2>(1)
  const [importPreview, setImportPreview] = useState<ExportPayload | null>(null)
  const [importOptions, setImportOptions] = useState({
    settings: true,
    trackers: true,
    upcomingCharges: true,
  })
  const accent = useStore(accentStore, (s) => s.accent)
  const setAccent = useStore(accentStore, (s) => s.setAccent)
  const navigate = useNavigate()
  const [notificationsEnabled, setNotificationsEnabledState] = useState(() =>
    getNotificationsEnabled()
  )

  const sectionKeys = getSettingsSectionKeys()
  const { activeSection, selectSection } = useSplitNavSection({
    storageKey: SETTINGS_ACTIVE_SECTION_KEY,
    defaultSection: 'help',
    sectionKeys,
    legacyMigrate: (keys) => {
      try {
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

  useEffect(() => {
    const freq = getAppSetting('payday_frequency') as PaydayFrequency | null
    const dayStr = getAppSetting('payday_day')
    const next = getAppSetting('next_payday')
    const payAmt = getAppSetting('pay_amount_cents')
    if (freq === 'WEEKLY' || freq === 'FORTNIGHTLY' || freq === 'MONTHLY') {
      setPaydayFrequency(freq)
    }
    if (dayStr) {
      const d = parseInt(dayStr, 10)
      if (!Number.isNaN(d)) setPaydayDay(d)
    }
    setNextPayday(next ?? new Date().toISOString().slice(0, 10))
    if (payAmt != null && payAmt !== '') {
      const cents = parseInt(payAmt, 10)
      if (!Number.isNaN(cents) && cents >= 0) {
        setPaydayPayAmount((cents / 100).toFixed(2))
      }
    } else {
      setPaydayPayAmount('')
    }
  }, [])

  async function handleClearAllData() {
    setClearing(true)
    try {
      localStorage.removeItem('vantura_sidebar_collapsed')
      await deleteDatabase()
      toast.success('All data cleared.')
      sessionStore.getState().lock()
      window.location.reload()
    } catch (err) {
      setSyncError(
        err instanceof Error
          ? err.message
          : 'Failed to clear data. Please try again.'
      )
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to clear data. Please try again.'
      )
      setClearing(false)
    }
  }

  async function handleUpdateTokenSubmit(e: React.FormEvent) {
    e.preventDefault()
    setUpdateTokenError(null)
    const passphrase = updateTokenPassphrase.trim()
    const newToken = updateTokenNewToken.trim()
    if (!passphrase || !newToken) {
      setUpdateTokenError(
        'Please enter your passphrase and new Personal Access Token.'
      )
      return
    }
    setUpdateTokenLoading(true)
    try {
      const salt = getAppSetting('encryption_salt')
      const encrypted = getAppSetting('api_token_encrypted')
      if (!salt || !encrypted) {
        setUpdateTokenError(
          'No stored credentials. Please complete onboarding first.'
        )
        setUpdateTokenLoading(false)
        return
      }
      const key = await deriveKeyFromPassphrase(passphrase, salt)
      await decryptToken(encrypted, key)
      const valid = await validateUpBankToken(newToken)
      if (!valid) {
        setUpdateTokenError(
          'Invalid Personal Access Token. Please check and try again.'
        )
        setUpdateTokenLoading(false)
        return
      }
      const newEncrypted = await encryptToken(newToken, key)
      setAppSetting('api_token_encrypted', newEncrypted)
      sessionStore.getState().setUnlocked(newToken)
      setUpdateTokenPassphrase('')
      setUpdateTokenNewToken('')
      setUpdateTokenError(null)
      setShowUpdateTokenModal(false)
      setUpdateTokenSuccess(true)
      toast.success('Personal Access Token updated.')
      refreshLastSync()
      setTimeout(() => setUpdateTokenSuccess(false), 5000)
    } catch (err) {
      setUpdateTokenError(
        err instanceof Error
          ? err.message
          : 'Invalid passphrase or failed to update token.'
      )
    } finally {
      setUpdateTokenLoading(false)
    }
  }

  function closeUpdateTokenModal() {
    if (!updateTokenLoading) {
      setShowUpdateTokenModal(false)
      setUpdateTokenPassphrase('')
      setUpdateTokenNewToken('')
      setUpdateTokenError(null)
    }
  }

  const paydayDayOptions = getPaydayDayOptions(paydayFrequency)
  const paydayDayValid = paydayDayOptions.some((opt) => opt.value === paydayDay)
  const effectivePaydayDay = paydayDayValid
    ? paydayDay
    : (paydayDayOptions[0]?.value ?? 1)
  const isDemoMode = getAppSetting('demo_mode') === '1'

  function handlePaydaySubmit(e: React.FormEvent) {
    e.preventDefault()
    setPaydayError(null)
    if (!nextPayday.trim()) {
      setPaydayError('Please select your next payday.')
      return
    }
    setAppSetting('payday_frequency', paydayFrequency)
    setAppSetting('payday_day', String(effectivePaydayDay))
    setAppSetting('next_payday', nextPayday.trim())
    const payAmtTrimmed = paydayPayAmount.trim()
    if (payAmtTrimmed === '') {
      setAppSetting('pay_amount_cents', '')
    } else {
      const cents = Math.round(parseFloat(payAmtTrimmed) * 100)
      setAppSetting(
        'pay_amount_cents',
        Number.isNaN(cents) || cents < 0 ? '' : String(cents)
      )
    }
    setPaydaySuccess(true)
    toast.success('Payday schedule updated.')
    setTimeout(() => setPaydaySuccess(false), 5000)
  }

  async function handleExportSubmit(e: React.FormEvent) {
    e.preventDefault()
    setExportError(null)
    const passphrase = exportPassphrase.trim()
    const confirmVal = exportPassphraseConfirm.trim()
    if (!passphrase) {
      setExportError('Please enter a passphrase.')
      return
    }
    if (passphrase !== confirmVal) {
      setExportError('Passphrases do not match.')
      return
    }
    setExporting(true)
    try {
      await exportProfile(passphrase)
      setExportPassphrase('')
      setExportPassphraseConfirm('')
      setExportError(null)
      setShowExportModal(false)
      toast.success('Settings exported. Save the file securely.')
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Export failed. Please try again.'
      )
    } finally {
      setExporting(false)
    }
  }

  function closeExportModal() {
    if (!exporting) {
      setShowExportModal(false)
      setExportPassphrase('')
      setExportPassphraseConfirm('')
      setExportError(null)
    }
  }

  async function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault()
    setImportError(null)
    setImportErrorField(null)
    if (!importFile) {
      setImportError('Please choose a settings file.')
      setImportErrorField('file')
      return
    }
    if (!importPassphrase.trim()) {
      setImportError('Please enter the passphrase used when exporting.')
      setImportErrorField('passphrase')
      return
    }
    setImporting(true)
    try {
      const payload = await previewImportProfile(
        importFile,
        importPassphrase.trim()
      )
      setImportPreview(payload)
      setImportOptions({
        settings: true,
        trackers: true,
        upcomingCharges: true,
      })
      setImportStep(2)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Import failed. Please try again.'
      setImportError(msg)
      setImportErrorField(
        msg === IMPORT_ERROR_WRONG_PASSPHRASE ||
          msg.includes('passphrase') ||
          msg.includes('newer app version')
          ? 'passphrase'
          : 'file'
      )
    } finally {
      setImporting(false)
    }
  }

  function handleImportConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!importPreview) return
    setImporting(true)
    try {
      importPayloadWithOptions(importPreview, importOptions)
      setImportPreview(null)
      setImportStep(1)
      setImportFile(null)
      setImportPassphrase('')
      setShowImportModal(false)
      toast.success('Settings imported successfully.')
      window.location.reload()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Import failed. Please try again.'
      )
    } finally {
      setImporting(false)
    }
  }

  function handleImportBack() {
    setImportStep(1)
    setImportPreview(null)
  }

  function closeImportModal() {
    if (!importing) {
      setShowImportModal(false)
      setImportFile(null)
      setImportPassphrase('')
      setImportError(null)
      setImportErrorField(null)
      setImportStep(1)
      setImportPreview(null)
    }
  }

  function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setImportFile(file ?? null)
    setImportError(null)
    setImportErrorField(null)
  }

  function handleImportPassphraseChange(value: string) {
    setImportPassphrase(value)
    if (importErrorField === 'passphrase') {
      setImportError(null)
      setImportErrorField(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon">
            <i className="mdi mdi-cog" aria-hidden />
          </span>
          Settings
        </h3>
        <PageBreadcrumb
          items={[{ label: 'Dashboard', to: '/' }, { label: 'Settings' }]}
        />
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
                  className={`list-group-item list-group-item-action border-0 rounded-0 ${
                    activeSection === key ? 'active' : ''
                  }`}
                  onClick={() => selectSection(key)}
                  aria-current={activeSection === key ? 'page' : undefined}
                >
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
              {activeSection === 'help' && (
                <>
                  <p className="small text-muted mb-2">
                    New to Vantura? Read the user guide or run the dashboard
                    tour to see how everything works.
                  </p>
                  <div className="d-flex flex-wrap gap-2">
                    <Link
                      to="/help"
                      className="btn btn-gradient-primary btn-sm"
                      aria-label="Open user guide"
                    >
                      User guide
                    </Link>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => {
                        setDashboardTourCompleted(false)
                        navigate('/')
                      }}
                      aria-label="Show dashboard tour again"
                    >
                      Show dashboard tour again
                    </Button>
                  </div>
                </>
              )}
              {activeSection === 'appearance' && (
                <>
                  <h6 className="text-muted mb-2">Accent color</h6>
                  <p className="small text-muted mb-3">
                    Choose a color for buttons, charts, and highlights.
                  </p>
                  <div className="d-flex flex-wrap gap-2">
                    {(Object.keys(ACCENT_PALETTES) as AccentId[]).map((id) => {
                      const palette = ACCENT_PALETTES[id]
                      const isSelected = accent === id
                      return (
                        <button
                          key={id}
                          type="button"
                          className="accent-swatch border rounded-circle p-0 d-flex align-items-center justify-content-center"
                          style={{
                            width: 40,
                            height: 40,
                            background: `linear-gradient(135deg, ${palette.gradientStart}, ${palette.gradientEnd})`,
                            borderWidth: isSelected ? 3 : 1,
                            borderColor: isSelected
                              ? 'var(--vantura-text)'
                              : 'var(--vantura-border)',
                          }}
                          onClick={() => setAccent(id)}
                          aria-label={`Select ${palette.label} accent`}
                          aria-pressed={isSelected}
                        >
                          {isSelected && (
                            <i
                              className="mdi mdi-check"
                              style={{
                                fontSize: '1.25rem',
                                color: 'white',
                                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                              }}
                              aria-hidden
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              {activeSection === 'payday' && (
                <>
                  <p className="small text-muted mb-3">
                    Used for spendable balance and PAYDAY trackers. Update when
                    your pay cycle changes (e.g. new job). When Monthly, Day is
                    the date in the month (1st–28th). If you&apos;re paid on the
                    29th–31st, choose 28th and set Next payday to your actual
                    date.
                  </p>
                  <Form onSubmit={handlePaydaySubmit}>
                    <Form.Group className="mb-2">
                      <Form.Label htmlFor="settings-payday-frequency">
                        Frequency
                      </Form.Label>
                      <Form.Select
                        id="settings-payday-frequency"
                        value={paydayFrequency}
                        onChange={(e) =>
                          setPaydayFrequency(e.target.value as PaydayFrequency)
                        }
                      >
                        <option value="WEEKLY">Weekly</option>
                        <option value="FORTNIGHTLY">Fortnightly</option>
                        <option value="MONTHLY">Monthly</option>
                      </Form.Select>
                    </Form.Group>
                    <Form.Group className="mb-2">
                      <Form.Label htmlFor="settings-payday-day">Day</Form.Label>
                      <Form.Select
                        id="settings-payday-day"
                        value={effectivePaydayDay}
                        onChange={(e) => setPaydayDay(Number(e.target.value))}
                      >
                        {paydayDayOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                    <Form.Group className="mb-2">
                      <Form.Label htmlFor="settings-payday-pay-amount">
                        Pay amount ($)
                      </Form.Label>
                      <Form.Control
                        id="settings-payday-pay-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Optional"
                        value={paydayPayAmount}
                        onChange={(e) => setPaydayPayAmount(e.target.value)}
                        aria-label="Pay amount per pay period (optional)"
                      />
                      <Form.Text className="text-muted">
                        Optional. Used for Spendable context, alerts, and PAYDAY
                        tracker warnings.
                      </Form.Text>
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label htmlFor="settings-next-payday">
                        Next payday
                      </Form.Label>
                      <Form.Control
                        id="settings-next-payday"
                        type="date"
                        value={nextPayday}
                        onChange={(e) => setNextPayday(e.target.value)}
                      />
                    </Form.Group>
                    {paydayError && (
                      <div className="text-danger small mb-2" role="alert">
                        {paydayError}
                      </div>
                    )}
                    {paydaySuccess && (
                      <span
                        className="d-block mb-2 text-success small"
                        role="status"
                      >
                        Payday settings updated.
                      </span>
                    )}
                    <Button
                      type="submit"
                      className="btn-gradient-primary"
                      size="sm"
                    >
                      Save payday settings
                    </Button>
                  </Form>
                </>
              )}
              {activeSection === 'categorization' && (
                <>
                  <CategorizationRulesForm />
                </>
              )}
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
                isNotificationSupported() && (
                  <>
                    <p className="small text-muted mb-3">
                      Get a browser notification when upcoming charges are due
                      soon (within their reminder window). Requires browser
                      permission.
                    </p>
                    <Form.Check
                      type="switch"
                      id="settings-notifications-toggle"
                      label="Enable bill reminders"
                      checked={notificationsEnabled}
                      onChange={async (e) => {
                        const next = e.target.checked
                        if (next) {
                          const perm = getNotificationPermission()
                          if (perm !== 'granted') {
                            const granted =
                              await requestNotificationPermission()
                            if (!granted) {
                              toast.error(
                                'Notification permission denied. Enable in browser settings.'
                              )
                              return
                            }
                          }
                        }
                        setNotificationsEnabled(next)
                        setNotificationsEnabledState(next)
                        toast.success(
                          next
                            ? 'Bill reminders enabled.'
                            : 'Bill reminders disabled.'
                        )
                      }}
                    />
                  </>
                )}
              {activeSection === 'data' && (
                <>
                  {isDemoMode && (
                    <div
                      className="alert alert-info mb-4"
                      role="status"
                      id="settings-demo-banner"
                    >
                      You&apos;re using sample data. Clear all data below to
                      connect your real Up Bank account.
                    </div>
                  )}
                  <div className="mb-4">
                    <h6 className="text-muted mb-2">Re-sync with Up Bank</h6>
                    <p className="small text-muted mb-2">
                      Sync downloads your Up Bank transactions to this device
                      only. No cloud storage is used; we don&apos;t have servers
                      that store your data.
                    </p>
                    <p className="small text-muted mb-2">
                      Re-syncs all transactions, including category changes made
                      in the Up Bank app.
                    </p>
                    <p className="small text-muted mb-2">
                      Last synced: {formatLastSync(lastSync)}
                    </p>
                    <Button
                      className="btn-gradient-primary"
                      size="sm"
                      onClick={handleReSync}
                      disabled={syncing || isDemoMode}
                      aria-label="Re-sync with Up Bank"
                      aria-busy={syncing}
                    >
                      {syncing ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-1"
                            role="status"
                            aria-hidden="true"
                          />
                          Syncing…
                        </>
                      ) : (
                        'Re-sync now'
                      )}
                    </Button>
                    {syncing && syncProgress && (
                      <p
                        className="small text-muted mt-2 mb-0"
                        role="status"
                        aria-live="polite"
                      >
                        {formatSyncProgressMessage(syncProgress)}
                      </p>
                    )}
                    {syncError && (
                      <span
                        className="d-block mt-2 text-danger small"
                        role="alert"
                      >
                        {syncError}
                      </span>
                    )}
                  </div>

                  <hr />

                  {!isDemoMode && (
                    <div className="mb-4">
                      <h6 className="text-muted mb-2">Personal Access Token</h6>
                      <p className="small text-muted mb-2">
                        If your token has expired (e.g. 48-hour token from Up
                        Bank), update it here. Your passphrase is required;
                        other data is not deleted.
                      </p>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => {
                          setUpdateTokenError(null)
                          setShowUpdateTokenModal(true)
                        }}
                        aria-label="Update Personal Access Token"
                      >
                        Update Personal Access Token
                      </Button>
                      {updateTokenSuccess && (
                        <span
                          className="d-block mt-2 text-success small"
                          role="status"
                        >
                          Personal Access Token updated. You can re-sync now.
                        </span>
                      )}
                    </div>
                  )}

                  {!isDemoMode && <hr />}

                  <div className="mb-4">
                    <h6 className="text-muted mb-2">Export profile settings</h6>
                    <p className="small text-muted mb-2">
                      Exports only appearance and configuration (colors, payday
                      setup, trackers, upcoming charges, chart preferences).
                      Does not export bank transactions, account numbers, or API
                      tokens. The file is encrypted with the passphrase you
                      choose.
                    </p>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => {
                        setExportError(null)
                        setShowExportModal(true)
                      }}
                      aria-label="Export settings to file"
                    >
                      Export settings to file
                    </Button>
                  </div>

                  <div className="mb-4">
                    <h6 className="text-muted mb-2">Import profile settings</h6>
                    <p className="small text-muted mb-2">
                      Imports appearance and configuration into this browser.
                      Does not import transactions or API tokens. Use to restore
                      your setup on a new device.
                    </p>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => {
                        setImportError(null)
                        setShowImportModal(true)
                      }}
                      aria-label="Import settings from file"
                    >
                      Choose settings file
                    </Button>
                  </div>

                  <hr />

                  <div>
                    <h6 className="text-muted mb-2">Clear all data</h6>
                    <p className="small text-muted mb-2">
                      Permanently delete all local data. You will need to
                      re-enter your passphrase and Personal Access Token
                      (re-onboard).
                    </p>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => setShowClearModal(true)}
                      aria-label="Clear all data"
                    >
                      Clear all data
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        show={showClearModal}
        onHide={() => !clearing && setShowClearModal(false)}
        aria-labelledby="clear-data-modal-title"
        aria-describedby="clear-data-modal-description"
        centered
      >
        <Modal.Header closeButton={!clearing}>
          <Modal.Title id="clear-data-modal-title">Clear all data</Modal.Title>
        </Modal.Header>
        <Modal.Body id="clear-data-modal-description">
          <p className="mb-2">
            All local data will be permanently deleted, including your encrypted
            Personal Access Token. You will need to re-enter your passphrase and
            Personal Access Token to use the app again. This cannot be undone.
          </p>
          <p className="small text-muted mb-0">
            To verify: open DevTools (F12) → Application → IndexedDB. The
            vantura-db database will be removed after clearing.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowClearModal(false)}
            disabled={clearing}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleClearAllData}
            disabled={clearing}
            aria-busy={clearing}
          >
            {clearing ? (
              <>
                <Spinner
                  animation="border"
                  size="sm"
                  className="me-1"
                  role="status"
                  aria-hidden="true"
                />
                Clearing…
              </>
            ) : (
              'Clear all data'
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showUpdateTokenModal}
        onHide={closeUpdateTokenModal}
        aria-labelledby="update-token-modal-title"
        aria-describedby="update-token-modal-description"
        centered
      >
        <Modal.Header closeButton={!updateTokenLoading}>
          <Modal.Title id="update-token-modal-title">
            Update Personal Access Token
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleUpdateTokenSubmit}>
          <Modal.Body id="update-token-modal-description">
            <p className="small text-muted mb-3">
              Enter your passphrase and a new Personal Access Token from the Up
              Bank app. Your existing data (trackers, etc.) will be kept.
            </p>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="update-token-passphrase">
                Passphrase
              </Form.Label>
              <Form.Control
                id="update-token-passphrase"
                type="password"
                value={updateTokenPassphrase}
                onChange={(e) => setUpdateTokenPassphrase(e.target.value)}
                placeholder="Enter passphrase"
                autoComplete="current-password"
                disabled={updateTokenLoading}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="update-token-new">
                New Personal Access Token
              </Form.Label>
              <Form.Control
                id="update-token-new"
                type="password"
                value={updateTokenNewToken}
                onChange={(e) => setUpdateTokenNewToken(e.target.value)}
                placeholder="Paste new token from Up Bank app"
                autoComplete="off"
                disabled={updateTokenLoading}
              />
            </Form.Group>
            {updateTokenError && (
              <div className="text-danger small mb-2" role="alert">
                {updateTokenError}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              type="button"
              variant="secondary"
              onClick={closeUpdateTokenModal}
              disabled={updateTokenLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="btn-gradient-primary"
              disabled={updateTokenLoading}
              aria-busy={updateTokenLoading}
            >
              {updateTokenLoading ? (
                <>
                  <Spinner
                    animation="border"
                    size="sm"
                    className="me-1"
                    role="status"
                    aria-hidden="true"
                  />
                  Updating…
                </>
              ) : (
                'Update token'
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal
        show={showExportModal}
        onHide={closeExportModal}
        aria-labelledby="export-modal-title"
        aria-describedby="export-modal-description"
        centered
      >
        <Modal.Header closeButton={!exporting}>
          <Modal.Title id="export-modal-title">
            Export settings to file
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleExportSubmit}>
          <Modal.Body id="export-modal-description">
            <p className="small text-muted mb-3">
              Only settings and configuration will be exported (no transactions,
              no API keys, no bank data). Choose a passphrase to encrypt the
              file. You will need this passphrase to import on another device.
            </p>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="export-passphrase">Passphrase</Form.Label>
              <Form.Control
                id="export-passphrase"
                type="password"
                value={exportPassphrase}
                onChange={(e) => setExportPassphrase(e.target.value)}
                placeholder="Enter passphrase"
                autoComplete="new-password"
                disabled={exporting}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="export-passphrase-confirm">
                Confirm passphrase
              </Form.Label>
              <Form.Control
                id="export-passphrase-confirm"
                type="password"
                value={exportPassphraseConfirm}
                onChange={(e) => setExportPassphraseConfirm(e.target.value)}
                placeholder="Confirm passphrase"
                autoComplete="new-password"
                disabled={exporting}
              />
            </Form.Group>
            {exportError && (
              <div className="text-danger small mb-2" role="alert">
                {exportError}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              type="button"
              variant="secondary"
              onClick={closeExportModal}
              disabled={exporting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="btn-gradient-primary"
              disabled={exporting}
              aria-busy={exporting}
            >
              {exporting ? (
                <>
                  <Spinner
                    animation="border"
                    size="sm"
                    className="me-1"
                    role="status"
                    aria-hidden="true"
                  />
                  Exporting…
                </>
              ) : (
                'Export'
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal
        show={showImportModal}
        onHide={closeImportModal}
        aria-labelledby="import-modal-title"
        aria-describedby="import-modal-description"
        centered
      >
        <Modal.Header closeButton={!importing}>
          <Modal.Title id="import-modal-title">
            Import profile settings
          </Modal.Title>
        </Modal.Header>
        {importStep === 1 ? (
          <Form onSubmit={handleImportSubmit}>
            <Modal.Body id="import-modal-description">
              <p className="small text-muted mb-3">
                Imports settings, trackers, and upcoming charges into this
                device. Will not import transactions or API tokens.
              </p>
              <Form.Group className="mb-3">
                <Form.Label>Settings file</Form.Label>
                <Form.Control
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFileChange}
                  disabled={importing}
                  aria-label="Choose settings file"
                  aria-invalid={importErrorField === 'file'}
                  aria-errormessage={
                    importErrorField === 'file'
                      ? 'import-file-error'
                      : undefined
                  }
                />
                {importFile && (
                  <Form.Text className="text-muted">
                    Selected: {importFile.name}
                  </Form.Text>
                )}
                {importError && importErrorField === 'file' && (
                  <div
                    id="import-file-error"
                    className="text-danger small mt-1"
                    role="alert"
                  >
                    {importError}
                  </div>
                )}
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label htmlFor="import-passphrase">
                  Passphrase (used when exporting)
                </Form.Label>
                <Form.Control
                  id="import-passphrase"
                  type="password"
                  value={importPassphrase}
                  onChange={(e) => handleImportPassphraseChange(e.target.value)}
                  placeholder="Enter passphrase"
                  autoComplete="current-password"
                  disabled={importing}
                  aria-invalid={importErrorField === 'passphrase'}
                  aria-errormessage={
                    importErrorField === 'passphrase'
                      ? 'import-passphrase-error'
                      : undefined
                  }
                />
                <Form.Text className="text-muted d-block mt-1">
                  If the passphrase or file is incorrect, we&apos;ll show an
                  error here and nothing will be changed.
                </Form.Text>
                {importError && importErrorField === 'passphrase' && (
                  <div
                    id="import-passphrase-error"
                    className="text-danger small mt-1"
                    role="alert"
                  >
                    {importError}
                  </div>
                )}
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button
                type="button"
                variant="secondary"
                onClick={closeImportModal}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="btn-gradient-primary"
                disabled={importing || !importFile}
                aria-busy={importing}
              >
                {importing ? (
                  <>
                    <Spinner
                      animation="border"
                      size="sm"
                      className="me-1"
                      role="status"
                      aria-hidden="true"
                    />
                    Continue…
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </Modal.Footer>
          </Form>
        ) : (
          <Form onSubmit={handleImportConfirm}>
            <Modal.Body id="import-modal-description">
              <p className="small text-muted mb-3">
                Choose which sections to import. Trackers and upcoming charges
                in this browser will be overwritten only if their sections are
                selected. Unselected sections will be left unchanged.
              </p>
              {importPreview &&
                (() => {
                  const current = buildExportPayload()
                  return (
                    <div className="mb-3">
                      <div className="mb-2">
                        <Form.Check
                          type="checkbox"
                          id="import-opt-settings"
                          label="Settings and appearance"
                          checked={importOptions.settings}
                          onChange={(e) =>
                            setImportOptions((o) => ({
                              ...o,
                              settings: e.target.checked,
                            }))
                          }
                          aria-label="Import settings and appearance"
                        />
                        <div className="small text-muted ms-4 mt-1">
                          Current: {formatSettingsSummary(current.settings)}
                          {' → '}
                          New:{' '}
                          {formatSettingsSummary(importPreview.settings ?? {})}
                        </div>
                      </div>
                      <div className="mb-2">
                        <Form.Check
                          type="checkbox"
                          id="import-opt-trackers"
                          label="Trackers"
                          checked={importOptions.trackers}
                          onChange={(e) =>
                            setImportOptions((o) => ({
                              ...o,
                              trackers: e.target.checked,
                            }))
                          }
                          aria-label="Import trackers"
                        />
                        <div className="small text-muted ms-4 mt-1">
                          Current: {formatTrackersSummary(current.trackers)}
                          {' → '}
                          New:{' '}
                          {formatTrackersSummary(importPreview.trackers ?? [])}
                        </div>
                      </div>
                      <div>
                        <Form.Check
                          type="checkbox"
                          id="import-opt-upcoming"
                          label="Upcoming charges"
                          checked={importOptions.upcomingCharges}
                          onChange={(e) =>
                            setImportOptions((o) => ({
                              ...o,
                              upcomingCharges: e.target.checked,
                            }))
                          }
                          aria-label="Import upcoming charges"
                        />
                        <div className="small text-muted ms-4 mt-1">
                          Current:{' '}
                          {formatUpcomingSummary(current.upcomingCharges)}
                          {' → '}
                          New:{' '}
                          {formatUpcomingSummary(
                            importPreview.upcomingCharges ?? []
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}
            </Modal.Body>
            <Modal.Footer>
              <Button
                type="button"
                variant="secondary"
                onClick={handleImportBack}
                disabled={importing}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="btn-gradient-primary"
                disabled={
                  importing ||
                  !importPreview ||
                  (!importOptions.settings &&
                    !importOptions.trackers &&
                    !importOptions.upcomingCharges)
                }
                aria-busy={importing}
              >
                {importing ? (
                  <>
                    <Spinner
                      animation="border"
                      size="sm"
                      className="me-1"
                      role="status"
                      aria-hidden="true"
                    />
                    Importing…
                  </>
                ) : (
                  'Import'
                )}
              </Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </div>
  )
}
