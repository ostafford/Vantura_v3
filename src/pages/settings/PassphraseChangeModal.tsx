import { useState } from 'react'
import { Button, Modal, Form, Spinner } from 'react-bootstrap'
import { getAppSetting, setAppSetting } from '@/db'
import { toast } from '@/stores/toastStore'
import { reEncryptSecret, PASSPHRASE_MIN_LENGTH } from '@/lib/crypto'
import {
  storeBiometricSession,
  hasBiometricSession,
} from '@/lib/biometricSession'

/**
 * #33 — change the unlock passphrase. Mirrors the Personal Access Token update:
 * it requires the *current* passphrase (decrypting the stored token verifies
 * it), so there is no new attack surface. No "forgot passphrase" path — that is
 * still Clear-all-data by design.
 */
export function PassphraseChangeModal() {
  const [show, setShow] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function close() {
    if (loading) return
    setShow(false)
    setCurrent('')
    setNext('')
    setConfirm('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!current || !next) {
      setError('Please fill in every field.')
      return
    }
    if (next.length < PASSPHRASE_MIN_LENGTH) {
      setError(
        `New passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters.`
      )
      return
    }
    if (next !== confirm) {
      setError('New passphrases do not match.')
      return
    }
    if (next === current) {
      setError('New passphrase must be different from the current one.')
      return
    }

    const salt = getAppSetting('encryption_salt')
    const encrypted = getAppSetting('api_token_encrypted')
    if (!salt || !encrypted) {
      setError('No stored credentials. Please complete onboarding first.')
      return
    }

    setLoading(true)
    try {
      const {
        salt: newSalt,
        ciphertext: newEncrypted,
        plaintext: token,
      } = await reEncryptSecret(encrypted, salt, current, next)
      setAppSetting('encryption_salt', newSalt)
      setAppSetting('api_token_encrypted', newEncrypted)
      // Re-cache the biometric session so a later fingerprint unlock isn't tied
      // to state derived from the old passphrase.
      if (hasBiometricSession()) await storeBiometricSession(token)
      toast.success('Passphrase changed.')
      close()
    } catch {
      // A wrong current passphrase surfaces here as an AES-GCM decrypt failure.
      setError(
        'Could not change passphrase — check that your current passphrase is correct.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-4">
      <h6 className="text-muted mb-2">Passphrase</h6>
      <p className="small text-muted mb-2">
        Change the passphrase that unlocks Vantura. You&apos;ll need your
        current one. There is no recovery if you forget it — Clear all data is
        the only way back.
      </p>
      <Button
        variant="outline-secondary"
        size="sm"
        onClick={() => {
          setError(null)
          setShow(true)
        }}
        aria-label="Change passphrase"
      >
        Change passphrase
      </Button>

      <Modal
        show={show}
        onHide={close}
        aria-labelledby="change-passphrase-modal-title"
        centered
      >
        <Modal.Header closeButton={!loading}>
          <Modal.Title id="change-passphrase-modal-title">
            Change passphrase
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="change-passphrase-current">
                Current passphrase
              </Form.Label>
              <Form.Control
                id="change-passphrase-current"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="change-passphrase-new">
                New passphrase
              </Form.Label>
              <Form.Control
                id="change-passphrase-new"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder={`At least ${PASSPHRASE_MIN_LENGTH} characters`}
                autoComplete="new-password"
                minLength={PASSPHRASE_MIN_LENGTH}
                disabled={loading}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="change-passphrase-confirm">
                Confirm new passphrase
              </Form.Label>
              <Form.Control
                id="change-passphrase-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
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
                  Changing…
                </>
              ) : (
                'Change passphrase'
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  )
}
