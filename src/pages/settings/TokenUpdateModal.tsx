import { useState } from 'react'
import { Button, Modal, Form, Spinner } from 'react-bootstrap'
import { getAppSetting, setAppSetting } from '@/db'
import { toast } from '@/stores/toastStore'
import { sessionStore } from '@/stores/sessionStore'
import {
  deriveKeyFromPassphrase,
  decryptToken,
  encryptToken,
} from '@/lib/crypto'
import { validateUpBankToken } from '@/api/upBank'
import {
  storeBiometricSession,
  hasBiometricSession,
} from '@/lib/biometricSession'

interface TokenUpdateModalProps {
  /** Refreshes the "Last synced" display owned by the re-sync section, after rotation. */
  refreshLastSync: () => void
}

export function TokenUpdateModal({ refreshLastSync }: TokenUpdateModalProps) {
  const [show, setShow] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [newToken, setNewToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  function close() {
    if (!loading) {
      setShow(false)
      setPassphrase('')
      setNewToken('')
      setError(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmedPassphrase = passphrase.trim()
    const trimmedToken = newToken.trim()
    if (!trimmedPassphrase || !trimmedToken) {
      setError('Please enter your passphrase and new Personal Access Token.')
      return
    }
    setLoading(true)
    try {
      const salt = getAppSetting('encryption_salt')
      const encrypted = getAppSetting('api_token_encrypted')
      if (!salt || !encrypted) {
        setError('No stored credentials. Please complete onboarding first.')
        setLoading(false)
        return
      }
      const key = await deriveKeyFromPassphrase(trimmedPassphrase, salt)
      await decryptToken(encrypted, key)
      const valid = await validateUpBankToken(trimmedToken)
      if (!valid) {
        setError('Invalid Personal Access Token. Please check and try again.')
        setLoading(false)
        return
      }
      const newEncrypted = await encryptToken(trimmedToken, key)
      setAppSetting('api_token_encrypted', newEncrypted)
      sessionStore.getState().setUnlocked(trimmedToken)
      // Keep the cached biometric-unlock session in sync so a rotated-out
      // token can't be restored via a fingerprint unlock later.
      if (hasBiometricSession()) await storeBiometricSession(trimmedToken)
      setPassphrase('')
      setNewToken('')
      setError(null)
      setShow(false)
      setSuccess(true)
      toast.success('Personal Access Token updated.')
      refreshLastSync()
      setTimeout(() => setSuccess(false), 5000)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid passphrase or failed to update token.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-4">
      <h6 className="text-muted mb-2">Personal Access Token</h6>
      <p className="small text-muted mb-2">
        If your token has expired (e.g. 48-hour token from Up Bank), update it
        here. Your passphrase is required; other data is not deleted.
      </p>
      <Button
        variant="outline-primary"
        size="sm"
        onClick={() => {
          setError(null)
          setShow(true)
        }}
        aria-label="Update Personal Access Token"
      >
        Update Personal Access Token
      </Button>
      {success && (
        <span className="d-block mt-2 text-success small" role="status">
          Personal Access Token updated. You can re-sync now.
        </span>
      )}

      <Modal
        show={show}
        onHide={close}
        aria-labelledby="update-token-modal-title"
        aria-describedby="update-token-modal-description"
        centered
      >
        <Modal.Header closeButton={!loading}>
          <Modal.Title id="update-token-modal-title">
            Update Personal Access Token
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
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
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter passphrase"
                autoComplete="current-password"
                disabled={loading}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="update-token-new">
                New Personal Access Token
              </Form.Label>
              <Form.Control
                id="update-token-new"
                type="password"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                placeholder="Paste new token from Up Bank app"
                autoComplete="off"
                disabled={loading}
              />
            </Form.Group>
            {error && (
              <div className="text-danger small mb-2" role="alert">
                {error}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              type="button"
              variant="secondary"
              onClick={close}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="btn-gradient-primary"
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? (
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
