import { useState, useEffect, useRef, FormEvent } from 'react'
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap'
import { useStore } from 'zustand'
import { getAppSetting, setAppSetting, deleteDatabase } from '@/db'
import { sessionStore } from '@/stores/sessionStore'
import { deriveKeyFromPassphrase, decryptToken } from '@/lib/crypto'
import {
  isBiometricAvailable,
  registerBiometric,
  verifyBiometric,
} from '@/lib/webauthn'
import {
  hasBiometricSession,
  retrieveBiometricSession,
  storeBiometricSession,
} from '@/lib/biometricSession'
import { VanturaLogo } from '@/components/VanturaLogo'

type Mode = 'biometric' | 'passphrase' | 'reset-confirm'

export function Unlock() {
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bioPrompting, setBioPrompting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const setUnlocked = useStore(sessionStore, (s) => s.setUnlocked)

  const isDemoMode = getAppSetting('demo_mode') === '1'
  const credentialId = getAppSetting('biometric_credential_id')
  const bioDisabled = getAppSetting('biometrics_enabled') === '0'
  const canUseBiometric =
    !bioDisabled && !!credentialId && hasBiometricSession()

  const [mode, setMode] = useState<Mode>(
    !isDemoMode && canUseBiometric ? 'biometric' : 'passphrase'
  )

  const didAutoTrigger = useRef(false)

  async function triggerBiometric() {
    if (!credentialId) return
    setBioPrompting(true)
    setError(null)
    try {
      const ok = await verifyBiometric(credentialId)
      if (!ok) throw new Error('Verification returned false')
      const token = await retrieveBiometricSession()
      if (!token) throw new Error('Session expired')
      setUnlocked(token)
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name !== 'NotAllowedError') {
        setError('Biometric check failed. Use your passphrase instead.')
      }
      setMode('passphrase')
    } finally {
      setBioPrompting(false)
    }
  }

  // Auto-trigger the biometric prompt on mount — saves one tap for returning users
  useEffect(() => {
    if (mode === 'biometric' && !didAutoTrigger.current) {
      didAutoTrigger.current = true
      void triggerBiometric()
    }
  }, []) // intentional: only fires once on mount

  async function handleResetApp() {
    setResetting(true)
    setResetError(null)
    try {
      localStorage.removeItem('vantura_sidebar_collapsed')
      await deleteDatabase()
      window.location.reload()
    } catch (err) {
      setResetError(
        err instanceof Error
          ? err.message
          : 'Failed to reset. Please try again.'
      )
      setResetting(false)
    }
  }

  if (isDemoMode) {
    return (
      <div className="auth-full-bg">
        <Card style={{ width: '100%', maxWidth: 400 }} className="auth-card">
          <Card.Body>
            <div className="text-center mb-4">
              <VanturaLogo variant="wordmark" height={28} />
            </div>
            <Card.Title className="mb-2 text-center">
              Welcome to Vantura
            </Card.Title>
            <Card.Text className="text-muted small mb-3 text-center">
              You&apos;re exploring Vantura with sample data — no Up Bank
              account needed.
            </Card.Text>
            <div className="text-center">
              <Button
                type="button"
                className="btn-gradient-primary"
                onClick={() => setUnlocked('demo')}
              >
                Open demo
              </Button>
            </div>
          </Card.Body>
        </Card>
      </div>
    )
  }

  if (mode === 'biometric') {
    return (
      <div className="auth-full-bg">
        <Card style={{ width: '100%', maxWidth: 400 }} className="auth-card">
          <Card.Body className="text-center">
            <div className="mb-4">
              <VanturaLogo variant="wordmark" height={28} />
            </div>
            <Card.Title className="mb-3">Vantura is locked</Card.Title>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>
              <i className="mdi mdi-lock-outline" aria-hidden />
            </div>
            <p className="text-muted small mb-3">
              Tap the button below to unlock with your device credentials.
            </p>
            {error && (
              <Alert
                variant="danger"
                className="py-2 mb-3 text-center"
                role="alert"
              >
                {error}
              </Alert>
            )}
            <Button
              type="button"
              className="btn-gradient-primary mb-3"
              onClick={triggerBiometric}
              disabled={bioPrompting}
            >
              {bioPrompting ? (
                <>
                  <Spinner
                    animation="border"
                    size="sm"
                    className="me-1"
                    role="status"
                    aria-hidden="true"
                  />
                  Waiting…
                </>
              ) : (
                'Unlock with biometrics'
              )}
            </Button>
            <div>
              <button
                type="button"
                className="btn btn-link btn-sm text-muted p-0"
                onClick={() => {
                  setMode('passphrase')
                  setError(null)
                }}
              >
                Use passphrase instead
              </button>
            </div>
          </Card.Body>
        </Card>
      </div>
    )
  }

  if (mode === 'reset-confirm') {
    return (
      <div className="auth-full-bg">
        <Card style={{ width: '100%', maxWidth: 400 }} className="auth-card">
          <Card.Body>
            <div className="text-center mb-4">
              <VanturaLogo variant="wordmark" height={28} />
            </div>
            <Card.Title className="mb-3 text-center">Reset Vantura?</Card.Title>
            <p className="text-muted small mb-2 text-center">
              Your passphrase is the encryption key for your data — it&apos;s
              never stored anywhere, and Vantura has no server-side copy to
              recover from. This is intentional: your data stays completely
              private and only you can access it.
            </p>
            <p className="text-muted small mb-4 text-center">
              Without your passphrase, your data can&apos;t be decrypted by
              anyone. To start over, all local data must be permanently deleted.
            </p>
            {resetError && (
              <Alert
                variant="danger"
                className="py-2 mb-3 text-center"
                role="alert"
              >
                {resetError}
              </Alert>
            )}
            <div className="d-grid gap-2">
              <Button
                variant="danger"
                onClick={handleResetApp}
                disabled={resetting}
              >
                {resetting ? (
                  <>
                    <Spinner
                      animation="border"
                      size="sm"
                      className="me-1"
                      role="status"
                      aria-hidden="true"
                    />
                    Deleting…
                  </>
                ) : (
                  'Delete all data'
                )}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  className="btn btn-link btn-sm text-muted p-0"
                  onClick={() => {
                    setMode('passphrase')
                    setResetError(null)
                  }}
                  disabled={resetting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const salt = getAppSetting('encryption_salt')
      const encrypted = getAppSetting('api_token_encrypted')
      if (!salt || !encrypted) {
        setError('No stored credentials. Please complete onboarding.')
        return
      }
      const key = await deriveKeyFromPassphrase(passphrase, salt)
      const token = await decryptToken(encrypted, key)

      // Auto-register biometrics on first passphrase unlock if not opted out
      const existingCredId = getAppSetting('biometric_credential_id')
      if (!bioDisabled && !existingCredId) {
        try {
          const available = await isBiometricAvailable()
          if (available) {
            const newCredId = await registerBiometric()
            setAppSetting('biometric_credential_id', newCredId)
            setAppSetting('biometrics_enabled', '1')
            await storeBiometricSession(token)
          }
        } catch {
          // Non-fatal — user may have dismissed the prompt
        }
      } else if (existingCredId && !bioDisabled) {
        // Refresh bio session after passphrase unlock
        await storeBiometricSession(token).catch(() => {})
      }

      setUnlocked(token)
    } catch {
      setError('Incorrect passphrase. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-full-bg">
      <Card style={{ width: '100%', maxWidth: 400 }} className="auth-card">
        <Card.Body>
          <div className="text-center mb-4">
            <VanturaLogo variant="wordmark" height={28} />
          </div>
          <Form onSubmit={handleSubmit}>
            {/* Hidden username field for a11y / password-manager heuristic */}
            <input
              id="unlock-username"
              type="text"
              name="username"
              autoComplete="username"
              aria-label="Username"
              tabIndex={-1}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '-9999px',
                width: 1,
                height: 1,
              }}
            />
            <Form.Group className="mb-3">
              <Form.Control
                id="unlock-passphrase"
                aria-label="Passphrase"
                name="passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value)
                  setError(null)
                }}
                placeholder="Enter passphrase"
                autoComplete="current-password"
                disabled={loading}
                isInvalid={!!error}
                autoFocus
              />
            </Form.Group>
            {error && (
              <Alert
                variant="danger"
                className="py-2 mb-2 text-center"
                role="alert"
              >
                {error}
              </Alert>
            )}
            <div className="text-center">
              <Button
                type="submit"
                className="btn-gradient-primary"
                disabled={loading}
              >
                {loading ? 'Unlocking…' : 'Unlock'}
              </Button>
            </div>
          </Form>
          <div className="text-center mt-3">
            {canUseBiometric && (
              <button
                type="button"
                className="btn btn-link btn-sm text-muted p-0 d-block mx-auto mb-2"
                onClick={() => {
                  setMode('biometric')
                  setError(null)
                }}
              >
                Use biometrics instead
              </button>
            )}
            <button
              type="button"
              className="btn btn-link btn-sm text-muted p-0 d-block mx-auto"
              style={{ fontSize: '0.75rem' }}
              onClick={() => setMode('reset-confirm')}
            >
              Forgot your passphrase?
            </button>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
