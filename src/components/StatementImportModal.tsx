import { useState } from 'react'
import {
  Alert,
  Modal,
  Form,
  Button,
  Table,
  Spinner,
  Badge,
} from 'react-bootstrap'
import { formatMoney } from '@/lib/format'
import { getCategories } from '@/services/categories'
import {
  parsePdfStatement,
  parseCsvStatement,
  parseOfxStatement,
  findProfileForBank,
  saveStatementImportProfile,
  touchStatementImportProfile,
  tryKnownCsvProfiles,
  computeCsvMatchSignature,
  splitCsvLine,
  type StatementFormat,
  type ParsedStatement,
  type CsvColumnMap,
} from '@/services/statementParsing'
import {
  buildImportPreview,
  commitImport,
  type PreviewRow,
} from '@/services/creditCardImport'
import { saveMerchantCategoryRule } from '@/services/merchantCategoryRules'
import { toast } from '@/stores/toastStore'

interface StatementImportModalProps {
  accountId: string
  accountName: string
  onClose: () => void
  onImported: () => void
}

interface ReviewRowState {
  row: PreviewRow
  included: boolean
  categoryId: string
  remember: boolean
}

type ColumnRole =
  | 'ignore'
  | 'date'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'balance'
  | 'account'

const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  ignore: 'Ignore',
  date: 'Date',
  description: 'Description',
  amount: 'Amount (signed)',
  debit: 'Debit',
  credit: 'Credit',
  balance: 'Balance',
  account: 'Account (if present)',
}

interface PendingCsvProfile {
  bank_name_pattern: string
  csv_column_map: CsvColumnMap | null
  csv_has_header: boolean
  date_format: string
  csv_match_signature: string | null
}

function detectFormat(file: File): StatementFormat | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'PDF'
  if (name.endsWith('.csv')) return 'CSV'
  if (name.endsWith('.ofx') || name.endsWith('.qfx')) return 'OFX'
  return null
}

/** First word (minus a trailing "/1234" store-number suffix) plus a second
 * word if it looks like part of the merchant name, not a reference number. */
function deriveMerchantKeyword(description: string): string {
  const words = description.trim().split(/\s+/)
  const first = (words[0] ?? '').replace(/\/\d+$/, '')
  const second =
    words[1] && !/^\d+$/.test(words[1]) && words[1].length > 1 ? words[1] : ''
  return [first, second].filter(Boolean).join(' ')
}

/** Builds a CsvColumnMap from per-column role assignments, or null if the
 * required roles (Date, Description, and either Amount or Debit/Credit)
 * haven't all been assigned yet. Account is optional — mapping it lets the
 * multi-account guardrail run on manually-mapped layouts that carry one. */
function buildColumnMap(roles: ColumnRole[]): CsvColumnMap | null {
  const dateCol = roles.indexOf('date')
  const descriptionCol = roles.indexOf('description')
  if (dateCol === -1 || descriptionCol === -1) return null
  const amountCol = roles.indexOf('amount')
  const debitCol = roles.indexOf('debit')
  const creditCol = roles.indexOf('credit')
  const balanceCol = roles.indexOf('balance')
  const accountCol = roles.indexOf('account')
  if (amountCol === -1 && debitCol === -1 && creditCol === -1) return null
  return {
    dateCol,
    descriptionCol,
    amountCol: amountCol === -1 ? null : amountCol,
    debitCol: debitCol === -1 ? null : debitCol,
    creditCol: creditCol === -1 ? null : creditCol,
    balanceCol: balanceCol === -1 ? null : balanceCol,
    accountCol: accountCol === -1 ? null : accountCol,
  }
}

export function StatementImportModal({
  accountId,
  accountName,
  onClose,
  onImported,
}: StatementImportModalProps) {
  const [step, setStep] = useState<1 | 'map' | 2>(1)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [format, setFormat] = useState<StatementFormat | null>(null)
  const [detectedBankName, setDetectedBankName] = useState<string | null>(null)
  const [statedClosingBalance, setStatedClosingBalance] = useState('')
  const [reviewRows, setReviewRows] = useState<ReviewRowState[]>([])
  const [committing, setCommitting] = useState(false)
  const [matchedProfileId, setMatchedProfileId] = useState<number | null>(null)
  const [dateFormatAmbiguous, setDateFormatAmbiguous] = useState(false)

  // CSV manual column-mapping step — only populated when neither the
  // auto-sniff nor a saved profile could read the file.
  const [csvFileText, setCsvFileText] = useState('')
  const [mapColumns, setMapColumns] = useState<string[]>([])
  const [mapRoles, setMapRoles] = useState<ColumnRole[]>([])
  const [mapHasHeader, setMapHasHeader] = useState(true)
  const [mapDateFormat, setMapDateFormat] = useState<
    'DD/MM/YYYY' | 'MM/DD/YYYY'
  >('DD/MM/YYYY')
  const [mapBankName, setMapBankName] = useState('')

  // Set whenever this import used a manual mapping or a forced date-format
  // override, so a verified-correct commit can persist it as a reusable
  // profile — mirrors the PDF profile-save gate below.
  const [pendingCsvProfile, setPendingCsvProfile] =
    useState<PendingCsvProfile | null>(null)

  const categories = getCategories()

  const mapColumnMapping = step === 'map' ? buildColumnMap(mapRoles) : null
  const mapPreview: ParsedStatement | null = mapColumnMapping
    ? parseCsvStatement(csvFileText, {
        csv_column_map: mapColumnMapping,
        csv_has_header: mapHasHeader,
        date_format: mapDateFormat,
      })
    : null

  function applyParsed(
    parsed: ParsedStatement,
    fmt: StatementFormat,
    name: string,
    bankNameOverride?: string | null
  ) {
    const preview = buildImportPreview(accountId, parsed)
    setReviewRows(
      preview.rows.map((row) => ({
        row,
        included: !row.alreadyImported,
        categoryId: row.categoryId ?? '',
        remember: false,
      }))
    )
    setFileName(name)
    setFormat(fmt)
    setDetectedBankName(preview.detectedBankName ?? bankNameOverride ?? null)
    setStatedClosingBalance(
      preview.closingBalanceCents != null
        ? (preview.closingBalanceCents / 100).toFixed(2)
        : ''
    )
    setDateFormatAmbiguous(!!parsed.dateFormatAmbiguous)
    setStep(2)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fmt = detectFormat(file)
    if (!fmt) {
      setError('Unsupported file type. Upload a PDF, CSV, or OFX/QFX file.')
      return
    }
    setParsing(true)
    setError(null)
    setPendingCsvProfile(null)
    try {
      if (fmt === 'PDF') {
        // Bank name isn't known until after a first pass extracts it, so parse
        // once with defaults, then re-parse with the matching profile if found.
        const firstPass = await parsePdfStatement(file, null)
        const profile = firstPass.detectedBankName
          ? findProfileForBank(firstPass.detectedBankName, 'PDF')
          : null
        const parsed = profile
          ? await parsePdfStatement(file, profile)
          : firstPass
        // Record which profile matched, but don't mark it "used" yet — that
        // only happens on a real commit (see handleCommit), not on preview.
        setMatchedProfileId(profile?.id ?? null)

        if (parsed.rejectionReason) {
          setError(parsed.rejectionReason)
          return
        }
        if (parsed.rows.length === 0) {
          setError(
            'No transactions could be read from this file. It may use a layout Vantura doesn’t recognize yet.'
          )
          return
        }
        applyParsed(parsed, fmt, file.name)
        return
      }

      if (fmt === 'CSV') {
        const text = await file.text()
        setCsvFileText(text)

        // Checked before the plain default: a saved profile (including a
        // date-format-only correction from a prior "Redo as MM/DD/YYYY")
        // must win over the untouched default, or a correction the user
        // already confirmed once would never actually apply on repeat
        // imports of the same bank's statements. Safe to check
        // unconditionally because tryKnownCsvProfiles requires a structural
        // signature match, not just "some rows came out" (see there).
        const known = tryKnownCsvProfiles(text)
        if (known) {
          setMatchedProfileId(known.profile.id)
          applyParsed(known.parsed, fmt, file.name)
          return
        }

        const autoParsed = parseCsvStatement(text)
        if (autoParsed.rejectionReason) {
          setError(autoParsed.rejectionReason)
          return
        }
        if (autoParsed.rows.length > 0) {
          setMatchedProfileId(null)
          applyParsed(autoParsed, fmt, file.name)
          return
        }

        // Neither a saved profile nor auto-sniff could read this layout —
        // hand off to manual column mapping.
        const firstLine =
          text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
        const cols = splitCsvLine(firstLine)
        setMapColumns(cols)
        setMapRoles(cols.map(() => 'ignore'))
        // A first line that already looks like a date is almost certainly a
        // data row, not a header (e.g. CBA/NAB-style headerless exports).
        setMapHasHeader(!/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(firstLine))
        setMapDateFormat('DD/MM/YYYY')
        setMapBankName('')
        setMatchedProfileId(null)
        setFileName(file.name)
        setFormat(fmt)
        setStep('map')
        return
      }

      // OFX/QFX
      const parsed = parseOfxStatement(await file.text())
      setMatchedProfileId(null)
      if (parsed.rows.length === 0) {
        setError(
          'No transactions could be read from this file. It may use a layout Vantura doesn’t recognize yet.'
        )
        return
      }
      applyParsed(parsed, fmt, file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.')
    } finally {
      setParsing(false)
    }
  }

  function handleBackToUpload() {
    setStep(1)
    setError(null)
  }

  function handleMapContinue() {
    if (!mapColumnMapping) return
    const parsed = parseCsvStatement(csvFileText, {
      csv_column_map: mapColumnMapping,
      csv_has_header: mapHasHeader,
      date_format: mapDateFormat,
    })
    if (parsed.rejectionReason) {
      setError(parsed.rejectionReason)
      return
    }
    if (parsed.rows.length === 0) {
      setError(
        'This mapping didn’t produce any transactions — check the column roles and try again.'
      )
      return
    }
    setError(null)
    setPendingCsvProfile({
      bank_name_pattern: mapBankName.trim() || 'Custom format',
      csv_column_map: mapColumnMapping,
      csv_has_header: mapHasHeader,
      date_format: mapDateFormat,
      csv_match_signature: computeCsvMatchSignature(csvFileText, mapHasHeader),
    })
    applyParsed(parsed, 'CSV', fileName, mapBankName.trim() || null)
  }

  function handleRedoDateFormat() {
    const forced = parseCsvStatement(csvFileText, {
      csv_column_map: null,
      csv_has_header: null,
      date_format: 'MM/DD/YYYY',
    })
    if (forced.rows.length === 0) return
    setPendingCsvProfile({
      bank_name_pattern: 'Custom format',
      csv_column_map: null,
      // Unused by parseCsvStatement's auto-sniff path (only consulted when
      // csv_column_map is set); kept non-null only to satisfy the field type.
      csv_has_header: false,
      date_format: 'MM/DD/YYYY',
      // The auto-sniff path that got us here always treats the first line
      // as a header, regardless of the placeholder csv_has_header above —
      // see tryKnownCsvProfiles, which applies the same rule when matching.
      csv_match_signature: computeCsvMatchSignature(csvFileText, true),
    })
    applyParsed(forced, 'CSV', fileName)
  }

  function updateRow(id: string, patch: Partial<ReviewRowState>) {
    setReviewRows((rows) =>
      rows.map((r) => (r.row.id === id ? { ...r, ...patch } : r))
    )
  }

  const includedCount = reviewRows.filter((r) => r.included).length

  function handleCommit() {
    setCommitting(true)
    try {
      const statedCents = statedClosingBalance.trim()
        ? Math.round(parseFloat(statedClosingBalance) * 100)
        : null

      const result = commitImport(
        accountId,
        fileName,
        reviewRows.map((r) => ({
          row: r.row,
          included: r.included,
          categoryId: r.categoryId || null,
        })),
        statedCents
      )

      for (const r of reviewRows) {
        if (r.included && r.remember && r.categoryId) {
          saveMerchantCategoryRule(
            deriveMerchantKeyword(r.row.description),
            r.categoryId
          )
        }
      }

      // A profile is only "confirmed working" when the user actually entered
      // the statement's stated closing balance AND it matched what we
      // computed — an empty (optional) field is not evidence of correctness,
      // just an unverified import that happens to report no mismatch.
      const verifiedCorrect =
        statedCents != null && result.checksumMismatchCents == null

      if (matchedProfileId != null) {
        if (verifiedCorrect) touchStatementImportProfile(matchedProfileId)
      } else if (format === 'PDF' && detectedBankName && verifiedCorrect) {
        saveStatementImportProfile({
          bank_name_pattern: detectedBankName,
          format: 'PDF',
          date_field_preference: 'transaction',
          credit_marker: 'CR',
          opening_balance_label: 'Opening Balance',
          closing_balance_label: 'Closing Balance',
          date_format: 'DD/MM/YYYY',
          csv_column_map: null,
          csv_has_header: null,
          csv_match_signature: null,
        })
      } else if (format === 'CSV' && pendingCsvProfile && verifiedCorrect) {
        saveStatementImportProfile({
          bank_name_pattern: pendingCsvProfile.bank_name_pattern,
          format: 'CSV',
          date_field_preference: 'transaction',
          credit_marker: 'CR',
          opening_balance_label: 'Opening Balance',
          closing_balance_label: 'Closing Balance',
          date_format: pendingCsvProfile.date_format,
          csv_column_map: pendingCsvProfile.csv_column_map,
          csv_has_header: pendingCsvProfile.csv_has_header,
          csv_match_signature: pendingCsvProfile.csv_match_signature,
        })
      }

      if (result.checksumMismatchCents != null) {
        toast.error(
          `Imported ${result.insertedCount} transaction(s), but the computed balance is off by $${formatMoney(Math.abs(result.checksumMismatchCents))} from the statement’s stated closing balance — double-check the rows above.`
        )
      } else {
        toast.success(`Imported ${result.insertedCount} transaction(s).`)
      }
      onImported()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not commit this import.'
      )
    } finally {
      setCommitting(false)
    }
  }

  return (
    <Modal
      show
      onHide={onClose}
      centered
      size={step === 2 || step === 'map' ? 'xl' : undefined}
    >
      <Modal.Header closeButton>
        <Modal.Title>Import Statement — {accountName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {step === 1 && (
          <>
            <p className="text-muted small">
              Upload a PDF, CSV, or OFX/QFX statement export for this card.
              You’ll review every transaction before anything is saved.
            </p>
            <Form.Control
              type="file"
              accept=".pdf,.csv,.ofx,.qfx"
              onChange={handleFile}
              disabled={parsing}
            />
            {parsing && (
              <div className="mt-3 d-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" />
                <span className="text-muted small">Reading statement…</span>
              </div>
            )}
            {error && (
              <div className="alert alert-danger mt-3 small mb-0">{error}</div>
            )}
          </>
        )}

        {step === 'map' && (
          <>
            <div className="d-flex justify-content-between align-items-start mb-2">
              <p className="text-muted small mb-0">
                This file’s layout wasn’t recognized automatically. Tell us what
                each column means — Vantura will remember this for next time.
              </p>
              <Button
                variant="link"
                size="sm"
                className="text-nowrap p-0"
                onClick={handleBackToUpload}
              >
                Choose a different file
              </Button>
            </div>

            <div className="d-flex flex-wrap gap-4 align-items-end mb-3">
              <div style={{ maxWidth: 260 }}>
                <Form.Label className="small text-muted mb-1">
                  Bank name (for your reference)
                </Form.Label>
                <Form.Control
                  size="sm"
                  value={mapBankName}
                  onChange={(e) => setMapBankName(e.target.value)}
                  placeholder="e.g. CommBank"
                />
              </div>
              <Form.Check
                label="This file has a header row"
                checked={mapHasHeader}
                onChange={(e) => setMapHasHeader(e.target.checked)}
              />
              <div>
                <Form.Label className="small text-muted mb-1">
                  Date format
                </Form.Label>
                <Form.Select
                  size="sm"
                  style={{ width: 160 }}
                  value={mapDateFormat}
                  onChange={(e) =>
                    setMapDateFormat(
                      e.target.value as 'DD/MM/YYYY' | 'MM/DD/YYYY'
                    )
                  }
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                </Form.Select>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <Table size="sm" bordered>
                <thead>
                  <tr>
                    {mapColumns.map((_, i) => (
                      <th key={i}>
                        <Form.Select
                          size="sm"
                          value={mapRoles[i]}
                          onChange={(e) =>
                            setMapRoles((roles) =>
                              roles.map((r, idx) =>
                                idx === i ? (e.target.value as ColumnRole) : r
                              )
                            )
                          }
                        >
                          {(
                            Object.keys(COLUMN_ROLE_LABELS) as ColumnRole[]
                          ).map((role) => (
                            <option key={role} value={role}>
                              {COLUMN_ROLE_LABELS[role]}
                            </option>
                          ))}
                        </Form.Select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {mapColumns.map((val, i) => (
                      <td key={i} className="text-muted small text-nowrap">
                        {val || '—'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </Table>
            </div>

            {error && (
              <div className="alert alert-danger mt-2 small mb-3">{error}</div>
            )}

            <div className="mt-2">
              <p className="small text-muted mb-1">
                Preview
                {mapPreview && mapPreview.rows.length > 0
                  ? ` — first ${Math.min(3, mapPreview.rows.length)} of ${mapPreview.rows.length} row(s)`
                  : ''}
              </p>
              {mapPreview && mapPreview.rows.length > 0 ? (
                <Table size="sm" borderless className="mb-0">
                  <tbody>
                    {mapPreview.rows.slice(0, 3).map((r, i) => (
                      <tr key={i}>
                        <td className="text-nowrap">{r.date.slice(0, 10)}</td>
                        <td>{r.description}</td>
                        <td className="text-end text-nowrap">
                          {r.amountCents < 0 ? '-' : '+'}$
                          {formatMoney(Math.abs(r.amountCents))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : mapPreview?.rejectionReason ? (
                <p className="text-danger small mb-0">
                  {mapPreview.rejectionReason}
                </p>
              ) : (
                <p className="text-muted small mb-0">
                  No rows parsed yet — assign Date and Description (and Amount,
                  or Debit/Credit) to see a preview.
                </p>
              )}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="d-flex flex-wrap gap-3 align-items-center mb-3 small">
              {detectedBankName && (
                <Badge bg="secondary">{detectedBankName}</Badge>
              )}
              <span className="text-muted">
                {reviewRows.length} row(s) found — {includedCount} selected to
                import
              </span>
            </div>

            {dateFormatAmbiguous && (
              <Alert
                variant="warning"
                className="d-flex justify-content-between align-items-center small py-2"
              >
                <span>
                  Dates were read as day/month
                  {reviewRows[0] &&
                    ` (e.g. ${reviewRows[0].row.date.slice(0, 10)})`}
                  . If your bank uses month/day order instead:
                </span>
                <Button
                  size="sm"
                  variant="outline-dark"
                  className="text-nowrap ms-3"
                  onClick={handleRedoDateFormat}
                >
                  Redo as MM/DD/YYYY
                </Button>
              </Alert>
            )}

            <div className="mb-3" style={{ maxWidth: 260 }}>
              <Form.Label className="small text-muted mb-1">
                Statement’s closing balance (for the accuracy check)
              </Form.Label>
              <Form.Control
                type="number"
                step="0.01"
                size="sm"
                value={statedClosingBalance}
                onChange={(e) => setStatedClosingBalance(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              <Table size="sm" hover responsive>
                <thead>
                  <tr>
                    <th></th>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="text-end">Amount</th>
                    <th>Category</th>
                    <th>Remember</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewRows.map((r) => (
                    <tr
                      key={r.row.id}
                      className={!r.included ? 'text-muted' : ''}
                    >
                      <td>
                        <Form.Check
                          checked={r.included}
                          onChange={(e) =>
                            updateRow(r.row.id, {
                              included: e.target.checked,
                            })
                          }
                        />
                      </td>
                      <td className="text-nowrap">{r.row.date.slice(0, 10)}</td>
                      <td>
                        {r.row.description}
                        {r.row.alreadyImported && (
                          <Badge bg="warning" text="dark" className="ms-2">
                            already imported
                          </Badge>
                        )}
                      </td>
                      <td className="text-end text-nowrap">
                        {r.row.amountCents < 0 ? '-' : '+'}$
                        {formatMoney(Math.abs(r.row.amountCents))}
                      </td>
                      <td>
                        <Form.Select
                          size="sm"
                          value={r.categoryId}
                          onChange={(e) =>
                            updateRow(r.row.id, {
                              categoryId: e.target.value,
                            })
                          }
                          disabled={!r.included}
                        >
                          <option value="">No category</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Form.Select>
                        {r.row.autoMatchedRuleId != null && (
                          <div
                            className="text-success"
                            style={{ fontSize: '0.7rem' }}
                          >
                            auto-categorized
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        <Form.Check
                          checked={r.remember}
                          disabled={!r.included || !r.categoryId}
                          onChange={(e) =>
                            updateRow(r.row.id, { remember: e.target.checked })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={committing}>
          Cancel
        </Button>
        {step === 'map' && (
          <Button
            variant="primary"
            onClick={handleMapContinue}
            disabled={
              !mapColumnMapping || !mapPreview || mapPreview.rows.length === 0
            }
          >
            Continue
          </Button>
        )}
        {step === 2 && (
          <Button
            variant="primary"
            onClick={handleCommit}
            disabled={committing || includedCount === 0}
          >
            {committing ? (
              <Spinner animation="border" size="sm" />
            ) : (
              `Import ${includedCount} transaction(s)`
            )}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
