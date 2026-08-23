import { useState } from 'react'
import { Button, Modal, Spinner } from 'react-bootstrap'
import { getAppSetting, deleteDatabase } from '@/db'
import { toast } from '@/stores/toastStore'
import { sessionStore } from '@/stores/sessionStore'
import { formatSyncProgressMessage } from '@/services/sync'
import { useFullReSync } from '@/hooks/useFullReSync'
import { clearBiometricSession } from '@/lib/biometricSession'
import { TokenUpdateModal } from './TokenUpdateModal'
import { ExportProfileModal } from './ExportProfileModal'
import { ImportProfileModal } from './ImportProfileModal'

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

export function DataSection() {
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

  const isDemoMode = getAppSetting('demo_mode') === '1'

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

  return (
    <>
      {isDemoMode && (
        <div
          className="alert alert-info mb-4"
          role="status"
          id="settings-demo-banner"
        >
          You&apos;re using sample data. Clear all data below to connect your
          real Up Bank account.
        </div>
      )}
      <div className="mb-4">
        <h6 className="text-muted mb-2">Re-sync with Up Bank</h6>
        <p className="small text-muted mb-2">
          Sync downloads your Up Bank transactions to this device only. No cloud
          storage is used; we don&apos;t have servers that store your data.
        </p>
        <p className="small text-muted mb-2">
          Re-syncs all transactions, including category changes made in the Up
          Bank app.
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
          <span className="d-block mt-2 text-danger small" role="alert">
            {syncError}
          </span>
        )}
      </div>

      <hr className="my-4" />

      {!isDemoMode && <TokenUpdateModal refreshLastSync={refreshLastSync} />}

      {!isDemoMode && <hr className="my-4" />}

      <h6 className="text-muted mb-3">Transfer settings</h6>

      <ExportProfileModal />
      <ImportProfileModal />

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
        <p className="small fw-semibold text-body mb-1">Clear all data</p>
        <p className="small text-muted mb-3">
          Permanently delete all local data. You will need to re-enter your
          passphrase and Personal Access Token (re-onboard). This cannot be
          undone.
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
    </>
  )
}
