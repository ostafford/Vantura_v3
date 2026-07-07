import { useState } from 'react'
import { Modal, Form, Button, Table, Spinner, Badge } from 'react-bootstrap'
import { formatMoney } from '@/lib/format'
import { getCategories } from '@/services/categories'
import {
  parsePdfStatement,
  parseCsvStatement,
  parseOfxStatement,
  findProfileForBank,
  saveStatementImportProfile,
  touchStatementImportProfile,
  type StatementFormat,
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

export function StatementImportModal({
  accountId,
  accountName,
  onClose,
  onImported,
}: StatementImportModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [format, setFormat] = useState<StatementFormat | null>(null)
  const [detectedBankName, setDetectedBankName] = useState<string | null>(null)
  const [statedClosingBalance, setStatedClosingBalance] = useState('')
  const [reviewRows, setReviewRows] = useState<ReviewRowState[]>([])
  const [committing, setCommitting] = useState(false)
  const [matchedProfileId, setMatchedProfileId] = useState<number | null>(null)

  const categories = getCategories()

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
    try {
      let parsed
      if (fmt === 'PDF') {
        // Bank name isn't known until after a first pass extracts it, so parse
        // once with defaults, then re-parse with the matching profile if found.
        const firstPass = await parsePdfStatement(file, null)
        const profile = firstPass.detectedBankName
          ? findProfileForBank(firstPass.detectedBankName, 'PDF')
          : null
        parsed = profile ? await parsePdfStatement(file, profile) : firstPass
        // Record which profile matched, but don't mark it "used" yet — that
        // only happens on a real commit (see handleCommit), not on preview.
        setMatchedProfileId(profile?.id ?? null)
      } else if (fmt === 'CSV') {
        parsed = parseCsvStatement(await file.text())
      } else {
        parsed = parseOfxStatement(await file.text())
      }

      if (parsed.rejectionReason) {
        setError(parsed.rejectionReason)
        setParsing(false)
        return
      }

      if (parsed.rows.length === 0) {
        setError(
          'No transactions could be read from this file. It may use a layout Vantura doesn’t recognize yet.'
        )
        setParsing(false)
        return
      }

      const preview = buildImportPreview(accountId, parsed)
      setReviewRows(
        preview.rows.map((row) => ({
          row,
          included: !row.alreadyImported,
          categoryId: row.categoryId ?? '',
          remember: false,
        }))
      )
      setFileName(file.name)
      setFormat(fmt)
      setDetectedBankName(preview.detectedBankName)
      setStatedClosingBalance(
        preview.closingBalanceCents != null
          ? (preview.closingBalanceCents / 100).toFixed(2)
          : ''
      )
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this file.')
    } finally {
      setParsing(false)
    }
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
    <Modal show onHide={onClose} centered size={step === 2 ? 'xl' : undefined}>
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
