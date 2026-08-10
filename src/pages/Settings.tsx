import { useState, useEffect } from 'react'
import { APP_VERSION } from '@/lib/appVersion'
import { useStore } from 'zustand'
import { useSplitNavSection } from '@/hooks/useSplitNavSection'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Modal, Spinner, Form } from 'react-bootstrap'
import { getAppSetting, setAppSetting, deleteDatabase } from '@/db'
import { toast } from '@/stores/toastStore'
import { themeStore, type ThemeMode } from '@/stores/themeStore'
import { sessionStore } from '@/stores/sessionStore'
import {
  deriveKeyFromPassphrase,
  decryptToken,
  encryptToken,
} from '@/lib/crypto'
import { validateUpBankToken } from '@/api/upBank'
import {
  type PaydayFrequency,
  getPaydayDayOptions,
  getPaydayDayLabel,
} from '@/lib/payday'
import { usePwaUpdate } from '@/hooks/usePwaUpdate'
import { setDashboardTourCompleted } from '@/lib/dashboardTour'
import {
  getDashboardSectionOrder,
  setDashboardSectionOrder,
  DEFAULT_DASHBOARD_SECTION_ORDER,
  DASHBOARD_SECTION_LABELS,
  type DashboardSectionId,
} from '@/lib/dashboardSections'
import { formatSyncProgressMessage } from '@/services/sync'
import {
  exportProfile,
  previewImportProfile,
  importPayloadWithOptions,
  buildExportPayload,
  type ExportPayload,
  type TrackerExportRow,
  type UpcomingChargeExportRow,
  type BudgetBucketExportRow,
  type BudgetHypotheticalExportRow,
  type ImportOptions,
  IMPORT_ERROR_WRONG_PASSPHRASE,
} from '@/services/profileExport'
import {
  isNotificationSupported,
  getNotificationsEnabled,
  setNotificationsEnabled,
  getNotificationPermission,
  requestNotificationPermission,
  getNotifTypeEnabled,
  setNotifTypeEnabled,
  getLargeTxThresholdCents,
  setLargeTxThresholdCents,
  type NotifType,
} from '@/lib/notifications'
import { useFullReSync } from '@/hooks/useFullReSync'
import { isBiometricAvailable, registerBiometric } from '@/lib/webauthn'
import {
  clearBiometricSession,
  storeBiometricSession,
  hasBiometricSession,
} from '@/lib/biometricSession'
import {
  detectPaySchedule,
  searchCreditTransactions,
  type PaydayDetectionResult,
  type PayeeSummary,
} from '@/services/paydayDetection'
import { syncStore } from '@/stores/syncStore'

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

const NOTIF_TYPES: { key: NotifType; label: string; desc: string }[] = [
  {
    key: 'tracker_overspent',
    label: 'Tracker over budget',
    desc: 'When a tracker exceeds 100% of its budget',
  },
  {
    key: 'tracker_pace',
    label: 'Tracker pace warning',
    desc: 'When spending is >10% ahead of pace with >20% of the period left',
  },
  {
    key: 'spendable_low',
    label: 'Spendable balance low',
    desc: 'When spendable drops below your alert threshold',
  },
  {
    key: 'payday',
    label: 'Payday landed',
    desc: 'When a salary-sized credit appears on your account',
  },
  {
    key: 'possible_payday',
    label: 'Possible payday detected',
    desc: 'When a recurring credit looks like it might be your salary, before you link a source',
  },
  {
    key: 'large_tx',
    label: 'Large transaction',
    desc: 'Unexpected debits above the threshold you set',
  },
  {
    key: 'bills',
    label: 'Bill reminders',
    desc: 'Upcoming charges within their reminder window',
  },
  {
    key: 'saver_milestone',
    label: 'Saver goal milestones',
    desc: 'When a saver reaches 50%, 75%, or 100% of its goal',
  },
  {
    key: 'sync_stale',
    label: 'Data out of date',
    desc: "When Vantura hasn't synced in over 24 hours",
  },
]

const NOTIF_GROUPS: { label: string; icon: string; keys: NotifType[] }[] = [
  {
    label: 'Spending alerts',
    icon: 'mdi-alert-circle-outline',
    keys: [
      'tracker_overspent',
      'tracker_pace',
      'spendable_low',
      'payday',
      'possible_payday',
      'large_tx',
    ],
  },
  {
    label: 'Reminders & system',
    icon: 'mdi-bell-ring-outline',
    keys: ['bills', 'saver_milestone', 'sync_stale'],
  },
]

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
    const dayStr = settings.payday_day
    if (dayStr) {
      const dayNum = parseInt(dayStr, 10)
      const dayLabel = Number.isNaN(dayNum)
        ? dayStr
        : getPaydayDayLabel(freq, dayNum)
      parts.push(`${label} payday (${dayLabel})`)
    } else {
      parts.push(`${label} payday`)
    }
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

function formatBudgetSummary(
  buckets: BudgetBucketExportRow[],
  hypotheticals: BudgetHypotheticalExportRow[]
): string {
  if (!Array.isArray(buckets) || buckets.length === 0) return 'None'
  const hypsArr = Array.isArray(hypotheticals) ? hypotheticals : []
  return `${buckets.length} bucket${buckets.length !== 1 ? 's' : ''}, ${hypsArr.length} hypothetical${hypsArr.length !== 1 ? 's' : ''}`
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
    toast.success('Section order reset to default.')
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
            <div className="d-flex gap-1">
              <button
                type="button"
                className="btn-icon"
                onClick={() => moveUp(index)}
                disabled={index === 0}
                aria-label={`Move ${DASHBOARD_SECTION_LABELS[id]} up`}
              >
                <i className="mdi mdi-chevron-up" aria-hidden />
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => moveDown(index)}
                disabled={index === order.length - 1}
                aria-label={`Move ${DASHBOARD_SECTION_LABELS[id]} down`}
              >
                <i className="mdi mdi-chevron-down" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={resetToDefault}
          aria-label="Reset dashboard section order to default"
        >
          Reset to default order
        </Button>
        <span className="small text-muted">
          <i className="mdi mdi-check-circle-outline me-1" aria-hidden />
          Changes save automatically
        </span>
      </div>
    </div>
  )
}

export function Settings() {
  const { updateReady, applyUpdate, checkForUpdate, checking } = usePwaUpdate()
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
  const [txSearch, setTxSearch] = useState('')
  const [txResults, setTxResults] = useState<PayeeSummary[]>([])
  const [txDetectionResult, setTxDetectionResult] =
    useState<PaydayDetectionResult | null>(null)
  const [selectedPayRawText, setSelectedPayRawText] = useState<string | null>(
    () => getAppSetting('payday_raw_text')
  )
  const [selectedPayDescription, setSelectedPayDescription] = useState<
    string | null
  >(() => getAppSetting('payday_description') || null)
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
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    settings: true,
    trackers: true,
    upcomingCharges: true,
    budgetPlan: true,
  })
  const themeMode = useStore(themeStore, (s) => s.mode)
  const navigate = useNavigate()
  const [notificationsEnabled, setNotificationsEnabledState] = useState(() =>
    getNotificationsEnabled()
  )
  const [notifPermission, setNotifPermission] =
    useState<NotificationPermission | null>(() => getNotificationPermission())
  const [notifTypes, setNotifTypes] = useState<Record<NotifType, boolean>>(
    () =>
      Object.fromEntries(
        [
          'bills',
          'tracker_overspent',
          'tracker_pace',
          'spendable_low',
          'payday',
          'possible_payday',
          'large_tx',
          'saver_milestone',
          'sync_stale',
        ].map((k) => [k, getNotifTypeEnabled(k as NotifType)])
      ) as Record<NotifType, boolean>
  )
  const [largeTxThreshold, setLargeTxThresholdState] = useState(() =>
    String(Math.round(getLargeTxThresholdCents() / 100))
  )
  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null)
  const [bioEnabled, setBioEnabled] = useState(
    () =>
      getAppSetting('biometrics_enabled') !== '0' &&
      !!getAppSetting('biometric_credential_id')
  )
  const [bioRegistering, setBioRegistering] = useState(false)
  const [bioError, setBioError] = useState<string | null>(null)
  const [lockTimeout, setLockTimeout] = useState(
    () => getAppSetting('lock_timeout_minutes') ?? '3'
  )

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
    const nowDate = new Date()
    const todayLocal = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`
    setNextPayday(next ?? todayLocal)
    if (payAmt != null && payAmt !== '') {
      const cents = parseInt(payAmt, 10)
      if (!Number.isNaN(cents) && cents >= 0) {
        setPaydayPayAmount((cents / 100).toFixed(2))
      }
    } else {
      setPaydayPayAmount('')
    }
  }, [])

  useEffect(() => {
    isBiometricAvailable()
      .then(setBioAvailable)
      .catch(() => setBioAvailable(false))
  }, [])

  async function handleBiometricToggle(enable: boolean) {
    setBioError(null)
    if (!enable) {
      setAppSetting('biometrics_enabled', '0')
      setAppSetting('biometric_credential_id', '')
      clearBiometricSession()
      setBioEnabled(false)
      toast.success('Biometric unlock disabled.')
      return
    }
    setBioRegistering(true)
    try {
      const credentialId = await registerBiometric()
      setAppSetting('biometric_credential_id', credentialId)
      setAppSetting('biometrics_enabled', '1')
      const token = sessionStore.getState().getToken()
      if (token) await storeBiometricSession(token)
      setBioEnabled(true)
      toast.success('Biometric unlock enabled.')
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name !== 'NotAllowedError') {
        setBioError('Biometric registration failed. Please try again.')
      }
    } finally {
      setBioRegistering(false)
    }
  }

  async function handleReRegisterBiometric() {
    setBioError(null)
    setBioRegistering(true)
    try {
      const credentialId = await registerBiometric()
      setAppSetting('biometric_credential_id', credentialId)
      setAppSetting('biometrics_enabled', '1')
      const token = sessionStore.getState().getToken()
      if (token) {
        await storeBiometricSession(token)
      } else {
        clearBiometricSession()
      }
      setBioEnabled(true)
      toast.success('Biometric re-registered.')
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name !== 'NotAllowedError') {
        setBioError('Re-registration failed. Please try again.')
      }
    } finally {
      setBioRegistering(false)
    }
  }

  async function handleClearAllData() {
    setClearing(true)
    try {
      localStorage.removeItem('vantura_sidebar_collapsed')
      clearBiometricSession()
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
      // Keep the cached biometric-unlock session in sync so a rotated-out
      // token can't be restored via a fingerprint unlock later.
      if (hasBiometricSession()) await storeBiometricSession(newToken)
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
    const d = new Date()
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (nextPayday.trim() < todayStr) {
      setPaydayError(
        'Next payday cannot be in the past. Please select a future date.'
      )
      return
    }
    setAppSetting('payday_frequency', paydayFrequency)
    setAppSetting('payday_day', String(effectivePaydayDay))
    setAppSetting('next_payday', nextPayday.trim())
    if (selectedPayRawText) {
      setAppSetting('payday_raw_text', selectedPayRawText)
      setAppSetting(
        'payday_description',
        selectedPayDescription ?? selectedPayRawText
      )
      // Clear the suggestion guard so it won't re-fire now that payday is configured
      setAppSetting('notif_possible_payday_suggested_for', '')
    }
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
    setTxSearch('')
    setTxResults([])
    syncStore.getState().syncCompleted()
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
        budgetPlan: true,
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
              {activeSection === 'about' && (
                <>
                  {/* Version + URL */}
                  <div className="mb-4">
                    <div
                      className="d-flex align-items-center gap-2 mb-1"
                      style={{ fontSize: '0.9rem' }}
                    >
                      <i
                        className="mdi mdi-information-outline"
                        style={{
                          color: 'var(--vantura-primary)',
                          fontSize: '1.1rem',
                        }}
                        aria-hidden
                      />
                      <span className="text-muted">
                        Vantura{' '}
                        <span className="fw-semibold text-body">
                          v{APP_VERSION}
                        </span>
                      </span>
                    </div>
                    <div
                      className="d-flex align-items-center gap-2 mb-3"
                      style={{ fontSize: '0.9rem' }}
                    >
                      <i
                        className="mdi mdi-earth"
                        style={{
                          color: 'var(--vantura-primary)',
                          fontSize: '1.1rem',
                        }}
                        aria-hidden
                      />
                      <span className="text-muted">
                        Live at{' '}
                        <a
                          href="https://myvantura.xyz"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-body fw-semibold"
                        >
                          myvantura.xyz
                        </a>
                      </span>
                    </div>
                    {updateReady ? (
                      <Button
                        variant="outline-success"
                        size="sm"
                        onClick={applyUpdate}
                        aria-label="Install the available app update"
                      >
                        <i
                          className="mdi mdi-arrow-down-circle-outline me-1"
                          aria-hidden
                        />
                        Update available — Install now
                      </Button>
                    ) : (
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={checkForUpdate}
                        disabled={checking}
                        aria-label="Check for app updates"
                        aria-busy={checking}
                      >
                        {checking ? (
                          <>
                            <Spinner
                              animation="border"
                              size="sm"
                              className="me-1"
                              role="status"
                              aria-hidden="true"
                            />
                            Checking…
                          </>
                        ) : (
                          <>
                            <i className="mdi mdi-refresh me-1" aria-hidden />
                            Check for updates
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  <hr className="mb-4" />

                  {/* Resource cards */}
                  <div className="d-flex flex-column gap-3 mb-4">
                    <Link
                      to="/help"
                      className="d-flex align-items-center gap-3 p-3 rounded text-decoration-none"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        transition: 'border-color 0.15s',
                      }}
                      aria-label="Open user guide"
                    >
                      <i
                        className="mdi mdi-book-open-page-variant flex-shrink-0"
                        style={{
                          color: 'var(--vantura-primary)',
                          fontSize: '1.4rem',
                        }}
                        aria-hidden
                      />
                      <div>
                        <div className="fw-semibold small text-body">
                          User guide
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: '0.78rem' }}
                        >
                          How everything works — features, calculations, tips
                        </div>
                      </div>
                      <i
                        className="mdi mdi-chevron-right ms-auto flex-shrink-0"
                        style={{
                          color: 'var(--vantura-text-secondary)',
                          fontSize: '1.1rem',
                        }}
                        aria-hidden
                      />
                    </Link>

                    <Link
                      to="/changelog"
                      className="d-flex align-items-center gap-3 p-3 rounded text-decoration-none"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        transition: 'border-color 0.15s',
                      }}
                      aria-label="See what's new"
                    >
                      <i
                        className="mdi mdi-rocket-launch-outline flex-shrink-0"
                        style={{
                          color: 'var(--vantura-primary)',
                          fontSize: '1.4rem',
                        }}
                        aria-hidden
                      />
                      <div>
                        <div className="fw-semibold small text-body">
                          What&apos;s new
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: '0.78rem' }}
                        >
                          Changelog and release milestones
                        </div>
                      </div>
                      <i
                        className="mdi mdi-chevron-right ms-auto flex-shrink-0"
                        style={{
                          color: 'var(--vantura-text-secondary)',
                          fontSize: '1.1rem',
                        }}
                        aria-hidden
                      />
                    </Link>
                  </div>

                  <hr className="mb-4" />

                  {/* Dashboard tour */}
                  <div>
                    <p className="small text-muted mb-2">
                      New to Vantura? Run the dashboard tour to see how
                      everything works.
                    </p>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => {
                        setDashboardTourCompleted(false)
                        navigate('/')
                      }}
                      aria-label="Show dashboard tour again"
                    >
                      <i
                        className="mdi mdi-play-circle-outline me-1"
                        aria-hidden
                      />
                      Show dashboard tour
                    </Button>
                  </div>
                </>
              )}
              {activeSection === 'appearance' && (
                <>
                  <h6 className="text-muted mb-2">Theme</h6>
                  <p className="small text-muted mb-3">
                    Choose how Vantura looks. System follows your device's light
                    or dark setting automatically.
                  </p>
                  <div
                    className="d-flex gap-2"
                    role="group"
                    aria-label="Choose theme mode"
                  >
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
              )}
              {activeSection === 'payday' && (
                <>
                  <p className="small text-muted mb-3">
                    Used for your spendable balance, PAYDAY trackers, and budget
                    planning. Update when your pay cycle changes.
                  </p>
                  <Form onSubmit={handlePaydaySubmit}>
                    <div
                      className="mb-3 p-2 rounded"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.09)',
                      }}
                    >
                      <Form.Label
                        htmlFor="settings-tx-search"
                        className="small fw-semibold mb-1 d-block"
                      >
                        Detect from transactions
                      </Form.Label>
                      <Form.Text
                        className="text-muted d-block mb-2"
                        style={{ fontSize: '0.74rem' }}
                      >
                        Search for your pay transaction — Vantura will detect
                        your schedule from its history and fill the fields
                        below.
                      </Form.Text>
                      {(selectedPayDescription || selectedPayRawText) && (
                        <div
                          className="d-flex align-items-center gap-2 mb-2 px-2 py-1 rounded"
                          style={{
                            background:
                              'rgba(var(--vantura-success-rgb, 56,142,60), 0.12)',
                            border:
                              '1px solid rgba(var(--vantura-success-rgb, 56,142,60), 0.28)',
                            fontSize: '0.78rem',
                          }}
                        >
                          <i
                            className="mdi mdi-check-circle flex-shrink-0"
                            style={{
                              color: 'var(--vantura-success)',
                              fontSize: '1rem',
                            }}
                            aria-hidden
                          />
                          <span
                            className="text-body-secondary"
                            style={{ lineHeight: 1.3 }}
                          >
                            <span
                              className="fw-semibold"
                              style={{ color: 'var(--vantura-success)' }}
                            >
                              Linked:
                            </span>{' '}
                            {selectedPayDescription ?? selectedPayRawText}
                          </span>
                          <button
                            type="button"
                            className="btn-close btn-close-white ms-auto flex-shrink-0"
                            style={{ fontSize: '0.55rem', opacity: 0.5 }}
                            aria-label="Remove linked pay source"
                            onClick={() => {
                              setSelectedPayRawText(null)
                              setSelectedPayDescription(null)
                              setTxDetectionResult(null)
                              setAppSetting('payday_raw_text', '')
                              setAppSetting('payday_description', '')
                              // Reset suggestion guard so Vantura can re-suggest
                              // a payday source now that none is linked
                              setAppSetting(
                                'notif_possible_payday_suggested_for',
                                ''
                              )
                            }}
                          />
                        </div>
                      )}
                      <Form.Control
                        id="settings-tx-search"
                        type="search"
                        size="sm"
                        placeholder="Search by employer or payee name…"
                        value={txSearch}
                        autoComplete="off"
                        onChange={(e) => {
                          const q = e.target.value
                          setTxSearch(q)
                          setTxResults(
                            q.trim().length >= 2
                              ? searchCreditTransactions(q.trim())
                              : []
                          )
                        }}
                      />
                      {txResults.length > 0 && (
                        <div
                          className="list-group list-group-flush mt-1"
                          style={{
                            maxHeight: 180,
                            overflowY: 'auto',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.08)',
                          }}
                        >
                          {txResults.map((payee) => (
                            <button
                              key={payee.raw_text ?? payee.description}
                              type="button"
                              className="list-group-item list-group-item-action py-2 px-2 small"
                              onClick={() => {
                                const key = payee.raw_text ?? payee.description
                                const result = detectPaySchedule(key)
                                setTxDetectionResult(result)
                                setSelectedPayRawText(key)
                                setSelectedPayDescription(payee.description)
                                if (result) {
                                  setPaydayFrequency(result.frequency)
                                  setPaydayDay(result.paydayDay)
                                  setNextPayday(result.nextPayday)
                                }
                                setTxSearch('')
                                setTxResults([])
                              }}
                            >
                              <div className="d-flex justify-content-between align-items-center">
                                <span
                                  className="fw-semibold text-truncate"
                                  style={{ maxWidth: '70%' }}
                                >
                                  {payee.description}
                                </span>
                                <span className="text-muted ms-2 flex-shrink-0">
                                  {payee.occurrences}{' '}
                                  {payee.occurrences === 1 ? 'pay' : 'pays'}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {txDetectionResult && (
                        <p className="text-success small mt-2 mb-0">
                          <i
                            className="mdi mdi-check-circle-outline me-1"
                            aria-hidden
                          />
                          Detected from {txDetectionResult.sampleDates.length}{' '}
                          transaction
                          {txDetectionResult.sampleDates.length !== 1
                            ? 's'
                            : ''}{' '}
                          — fields updated below.
                        </p>
                      )}
                    </div>
                    <Form.Group className="mb-3">
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
                    <Form.Group className="mb-3">
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
                    <Form.Group className="mb-3">
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
                      Get OS notifications when Vantura detects something that
                      needs your attention. Notifications also appear in the
                      bell icon at the top of the screen so you can review them
                      any time. Requires browser permission.
                    </p>

                    {/* Browser permission denied warning */}
                    {notificationsEnabled && notifPermission === 'denied' && (
                      <div
                        className="d-flex align-items-start gap-2 p-2 rounded mb-3 small"
                        style={{
                          background: 'rgba(220,53,69,0.10)',
                          border: '1px solid rgba(220,53,69,0.28)',
                        }}
                        role="alert"
                      >
                        <i
                          className="mdi mdi-alert-circle-outline flex-shrink-0 mt-1"
                          style={{
                            color: 'var(--bs-danger)',
                            fontSize: '1rem',
                          }}
                          aria-hidden
                        />
                        <span>
                          Browser permission is <strong>denied</strong>. Enable
                          notifications in your browser settings, then reload
                          the page.
                        </span>
                      </div>
                    )}

                    {/* Master toggle */}
                    <Form.Check
                      type="switch"
                      id="settings-notifications-master"
                      label="Enable notifications"
                      className="mb-4"
                      checked={notificationsEnabled}
                      onChange={async (e) => {
                        const next = e.target.checked
                        if (next) {
                          const perm = getNotificationPermission()
                          if (perm !== 'granted') {
                            const granted =
                              await requestNotificationPermission()
                            setNotifPermission(getNotificationPermission())
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
                            ? 'Notifications enabled.'
                            : 'Notifications disabled.'
                        )
                      }}
                    />

                    {/* Per-type toggles — only shown when master is on */}
                    {notificationsEnabled && (
                      <div
                        style={{
                          borderLeft: '2px solid var(--vantura-border)',
                          paddingLeft: '1rem',
                        }}
                      >
                        {NOTIF_GROUPS.map((group) => (
                          <div key={group.label} className="mb-4">
                            <p
                              className="text-muted mb-3"
                              style={{
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              <i
                                className={`mdi ${group.icon} me-1`}
                                aria-hidden
                              />
                              {group.label}
                            </p>
                            {group.keys.map((k) => {
                              const notifType = NOTIF_TYPES.find(
                                (t) => t.key === k
                              )!
                              return (
                                <div key={k} className="mb-3">
                                  <Form.Check
                                    type="switch"
                                    id={`settings-notif-${k}`}
                                    label={notifType.label}
                                    checked={notifTypes[k]}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                      setNotifTypeEnabled(k, next)
                                      setNotifTypes((prev) => ({
                                        ...prev,
                                        [k]: next,
                                      }))
                                    }}
                                  />
                                  <div
                                    className="small text-muted"
                                    style={{ marginTop: 2, marginLeft: 48 }}
                                  >
                                    {notifType.desc}
                                  </div>
                                  {k === 'large_tx' &&
                                    notifTypes['large_tx'] && (
                                      <Form.Group
                                        className="mt-2"
                                        style={{
                                          marginLeft: 48,
                                          maxWidth: 200,
                                        }}
                                      >
                                        <Form.Label
                                          htmlFor="settings-large-tx-threshold"
                                          className="small text-muted mb-1"
                                        >
                                          Notify me when a single debit exceeds
                                          ($)
                                        </Form.Label>
                                        <Form.Control
                                          id="settings-large-tx-threshold"
                                          type="number"
                                          min={1}
                                          size="sm"
                                          value={largeTxThreshold}
                                          onChange={(e) =>
                                            setLargeTxThresholdState(
                                              e.target.value
                                            )
                                          }
                                          onBlur={() => {
                                            const dollars = parseInt(
                                              largeTxThreshold,
                                              10
                                            )
                                            if (
                                              !Number.isNaN(dollars) &&
                                              dollars > 0
                                            ) {
                                              setLargeTxThresholdCents(
                                                dollars * 100
                                              )
                                              toast.success(
                                                `Large transaction threshold set to $${dollars}.`
                                              )
                                            } else {
                                              setLargeTxThresholdState(
                                                String(
                                                  Math.round(
                                                    getLargeTxThresholdCents() /
                                                      100
                                                  )
                                                )
                                              )
                                            }
                                          }}
                                        />
                                      </Form.Group>
                                    )}
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              {activeSection === 'security' && (
                <>
                  <p className="small text-muted mb-3">
                    Vantura locks automatically after a period of inactivity.
                    With biometrics enabled, your device&apos;s biometric can
                    unlock the app instead of your passphrase.
                  </p>
                  <Form.Group className="mb-4">
                    <Form.Label htmlFor="settings-lock-timeout">
                      Lock after inactivity
                    </Form.Label>
                    <Form.Select
                      id="settings-lock-timeout"
                      value={lockTimeout}
                      onChange={(e) => {
                        const val = e.target.value
                        setLockTimeout(val)
                        setAppSetting('lock_timeout_minutes', val)
                        sessionStore.getState().bumpLockTimeoutVersion()
                        toast.success('Lock timeout updated.')
                      }}
                      style={{ maxWidth: 200 }}
                    >
                      <option value="1">1 minute</option>
                      <option value="3">3 minutes</option>
                      <option value="5">5 minutes</option>
                      <option value="10">10 minutes</option>
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                    </Form.Select>
                  </Form.Group>
                  <hr className="mb-4" />
                  {bioAvailable === null && (
                    <div
                      className="d-flex align-items-center gap-2 text-muted small"
                      role="status"
                    >
                      <Spinner
                        animation="border"
                        size="sm"
                        role="status"
                        aria-hidden="true"
                      />
                      Checking biometric availability…
                    </div>
                  )}
                  {bioAvailable === false && (
                    <div
                      className="alert alert-secondary small mb-3"
                      role="status"
                    >
                      Your browser or device does not support biometric
                      authentication. A passphrase is required to unlock.
                    </div>
                  )}
                  {bioAvailable === true && (
                    <>
                      <Form.Check
                        type="switch"
                        id="settings-bio-toggle"
                        label="Biometric unlock"
                        checked={bioEnabled}
                        disabled={bioRegistering}
                        onChange={(e) =>
                          handleBiometricToggle(e.target.checked)
                        }
                        className="mb-1"
                      />
                      <p
                        className="small text-muted mb-3"
                        style={{ marginLeft: 48 }}
                      >
                        Touch ID, Face ID, Windows Hello, or your device&apos;s
                        biometric
                      </p>
                      {bioEnabled && (
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={handleReRegisterBiometric}
                          disabled={bioRegistering}
                          aria-busy={bioRegistering}
                          className="mb-3"
                        >
                          {bioRegistering ? (
                            <>
                              <Spinner
                                animation="border"
                                size="sm"
                                className="me-1"
                                role="status"
                                aria-hidden="true"
                              />
                              Registering…
                            </>
                          ) : (
                            'Re-register biometric'
                          )}
                        </Button>
                      )}
                      {bioError && (
                        <div className="text-danger small mb-2" role="alert">
                          {bioError}
                        </div>
                      )}
                    </>
                  )}
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
                    <div className="d-flex align-items-center gap-3 flex-wrap mb-2">
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
                      <span className="small text-muted">
                        Last synced: {formatLastSync(lastSync)}
                      </span>
                    </div>
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

                  <hr className="my-4" />

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

                  {!isDemoMode && <hr className="my-4" />}

                  <h6 className="text-muted mb-3">Transfer settings</h6>

                  <div className="mb-4">
                    <p className="small fw-semibold text-body mb-1">
                      Export profile
                    </p>
                    <p className="small text-muted mb-2">
                      Exports appearance and configuration (colors, payday
                      setup, notification preferences, trackers, upcoming
                      charges, budget plan, and chart preferences). Does not
                      export bank transactions, account numbers, or API tokens.
                      The file is encrypted with the passphrase you choose.
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
                    <p className="small fw-semibold text-body mb-1">
                      Import profile
                    </p>
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

                  <hr className="my-4" />

                  {/* Danger zone */}
                  <div
                    className="p-3 rounded"
                    style={{
                      background: 'rgba(220,53,69,0.06)',
                      border: '1px solid rgba(220,53,69,0.2)',
                    }}
                  >
                    <p
                      className="small fw-semibold mb-3"
                      style={{
                        color: 'var(--bs-danger)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        fontSize: '0.72rem',
                      }}
                    >
                      <i className="mdi mdi-alert-outline me-1" aria-hidden />
                      Danger zone
                    </p>
                    <p className="small fw-semibold text-body mb-1">
                      Clear all data
                    </p>
                    <p className="small text-muted mb-3">
                      Permanently delete all local data. You will need to
                      re-enter your passphrase and Personal Access Token
                      (re-onboard). This cannot be undone.
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
                Imports settings, trackers, upcoming charges, and budget plan
                into this device. Will not import transactions or API tokens.
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
                Choose which sections to import. Each selected section fully
                replaces the existing data on this device; unselected sections
                are left unchanged. If you import Trackers or Upcoming charges
                without importing Budget Plan, those items will lose their
                bucket assignments.
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
                      <div className="mb-2">
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
                      <div>
                        <Form.Check
                          type="checkbox"
                          id="import-opt-budget-plan"
                          label="Budget Plan (buckets & hypotheticals)"
                          checked={importOptions.budgetPlan}
                          onChange={(e) =>
                            setImportOptions((o) => ({
                              ...o,
                              budgetPlan: e.target.checked,
                            }))
                          }
                          aria-label="Import budget plan"
                        />
                        <div className="small text-muted ms-4 mt-1">
                          Current:{' '}
                          {formatBudgetSummary(
                            current.budgetBuckets,
                            current.budgetHypotheticals
                          )}
                          {' → '}
                          New:{' '}
                          {formatBudgetSummary(
                            importPreview.budgetBuckets ?? [],
                            importPreview.budgetHypotheticals ?? []
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
                    !importOptions.upcomingCharges &&
                    !importOptions.budgetPlan)
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
