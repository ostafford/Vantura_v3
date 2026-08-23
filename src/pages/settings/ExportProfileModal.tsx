import { useState } from 'react'
import { Button, Modal, Form, Spinner } from 'react-bootstrap'
import { toast } from '@/stores/toastStore'
import { exportProfile } from '@/services/profileExport'

export function ExportProfileModal() {
  const [show, setShow] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  function close() {
    if (!exporting) {
      setShow(false)
      setPassphrase('')
      setPassphraseConfirm('')
      setError(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = passphrase.trim()
    const confirmVal = passphraseConfirm.trim()
    if (!trimmed) {
      setError('Please enter a passphrase.')
      return
    }
    if (trimmed !== confirmVal) {
      setError('Passphrases do not match.')
      return
    }
    setExporting(true)
    try {
      await exportProfile(trimmed)
      setPassphrase('')
      setPassphraseConfirm('')
      setError(null)
      setShow(false)
      toast.success('Settings exported. Save the file securely.')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Export failed. Please try again.'
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mb-4">
      <p className="small fw-semibold text-body mb-1">Export profile</p>
      <p className="small text-muted mb-2">
        Exports appearance and configuration (theme, payday setup, notification
        preferences, trackers, upcoming charges, and budget plan). Does not
        export bank transactions, account numbers, or API tokens. The file is
        encrypted with the passphrase you choose.
      </p>
      <Button
        variant="outline-primary"
        size="sm"
        onClick={() => {
          setError(null)
          setShow(true)
        }}
        aria-label="Export settings to file"
      >
        Export settings to file
      </Button>

      <Modal
        show={show}
        onHide={close}
        aria-labelledby="export-modal-title"
        aria-describedby="export-modal-description"
        centered
      >
        <Modal.Header closeButton={!exporting}>
          <Modal.Title id="export-modal-title">
            Export settings to file
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
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
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
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
                value={passphraseConfirm}
                onChange={(e) => setPassphraseConfirm(e.target.value)}
                placeholder="Confirm passphrase"
                autoComplete="new-password"
                disabled={exporting}
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
    </div>
  )
}
