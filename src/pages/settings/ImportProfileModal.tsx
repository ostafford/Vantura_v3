import { useState } from 'react'
import { Button, Modal, Form, Spinner } from 'react-bootstrap'
import { toast } from '@/stores/toastStore'
import {
  previewImportProfile,
  importPayloadWithOptions,
  buildExportPayload,
  type ExportPayload,
  type TrackerExportRow,
  type UpcomingChargeExportRow,
  type BudgetBucketExportRow,
  type BudgetHypotheticalExportRow,
  type ManualAccountExportRow,
  type ImportOptions,
} from '@/services/profileExport'
import { getPaydayDayLabel } from '@/lib/payday'
import { classifyImportError } from './importErrorClassification'

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

function formatNetWorthSummary(
  accounts: ManualAccountExportRow[] | undefined
): string {
  if (!Array.isArray(accounts) || accounts.length === 0) return 'None'
  const names = accounts.slice(0, 3).map((a) => a.name)
  const more = accounts.length > 3 ? ` +${accounts.length - 3} more` : ''
  return `${accounts.length} manual account${accounts.length !== 1 ? 's' : ''} (${names.join(', ')}${more})`
}

export function ImportProfileModal() {
  const [show, setShow] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<'file' | 'passphrase' | null>(
    null
  )
  const [importing, setImporting] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [preview, setPreview] = useState<ExportPayload | null>(null)
  const [options, setOptions] = useState<ImportOptions>({
    settings: true,
    trackers: true,
    upcomingCharges: true,
    budgetPlan: true,
    netWorth: true,
  })

  function close() {
    if (!importing) {
      setShow(false)
      setFile(null)
      setPassphrase('')
      setError(null)
      setErrorField(null)
      setStep(1)
      setPreview(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setErrorField(null)
    if (!file) {
      setError('Please choose a settings file.')
      setErrorField('file')
      return
    }
    if (!passphrase.trim()) {
      setError('Please enter the passphrase used when exporting.')
      setErrorField('passphrase')
      return
    }
    setImporting(true)
    try {
      const payload = await previewImportProfile(file, passphrase.trim())
      setPreview(payload)
      setOptions({
        settings: true,
        trackers: true,
        upcomingCharges: true,
        budgetPlan: true,
        // Pre-v5 files carry no Net Worth section; only offer it (and only
        // let it run) when the file actually contains one, so a replace-all
        // can't wipe local manual accounts from an old export.
        netWorth: payload.manualAccounts !== undefined,
      })
      setStep(2)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Import failed. Please try again.'
      setError(msg)
      setErrorField(classifyImportError(msg))
    } finally {
      setImporting(false)
    }
  }

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!preview) return
    setImporting(true)
    try {
      importPayloadWithOptions(preview, options)
      setPreview(null)
      setStep(1)
      setFile(null)
      setPassphrase('')
      setShow(false)
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

  function handleBack() {
    setStep(1)
    setPreview(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    setError(null)
    setErrorField(null)
  }

  function handlePassphraseChange(value: string) {
    setPassphrase(value)
    if (errorField === 'passphrase') {
      setError(null)
      setErrorField(null)
    }
  }

  return (
    <div className="mb-4">
      <p className="small fw-semibold text-body mb-1">Import profile</p>
      <p className="small text-muted mb-2">
        Imports appearance and configuration into this browser. Does not import
        transactions or API tokens. Use to restore your setup on a new device.
      </p>
      <Button
        variant="outline-primary"
        size="sm"
        onClick={() => {
          setError(null)
          setShow(true)
        }}
        aria-label="Import settings from file"
      >
        Choose settings file
      </Button>

      <Modal
        show={show}
        onHide={close}
        aria-labelledby="import-modal-title"
        aria-describedby="import-modal-description"
        centered
      >
        <Modal.Header closeButton={!importing}>
          <Modal.Title id="import-modal-title">
            Import profile settings
          </Modal.Title>
        </Modal.Header>
        {step === 1 ? (
          <Form onSubmit={handleSubmit}>
            <Modal.Body id="import-modal-description">
              <p className="small text-muted mb-3">
                Imports settings, trackers, upcoming charges, budget plan, and
                Net Worth manual accounts into this device. Will not import
                transactions or API tokens.
              </p>
              <Form.Group className="mb-3">
                <Form.Label>Settings file</Form.Label>
                <Form.Control
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  disabled={importing}
                  aria-label="Choose settings file"
                  aria-invalid={errorField === 'file'}
                  aria-errormessage={
                    errorField === 'file' ? 'import-file-error' : undefined
                  }
                />
                {file && (
                  <Form.Text className="text-muted">
                    Selected: {file.name}
                  </Form.Text>
                )}
                {error && errorField === 'file' && (
                  <div
                    id="import-file-error"
                    className="text-danger small mt-1"
                    role="alert"
                  >
                    {error}
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
                  value={passphrase}
                  onChange={(e) => handlePassphraseChange(e.target.value)}
                  placeholder="Enter passphrase"
                  autoComplete="current-password"
                  disabled={importing}
                  aria-invalid={errorField === 'passphrase'}
                  aria-errormessage={
                    errorField === 'passphrase'
                      ? 'import-passphrase-error'
                      : undefined
                  }
                />
                <Form.Text className="text-muted d-block mt-1">
                  If the passphrase or file is incorrect, we&apos;ll show an
                  error here and nothing will be changed.
                </Form.Text>
                {error && errorField === 'passphrase' && (
                  <div
                    id="import-passphrase-error"
                    className="text-danger small mt-1"
                    role="alert"
                  >
                    {error}
                  </div>
                )}
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button
                type="button"
                variant="secondary"
                onClick={close}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="btn-gradient-primary"
                disabled={importing || !file}
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
          <Form onSubmit={handleConfirm}>
            <Modal.Body id="import-modal-description">
              <p className="small text-muted mb-3">
                Choose which sections to import. Each selected section fully
                replaces the existing data on this device — importing Net Worth
                removes any manual account that isn't in the file — while
                unselected sections are left unchanged. If you import Trackers
                or Upcoming charges without importing Budget Plan, those items
                will lose their bucket assignments.
              </p>
              {preview &&
                (() => {
                  const current = buildExportPayload()
                  return (
                    <div className="mb-3">
                      <div className="mb-2">
                        <Form.Check
                          type="checkbox"
                          id="import-opt-settings"
                          label="Settings and appearance"
                          checked={options.settings}
                          onChange={(e) =>
                            setOptions((o) => ({
                              ...o,
                              settings: e.target.checked,
                            }))
                          }
                          aria-label="Import settings and appearance"
                        />
                        <div className="small text-muted ms-4 mt-1">
                          Current: {formatSettingsSummary(current.settings)}
                          {' → '}
                          New: {formatSettingsSummary(preview.settings ?? {})}
                        </div>
                      </div>
                      <div className="mb-2">
                        <Form.Check
                          type="checkbox"
                          id="import-opt-trackers"
                          label="Trackers"
                          checked={options.trackers}
                          onChange={(e) =>
                            setOptions((o) => ({
                              ...o,
                              trackers: e.target.checked,
                            }))
                          }
                          aria-label="Import trackers"
                        />
                        <div className="small text-muted ms-4 mt-1">
                          Current: {formatTrackersSummary(current.trackers)}
                          {' → '}
                          New: {formatTrackersSummary(preview.trackers ?? [])}
                        </div>
                      </div>
                      <div className="mb-2">
                        <Form.Check
                          type="checkbox"
                          id="import-opt-upcoming"
                          label="Upcoming charges"
                          checked={options.upcomingCharges}
                          onChange={(e) =>
                            setOptions((o) => ({
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
                          {formatUpcomingSummary(preview.upcomingCharges ?? [])}
                        </div>
                      </div>
                      <div className={preview.manualAccounts ? 'mb-2' : ''}>
                        <Form.Check
                          type="checkbox"
                          id="import-opt-budget-plan"
                          label="Budget Plan (buckets & hypotheticals)"
                          checked={options.budgetPlan}
                          onChange={(e) =>
                            setOptions((o) => ({
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
                            preview.budgetBuckets ?? [],
                            preview.budgetHypotheticals ?? []
                          )}
                        </div>
                      </div>
                      {preview.manualAccounts !== undefined && (
                        <div>
                          <Form.Check
                            type="checkbox"
                            id="import-opt-net-worth"
                            label="Net Worth (manual accounts & history)"
                            checked={options.netWorth}
                            onChange={(e) =>
                              setOptions((o) => ({
                                ...o,
                                netWorth: e.target.checked,
                              }))
                            }
                            aria-label="Import Net Worth manual accounts and history"
                          />
                          <div className="small text-muted ms-4 mt-1">
                            Current:{' '}
                            {formatNetWorthSummary(current.manualAccounts)}
                            {' → '}
                            New: {formatNetWorthSummary(preview.manualAccounts)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
            </Modal.Body>
            <Modal.Footer>
              <Button
                type="button"
                variant="secondary"
                onClick={handleBack}
                disabled={importing}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="btn-gradient-primary"
                disabled={
                  importing ||
                  !preview ||
                  (!options.settings &&
                    !options.trackers &&
                    !options.upcomingCharges &&
                    !options.budgetPlan &&
                    !options.netWorth)
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
