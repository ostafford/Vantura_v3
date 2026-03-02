import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { Card, Button, Modal, Spinner, Form } from 'react-bootstrap'
import { getAppSetting, setAppSetting, deleteDatabase } from '@/db'
import { accentStore } from '@/stores/accentStore'
import { syncStore } from '@/stores/syncStore'
import { toast } from '@/stores/toastStore'
import { ACCENT_PALETTES, type AccentId } from '@/lib/accentPalettes'
import { sessionStore } from '@/stores/sessionStore'
import { performFullSync, type SyncProgress } from '@/services/sync'
import {
  deriveKeyFromPassphrase,
  decryptToken,
  encryptToken,
} from '@/lib/crypto'
import {
  validateUpBankToken,
  UpBankUnauthorizedError,
  SYNC_401_MESSAGE,
} from '@/api/upBank'
import { type PaydayFrequency, getPaydayDayOptions } from '@/lib/payday'
import { setDashboardTourCompleted } from '@/lib/dashboardTour'

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

export function Settings() {
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
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
  const accent = useStore(accentStore, (s) => s.accent)
  const setAccent = useStore(accentStore, (s) => s.setAccent)
  const navigate = useNavigate()

  useEffect(() => {
    setLastSync(getAppSetting('last_sync'))
  }, [syncing])

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

  async function handleReSync() {
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
      setSyncProgress({ phase: 'accounts' })
      await performFullSync(token, (p) => setSyncProgress(p))
      setLastSync(getAppSetting('last_sync'))
      syncStore.getState().syncCompleted()
      toast.success('Full sync complete. All transactions updated.')
    } catch (err) {
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
  }

  async function handleClearAllData() {
    setClearing(true)
    try {
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
      setLastSync(getAppSetting('last_sync'))
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

  return (
    <div>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon">
            <i className="mdi mdi-cog" aria-hidden />
          </span>
          Settings
        </h3>
      </div>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Help
        </Card.Header>
        <Card.Body>
          <p className="small text-muted mb-2">
            New to Vantura? Read the user guide or run the dashboard tour to see
            how everything works.
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
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Appearance
        </Card.Header>
        <Card.Body>
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
                  className="border rounded-circle p-0 d-flex align-items-center justify-content-center"
                  style={{
                    width: 40,
                    height: 40,
                    background: palette.primary,
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
        </Card.Body>
      </Card>

      <Card className="grid-margin mb-4">
        <Card.Header as="h5" className="mb-0">
          Payday
        </Card.Header>
        <Card.Body>
          <p className="small text-muted mb-3">
            Used for spendable balance and PAYDAY trackers. Update when your pay
            cycle changes (e.g. new job). When Monthly, Day is the date in the
            month (1st–28th). If you&apos;re paid on the 29th–31st, choose 28th
            and set Next payday to your actual date.
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
                Optional. Used for Spendable context, alerts, and PAYDAY tracker
                warnings.
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
              <span className="d-block mb-2 text-success small" role="status">
                Payday settings updated.
              </span>
            )}
            <Button type="submit" className="btn-gradient-primary" size="sm">
              Save payday settings
            </Button>
          </Form>
        </Card.Body>
      </Card>

      <Card className="grid-margin">
        <Card.Header as="h5" className="mb-0">
          Data
        </Card.Header>
        <Card.Body>
          {isDemoMode && (
            <div
              className="alert alert-info mb-4"
              role="status"
              id="settings-demo-banner"
            >
              You&apos;re using sample data. Clear all data below to connect
              your real Up Bank account.
            </div>
          )}
          <div className="mb-4">
            <h6 className="text-muted mb-2">Re-sync with Up Bank</h6>
            <p className="small text-muted mb-2">
              Sync downloads your Up Bank transactions to this device only. No
              cloud storage is used; we don&apos;t have servers that store your
              data.
            </p>
            <p className="small text-muted mb-2">
              Re-syncs all transactions, including category changes made in the
              Up Bank app.
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
                {syncProgress.phase === 'done'
                  ? 'Complete.'
                  : syncProgress.phase === 'transactions' &&
                      syncProgress.fetched != null
                    ? `Fetched ${syncProgress.fetched} transactions…`
                    : `Syncing ${syncProgress.phase}…`}
              </p>
            )}
            {syncError && (
              <span className="d-block mt-2 text-danger small" role="alert">
                {syncError}
              </span>
            )}
          </div>

          <hr />

          {!isDemoMode && (
            <div className="mb-4">
              <h6 className="text-muted mb-2">Personal Access Token</h6>
              <p className="small text-muted mb-2">
                If your token has expired (e.g. 48-hour token from Up Bank),
                update it here. Your passphrase is required; other data is not
                deleted.
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
                <span className="d-block mt-2 text-success small" role="status">
                  Personal Access Token updated. You can re-sync now.
                </span>
              )}
            </div>
          )}

          {!isDemoMode && <hr />}

          <div>
            <h6 className="text-muted mb-2">Clear all data</h6>
            <p className="small text-muted mb-2">
              Permanently delete all local data. You will need to re-enter your
              passphrase and Personal Access Token (re-onboard).
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
        </Card.Body>
      </Card>

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
          All local data will be permanently deleted, including your encrypted
          Personal Access Token. You will need to re-enter your passphrase and
          Personal Access Token to use the app again. This cannot be undone.
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
              Bank app. Your existing data (savers, trackers, etc.) will be
              kept.
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
    </div>
  )
}
