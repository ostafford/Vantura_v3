import { useState, FormEvent } from 'react'
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap'
import { useStore } from 'zustand'
import { getAppSetting, setAppSetting } from '@/db'
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

type Mode = 'biometric' | 'passphrase'

export function Unlock() {
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [bioPrompting, setBioPrompting] = useState(false)
  const setUnlocked = useStore(sessionStore, (s) => s.setUnlocked)

  const isDemoMode = getAppSetting('demo_mode') === '1'
  const credentialId = getAppSetting('biometric_credential_id')
  const bioDisabled = getAppSetting('biometrics_enabled') === '0'
  const canUseBiometric =
    !bioDisabled && !!credentialId && hasBiometricSession()

  const [mode, setMode] = useState<Mode>(
    !isDemoMode && canUseBiometric ? 'biometric' : 'passphrase'
  )

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

  if (isDemoMode) {
    return (
      <div className="auth-full-bg">
        <Card style={{ width: '100%', maxWidth: 400 }} className="auth-card">
          <Card.Body>
            <Card.Title className="mb-3">Demo mode</Card.Title>
            <Card.Text className="text-muted small mb-3 text-center">
              You&apos;re using sample data. Open the demo to explore the app
              without connecting your Up Bank account.
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
            <Card.Title className="mb-3">Vantura is locked</Card.Title>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>
              <i className="mdi mdi-fingerprint" aria-hidden />
            </div>
            <p className="text-muted small mb-3">
              Tap the button below to unlock with Touch ID or Face ID.
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
          <Card.Title className="mb-3">Unlock Vantura</Card.Title>
          <Card.Text className="text-muted small mb-3 text-center">
            Enter your passphrase to access your data. Your passphrase is never
            stored.
          </Card.Text>
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
              <Form.Label htmlFor="unlock-passphrase">Passphrase</Form.Label>
              <Form.Control
                id="unlock-passphrase"
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
          {canUseBiometric && (
            <div className="text-center mt-3">
              <button
                type="button"
                className="btn btn-link btn-sm text-muted p-0"
                onClick={() => {
                  setMode('biometric')
                  setError(null)
                }}
              >
                Use biometrics instead
              </button>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  )
}
