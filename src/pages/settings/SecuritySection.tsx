import { useState, useEffect } from 'react'
import { Button, Form, Spinner } from 'react-bootstrap'
import { getAppSetting, setAppSetting } from '@/db'
import { toast } from '@/stores/toastStore'
import { sessionStore } from '@/stores/sessionStore'
import { isBiometricAvailable, registerBiometric } from '@/lib/webauthn'
import {
  clearBiometricSession,
  storeBiometricSession,
} from '@/lib/biometricSession'

export function SecuritySection() {
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

  return (
    <>
      <p className="small text-muted mb-3">
        Vantura locks automatically after a period of inactivity. With
        biometrics enabled, your device&apos;s biometric can unlock the app
        instead of your passphrase.
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
        <div className="alert alert-secondary small mb-3" role="status">
          Your browser or device does not support biometric authentication. A
          passphrase is required to unlock.
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
            onChange={(e) => handleBiometricToggle(e.target.checked)}
            className="mb-1"
          />
          <p className="small text-muted mb-3" style={{ marginLeft: 48 }}>
            Touch ID, Face ID, Windows Hello, or your device&apos;s biometric
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
  )
}
