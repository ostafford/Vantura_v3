import { useState, FormEvent } from 'react'
import { Button, Card, Form, ProgressBar } from 'react-bootstrap'
import { setAppSetting, getAppSetting } from '@/db'
import { sessionStore } from '@/stores/sessionStore'
import { seedDemoData } from '@/db/seedDemoData'
import {
  generateSalt,
  deriveKeyFromPassphrase,
  encryptToken,
} from '@/lib/crypto'
import { validateUpBankToken } from '@/api/upBank'
import { performInitialSync, type SyncProgress } from '@/services/sync'
import { type PaydayFrequency, getPaydayDayOptions } from '@/lib/payday'

interface OnboardingProps {
  onComplete: () => void
}

const STEPS = 6

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1)
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [paydayFrequency, setPaydayFrequency] =
    useState<PaydayFrequency>('MONTHLY')
  const [paydayDay, setPaydayDay] = useState(1)
  const [nextPayday, setNextPayday] = useState('')
  const [paydayPayAmount, setPaydayPayAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)

  async function handleStep2Submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters.')
      return
    }
    if (passphrase !== passphraseConfirm) {
      setError('Passphrases do not match.')
      return
    }
    setStep(3)
  }

  async function handleStep3Submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const valid = await validateUpBankToken(apiToken)
      if (!valid) {
        setError('Invalid Personal Access Token. Please check and try again.')
        return
      }
      const salt = getAppSetting('encryption_salt') ?? generateSalt()
      setAppSetting('encryption_salt', salt)
      const key = await deriveKeyFromPassphrase(passphrase, salt)
      const encrypted = await encryptToken(apiToken, key)
      setAppSetting('api_token_encrypted', encrypted)
      setPassphrase('')
      setPassphraseConfirm('')
      setStep(4)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to validate or store token.'
      )
    } finally {
      setLoading(false)
    }
  }

  function handleStep4Submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nextPayday) {
      setError('Please select your next payday.')
      return
    }
    setAppSetting('payday_frequency', paydayFrequency)
    setAppSetting('payday_day', String(effectivePaydayDay))
    setAppSetting('next_payday', nextPayday)
    const payAmtTrimmed = paydayPayAmount.trim()
    if (payAmtTrimmed === '') {
      setAppSetting('pay_amount_cents', '')
    } else {
      const cents = Math.round(parseFloat(payAmtTrimmed) * 100)
      if (!Number.isNaN(cents) && cents >= 0) {
        setAppSetting('pay_amount_cents', String(cents))
      }
    }
    setStep(5)
    startInitialSync(apiToken)
  }

  function handleStep4Skip() {
    setError(null)
    setStep(5)
    startInitialSync(apiToken)
  }

  async function startInitialSync(token: string) {
    setError(null)
    setSyncProgress({ phase: 'accounts' })
    try {
      await performInitialSync(token, (p) => setSyncProgress(p))
      setStep(6)
      sessionStore.getState().setUnlocked(token)
      setApiToken('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Sync failed. You can try again from Settings.'
      )
    }
  }

  function handleStep6Go() {
    onComplete()
  }

  function handleTryWithSampleData() {
    setError(null)
    setLoading(true)
    try {
      seedDemoData()
      sessionStore.getState().setUnlocked('demo')
      onComplete()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load sample data. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const paydayDayOptions = getPaydayDayOptions(paydayFrequency)
  const currentPaydayDayValid = paydayDayOptions.some(
    (opt) => opt.value === paydayDay
  )
  const effectivePaydayDay = currentPaydayDayValid
    ? paydayDay
    : (paydayDayOptions[0]?.value ?? 1)

  return (
    <div className="auth-full-bg">
      <Card style={{ width: '100%', maxWidth: 480 }} className="auth-card">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <Card.Title className="mb-0">Setup</Card.Title>
            <span className="text-muted small">
              Step {step} of {STEPS}
            </span>
          </div>
          <ProgressBar
            now={(step / STEPS) * 100}
            variant="primary"
            striped
            animated
            className="mb-3"
          />

          {step === 1 && (
            <>
              <h5 className="mb-2">Welcome to Vantura</h5>
              <p className="text-muted small mb-3">
                Vantura syncs with your Up Bank account to give you powerful
                desktop-based financial insights. Your data is stored locally
                and never leaves your device. When you sync, transactions are
                downloaded to this device only—no cloud storage; we don&apos;t
                have servers that store your data.
              </p>
              <div className="d-flex flex-column gap-2">
                <Button
                  className="btn-gradient-primary"
                  onClick={() => setStep(2)}
                  disabled={loading}
                >
                  Get Started
                </Button>
                <Button
                  variant="outline-primary"
                  onClick={handleTryWithSampleData}
                  disabled={loading}
                >
                  {loading ? 'Loading…' : 'Try with sample data'}
                </Button>
              </div>
              {error && (
                <div className="text-danger small mt-2" role="alert">
                  {error}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <Form onSubmit={handleStep2Submit}>
              <h6 className="mb-2">Create a passphrase</h6>
              <p className="text-muted small mb-3">
                This passphrase protects your Personal Access Token and is never
                stored. You must enter it each time you open the app to unlock.
                If you forget it, you will need to re-onboard and create a new
                Personal Access Token in Up Bank.
              </p>
              <Form.Group className="mb-2">
                <Form.Label htmlFor="onboarding-passphrase">
                  Passphrase
                </Form.Label>
                <Form.Control
                  id="onboarding-passphrase"
                  name="passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label htmlFor="onboarding-passphrase-confirm">
                  Confirm passphrase
                </Form.Label>
                <Form.Control
                  id="onboarding-passphrase-confirm"
                  name="passphraseConfirm"
                  type="password"
                  value={passphraseConfirm}
                  onChange={(e) => setPassphraseConfirm(e.target.value)}
                  placeholder="Confirm"
                  autoComplete="new-password"
                />
              </Form.Group>
              {error && (
                <div className="text-danger small mb-2" role="alert">
                  {error}
                </div>
              )}
              <div className="d-flex justify-content-between align-items-center gap-2">
                <Button
                  type="button"
                  variant="outline-secondary"
                  onClick={() => {
                    setError(null)
                    setStep(1)
                  }}
                  aria-label="Back to welcome"
                >
                  Back
                </Button>
                <Button type="submit" className="btn-gradient-primary">
                  Continue
                </Button>
              </div>
            </Form>
          )}

          {step === 3 && (
            <Form onSubmit={handleStep3Submit}>
              <h6 className="mb-2">Connect your Up Bank account</h6>
              <p className="text-muted small mb-3">
                1. In the Up Bank app go to Data sharing → Personal Access
                Token.
                <br />
                2. Create a new Personal Access Token.
                <br />
                3. Copy and paste it below. It will be encrypted and never
                stored in plain form.
              </p>
              <Form.Group className="mb-3">
                <Form.Label htmlFor="onboarding-api-token">
                  Personal Access Token
                </Form.Label>
                <Form.Control
                  id="onboarding-api-token"
                  name="apiToken"
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Paste your token"
                  autoComplete="off"
                  disabled={loading}
                />
                <Form.Text className="text-muted">
                  <a
                    href="https://developer.up.com.au/#personal-access-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Learn more about Personal Access Tokens
                  </a>
                </Form.Text>
              </Form.Group>
              {error && (
                <div className="text-danger small mb-2" role="alert">
                  {error}
                </div>
              )}
              <div className="d-flex justify-content-between align-items-center gap-2">
                <Button
                  type="button"
                  variant="outline-secondary"
                  onClick={() => {
                    setError(null)
                    setStep(2)
                  }}
                  disabled={loading}
                  aria-label="Back to passphrase"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="btn-gradient-primary"
                  disabled={loading}
                >
                  {loading ? 'Validating…' : 'Continue'}
                </Button>
              </div>
            </Form>
          )}

          {step === 4 && (
            <Form onSubmit={handleStep4Submit}>
              <h6 className="mb-2">When do you get paid?</h6>
              <p className="text-muted small mb-3">
                This helps calculate your Spendable balance. When Monthly, Day
                is the date in the month (1st–28th). If you&apos;re paid on the
                29th–31st, choose 28th and set Next payday to your actual date.
              </p>
              <Form.Group className="mb-2">
                <Form.Label htmlFor="onboarding-payday-frequency">
                  Frequency
                </Form.Label>
                <Form.Select
                  id="onboarding-payday-frequency"
                  name="paydayFrequency"
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
                <Form.Label htmlFor="onboarding-payday-day">Day</Form.Label>
                <Form.Select
                  id="onboarding-payday-day"
                  name="paydayDay"
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
                <Form.Label htmlFor="onboarding-payday-pay-amount">
                  Pay amount ($)
                </Form.Label>
                <Form.Control
                  id="onboarding-payday-pay-amount"
                  name="paydayPayAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                  value={paydayPayAmount}
                  onChange={(e) => setPaydayPayAmount(e.target.value)}
                  aria-label="Pay amount per pay period (optional)"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label htmlFor="onboarding-next-payday">
                  Next payday
                </Form.Label>
                <Form.Control
                  id="onboarding-next-payday"
                  name="nextPayday"
                  type="date"
                  value={nextPayday}
                  onChange={(e) => setNextPayday(e.target.value)}
                />
              </Form.Group>
              {error && (
                <div className="text-danger small mb-2" role="alert">
                  {error}
                </div>
              )}
              <div className="d-flex justify-content-between align-items-center gap-2">
                <Button
                  type="button"
                  variant="outline-secondary"
                  onClick={() => {
                    setError(null)
                    setStep(3)
                  }}
                  aria-label="Back to Personal Access Token"
                >
                  Back
                </Button>
                <div className="d-flex gap-2">
                  <Button
                    type="button"
                    variant="outline-secondary"
                    onClick={handleStep4Skip}
                    aria-label="Skip payday setup"
                  >
                    Skip
                  </Button>
                  <Button type="submit" className="btn-gradient-primary">
                    Continue
                  </Button>
                </div>
              </div>
            </Form>
          )}

          {step === 5 && (
            <>
              <h6 className="mb-2">Syncing your transactions</h6>
              <p className="text-muted small mb-2">
                This may take a minute for large transaction histories.
              </p>
              {syncProgress && (
                <>
                  <ProgressBar
                    animated={syncProgress.phase === 'transactions'}
                    now={
                      syncProgress.phase === 'done'
                        ? 100
                        : syncProgress.phase === 'transactions' &&
                            syncProgress.fetched != null
                          ? Math.min(95, (syncProgress.fetched / 500) * 90)
                          : 50
                    }
                    className="mb-2"
                  />
                  <p className="small mb-0">
                    {syncProgress.phase === 'done'
                      ? 'Done.'
                      : syncProgress.phase === 'transactions' &&
                          syncProgress.fetched != null
                        ? `Fetched ${syncProgress.fetched} transactions…`
                        : `Syncing ${syncProgress.phase}…`}
                  </p>
                </>
              )}
              {error && (
                <div className="text-danger small mt-2" role="alert">
                  {error}
                </div>
              )}
            </>
          )}

          {step === 6 && (
            <>
              <h5 className="mb-2">All set</h5>
              <p className="text-muted small mb-3">
                You're ready to start tracking your finances. Create trackers to
                monitor spending, view Spendable to see safe-to-spend amount,
                and set saver goals to reach financial targets.
              </p>
              <p className="text-muted small mb-3">
                New to Vantura? You can take a short dashboard tour or read the
                <a
                  href={`${import.meta.env.BASE_URL}help`}
                  className="ms-1"
                  rel="noopener noreferrer"
                >
                  user guide
                </a>{' '}
                from Help when you&apos;re ready.
              </p>
              <Button className="btn-gradient-primary" onClick={handleStep6Go}>
                Go to Dashboard
              </Button>
            </>
          )}
        </Card.Body>
      </Card>
    </div>
  )
}
