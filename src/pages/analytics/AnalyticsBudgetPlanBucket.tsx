import { useState, useMemo, useCallback } from 'react'
import { useStore } from 'zustand'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Row, Col, Button, Modal, Form, Badge } from 'react-bootstrap'
import {
  getBucket,
  getBucketItems,
  getBucketTotalCents,
  getBuckets,
  assignUpcomingToBucket,
  getUnassignedUpcoming,
  type BudgetBucketRow,
  type BucketUpcomingItem,
} from '@/services/budgetBuckets'
import { createUpcomingCharge } from '@/services/upcoming'
import {
  getVariableLines,
  getHypotheticalLines,
  createBudgetLine,
  updateBudgetLine,
  deleteBudgetLine,
  type BudgetLineRow,
} from '@/services/budgetHypotheticals'
import {
  getBucketAnchors,
  pinTransactionToBucket,
  unpinAnchor,
  searchRecentDebits,
  type BucketAnchorItem,
  type AnchorDebitRow,
} from '@/services/budgetTransactionAnchors'
import {
  toPeriodCents,
  type BudgetDisplayPeriod,
} from '@/lib/monthlyEquivalent'
import { formatMoney, formatShortDate } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import { syncStore } from '@/stores/syncStore'
import {
  bucketColourHex,
  BUDGET_FREQUENCIES,
  BUDGET_DISPLAY_PERIODS,
} from '@/lib/budgetBucketMeta'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function frequencyLabel(frequency: string): string {
  switch (frequency) {
    case 'WEEKLY':
      return 'Weekly'
    case 'FORTNIGHTLY':
      return 'Fortnightly'
    case 'MONTHLY':
      return 'Monthly'
    case 'QUARTERLY':
      return 'Quarterly'
    case 'YEARLY':
      return 'Yearly'
    case 'ONCE':
      return 'Once'
    default:
      return frequency
  }
}

// ─── Add budget line modal ────────────────────────────────────────────────────

interface AddBudgetLineModalProps {
  show: boolean
  bucketId: number
  isHypothetical: boolean
  onClose: () => void
  onSaved: () => void
}

function AddBudgetLineModal({
  show,
  bucketId,
  isHypothetical,
  onClose,
  onSaved,
}: AddBudgetLineModalProps) {
  const [name, setName] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [frequency, setFrequency] = useState('MONTHLY')

  useMemo(() => {
    if (show) {
      setName('')
      setAmountStr('')
      setFrequency('MONTHLY')
    }
  }, [show])

  function handleSave() {
    const trimmed = name.trim()
    const dollars = parseFloat(amountStr)
    if (!trimmed || Number.isNaN(dollars) || dollars <= 0) return
    createBudgetLine(
      bucketId,
      trimmed,
      Math.round(dollars * 100),
      frequency,
      isHypothetical
    )
    toast.success(isHypothetical ? 'Hypothetical added' : 'Variable item added')
    onSaved()
    onClose()
  }

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          {isHypothetical ? 'Add hypothetical item' : 'Add variable item'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isHypothetical ? (
          <p className="text-muted small mb-3">
            Test affordability — kept separate from real expenses so you can
            remove it any time.
          </p>
        ) : (
          <p className="text-muted small mb-3">
            Estimate a recurring variable expense (e.g. Groceries, Petrol).
            Contributes to bucket total.
          </p>
        )}
        <Form.Group className="mb-3">
          <Form.Label>Name</Form.Label>
          <Form.Control
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              isHypothetical ? 'e.g. New apartment' : 'e.g. Groceries'
            }
            autoFocus
            maxLength={80}
          />
        </Form.Group>
        <Row className="g-3">
          <Col xs={6}>
            <Form.Group>
              <Form.Label>Amount ($)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="0.01"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
              />
            </Form.Group>
          </Col>
          <Col xs={6}>
            <Form.Group>
              <Form.Label>Frequency</Form.Label>
              <Form.Select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                {BUDGET_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={
            !name.trim() ||
            !amountStr ||
            Number.isNaN(parseFloat(amountStr)) ||
            parseFloat(amountStr) <= 0
          }
        >
          Add item
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

// ─── Edit budget line modal ───────────────────────────────────────────────────

interface EditBudgetLineModalProps {
  line: BudgetLineRow | null
  onClose: () => void
  onSaved: () => void
}

function EditBudgetLineModal({
  line,
  onClose,
  onSaved,
}: EditBudgetLineModalProps) {
  const [name, setName] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [frequency, setFrequency] = useState('MONTHLY')

  useMemo(() => {
    if (line) {
      setName(line.name)
      setAmountStr((line.amount_cents / 100).toFixed(2))
      setFrequency(line.frequency)
    }
  }, [line])

  function handleSave() {
    if (!line) return
    const trimmed = name.trim()
    const dollars = parseFloat(amountStr)
    if (!trimmed || Number.isNaN(dollars) || dollars <= 0) return
    updateBudgetLine(line.id, trimmed, Math.round(dollars * 100), frequency)
    toast.success('Item updated')
    onSaved()
    onClose()
  }

  return (
    <Modal show={!!line} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          {line?.is_hypothetical ? 'Edit hypothetical' : 'Edit variable item'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Name</Form.Label>
          <Form.Control
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
          />
        </Form.Group>
        <Row className="g-3">
          <Col xs={6}>
            <Form.Group>
              <Form.Label>Amount ($)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="0.01"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
              />
            </Form.Group>
          </Col>
          <Col xs={6}>
            <Form.Group>
              <Form.Label>Frequency</Form.Label>
              <Form.Select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                {BUDGET_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={
            !name.trim() ||
            !amountStr ||
            Number.isNaN(parseFloat(amountStr)) ||
            parseFloat(amountStr) <= 0
          }
        >
          Save changes
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

// ─── Add to fixed payments modal ─────────────────────────────────────────────

interface AddToFixedPaymentsModalProps {
  show: boolean
  bucketId: number
  onClose: () => void
  onSaved: () => void
}

function AddToFixedPaymentsModal({
  show,
  bucketId,
  onClose,
  onSaved,
}: AddToFixedPaymentsModalProps) {
  // Step: 'pick' = choose source, 'configure' = set frequency+date for tx-based creation
  const [step, setStep] = useState<'pick' | 'configure'>('pick')
  const [txSearch, setTxSearch] = useState('')
  const [selectedTx, setSelectedTx] = useState<AnchorDebitRow | null>(null)
  const [frequency, setFrequency] = useState('MONTHLY')
  const [nextChargeDate, setNextChargeDate] = useState('')

  useMemo(() => {
    if (show) {
      setStep('pick')
      setTxSearch('')
      setSelectedTx(null)
      setFrequency('MONTHLY')
      const d = new Date()
      setNextChargeDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      )
    }
  }, [show])

  const unassigned = useMemo(
    () => getUnassignedUpcoming(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show]
  )

  const txResults = useMemo(() => searchRecentDebits(txSearch, 40), [txSearch])

  function handleAssignExisting(charge: BucketUpcomingItem) {
    assignUpcomingToBucket(charge.id, bucketId)
    toast.success(`"${charge.name}" added to Fixed payments`)
    onSaved()
    onClose()
  }

  function handleSelectTx(tx: AnchorDebitRow) {
    setSelectedTx(tx)
    setStep('configure')
  }

  function handleCreateAndAssign() {
    if (!selectedTx) return
    const amountCents = selectedTx.amount
    const newId = createUpcomingCharge(
      selectedTx.description,
      amountCents,
      frequency,
      nextChargeDate,
      null,
      true,
      null,
      false,
      null
    )
    assignUpcomingToBucket(newId, bucketId)
    toast.success(`"${selectedTx.description}" added as upcoming charge`)
    onSaved()
    onClose()
  }

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {step === 'configure'
            ? 'Set charge details'
            : 'Add to Fixed payments'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {step === 'configure' && selectedTx ? (
          <>
            <div
              className="p-2 mb-3 rounded"
              style={{ background: 'var(--bs-tertiary-bg)' }}
            >
              <div className="fw-medium">{selectedTx.description}</div>
              <div className="text-muted small">
                ${formatMoney(selectedTx.amount)} ·{' '}
                {formatShortDate(selectedTx.date)}
              </div>
            </div>
            <Row className="g-3">
              <Col xs={6}>
                <Form.Group>
                  <Form.Label>Frequency</Form.Label>
                  <Form.Select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                  >
                    {BUDGET_FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col xs={6}>
                <Form.Group>
                  <Form.Label>Next charge date</Form.Label>
                  <Form.Control
                    type="date"
                    value={nextChargeDate}
                    onChange={(e) => setNextChargeDate(e.target.value)}
                  />
                </Form.Group>
              </Col>
            </Row>
            <p className="text-muted small mt-3 mb-0">
              This will create a new upcoming charge using the transaction's
              description and amount, then assign it to this bucket.
            </p>
          </>
        ) : (
          <>
            {/* Existing upcoming charges */}
            {unassigned.length > 0 && (
              <div className="mb-4">
                <div
                  className="fw-semibold small text-muted mb-2 text-uppercase"
                  style={{ letterSpacing: '0.05em' }}
                >
                  Your upcoming charges
                </div>
                <div className="d-flex flex-column gap-1">
                  {unassigned.map((c) => (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      className="d-flex align-items-center justify-content-between px-3 py-2 rounded"
                      style={{
                        cursor: 'pointer',
                        border: '1px solid var(--bs-border-color)',
                      }}
                      onClick={() => handleAssignExisting(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAssignExisting(c)
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          'var(--bs-tertiary-bg)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = ''
                      }}
                    >
                      <div>
                        <div className="fw-medium">{c.name}</div>
                        <div className="text-muted small">
                          {c.frequency.charAt(0) +
                            c.frequency.slice(1).toLowerCase()}
                        </div>
                      </div>
                      <div className="fw-semibold">
                        ${formatMoney(c.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* From a transaction */}
            <div>
              <div
                className="fw-semibold small text-muted mb-2 text-uppercase"
                style={{ letterSpacing: '0.05em' }}
              >
                {unassigned.length > 0
                  ? 'Or create from a transaction'
                  : 'Create from a transaction'}
              </div>
              <Form.Control
                type="text"
                placeholder="Search transactions…"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="mb-2"
                autoFocus={unassigned.length === 0}
              />
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {txResults.length === 0 ? (
                  <p className="text-muted small text-center py-2 mb-0">
                    No transactions found.
                  </p>
                ) : (
                  txResults.map((tx) => (
                    <div
                      key={tx.id}
                      role="button"
                      tabIndex={0}
                      className="d-flex justify-content-between align-items-center py-2 px-2 rounded"
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--bs-border-color)',
                      }}
                      onClick={() => handleSelectTx(tx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSelectTx(tx)
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          'var(--bs-tertiary-bg)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = ''
                      }}
                    >
                      <div className="min-w-0 me-3">
                        <div
                          className="fw-medium text-truncate"
                          style={{ maxWidth: 380 }}
                        >
                          {tx.description}
                        </div>
                        <div className="text-muted small">
                          {formatShortDate(tx.date)}
                        </div>
                      </div>
                      <div className="fw-semibold flex-shrink-0">
                        ${formatMoney(tx.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {step === 'configure' ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setStep('pick')
                setSelectedTx(null)
              }}
            >
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateAndAssign}
              disabled={!nextChargeDate}
            >
              Add to Fixed payments
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}

// ─── Reassign upcoming modal ──────────────────────────────────────────────────

interface ReassignModalProps {
  show: boolean
  currentBucketId: number
  upcoming: BucketUpcomingItem[]
  onClose: () => void
  onSaved: () => void
}

function ReassignModal({
  show,
  currentBucketId,
  upcoming,
  onClose,
  onSaved,
}: ReassignModalProps) {
  const allBuckets = useMemo(
    () => getBuckets(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show]
  )

  function handleReassign(upcomingId: number, bucketId: string) {
    assignUpcomingToBucket(upcomingId, bucketId ? Number(bucketId) : null)
    onSaved()
  }

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Manage upcoming charges</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {upcoming.length === 0 ? (
          <p className="text-muted mb-0">
            No upcoming charges assigned. Assign them from the Upcoming section
            on the dashboard.
          </p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {upcoming.map((u) => (
              <div
                key={u.id}
                className="d-flex align-items-center justify-content-between gap-2"
              >
                <div>
                  <span className="fw-medium">{u.name}</span>
                  <span className="text-muted small ms-2">
                    ${formatMoney(u.amount)}/{u.frequency.toLowerCase()}
                  </span>
                </div>
                <Form.Select
                  size="sm"
                  style={{ width: 160 }}
                  value={String(currentBucketId)}
                  onChange={(e) => handleReassign(u.id, e.target.value)}
                  aria-label={`Reassign ${u.name}`}
                >
                  <option value="">Unassigned</option>
                  {allBuckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Form.Select>
              </div>
            ))}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

// ─── Add anchor modal (transaction picker) ───────────────────────────────────

interface AddAnchorModalProps {
  show: boolean
  bucketId: number
  onClose: () => void
  onSaved: () => void
}

function AddAnchorModal({
  show,
  bucketId,
  onClose,
  onSaved,
}: AddAnchorModalProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AnchorDebitRow | null>(null)
  const [frequency, setFrequency] = useState('MONTHLY')

  useMemo(() => {
    if (show) {
      setSearch('')
      setSelected(null)
      setFrequency('MONTHLY')
    }
  }, [show])

  const results = useMemo(() => searchRecentDebits(search, 40), [search])

  function handleConfirm() {
    if (!selected) return
    pinTransactionToBucket(selected.id, bucketId, frequency)
    toast.success(`"${selected.description}" pinned to bucket`)
    onSaved()
    onClose()
  }

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Pin a transaction to this bucket</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          Select a real transaction. The bucket will use the amount from this
          charge and automatically update whenever a newer transaction with the
          same description appears.
        </p>

        {selected ? (
          <>
            <div
              className="p-3 mb-3 rounded"
              style={{
                border: '1.5px solid var(--vantura-primary)',
                background: 'var(--bs-body-bg)',
              }}
            >
              <div className="fw-semibold">{selected.description}</div>
              <div className="text-muted small">
                ${formatMoney(selected.amount)} ·{' '}
                {formatShortDate(selected.date)}
              </div>
            </div>
            <Form.Group>
              <Form.Label>How often does this charge recur?</Form.Label>
              <Form.Select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                {BUDGET_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </>
        ) : (
          <>
            <Form.Control
              type="text"
              placeholder="Search transactions…"
              className="mb-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {results.length === 0 ? (
                <p className="text-muted small text-center py-3 mb-0">
                  No transactions found.
                </p>
              ) : (
                results.map((tx) => (
                  <div
                    key={tx.id}
                    className="d-flex justify-content-between align-items-center py-2 px-2 rounded"
                    style={{
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--bs-border-color)',
                    }}
                    onClick={() => setSelected(tx)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bs-tertiary-bg)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = ''
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelected(tx)
                    }}
                  >
                    <div className="min-w-0">
                      <div
                        className="fw-medium text-truncate"
                        style={{ maxWidth: 380 }}
                      >
                        {tx.description}
                      </div>
                      <div className="text-muted small">
                        {formatShortDate(tx.date)}
                      </div>
                    </div>
                    <div className="fw-semibold flex-shrink-0 ms-3">
                      ${formatMoney(tx.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {selected ? (
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Back
            </Button>
            <Button variant="primary" onClick={handleConfirm}>
              Pin to bucket
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}

// ─── Item row (upcoming / variable / hypothetical) ───────────────────────────

interface ItemRowProps {
  name: string
  amountCents: number
  frequency: string
  period: BudgetDisplayPeriod
  periodLabel: string
  isHypothetical?: boolean
  onEdit?: () => void
  onDelete?: () => void
}

function ItemRow({
  name,
  amountCents,
  frequency,
  period,
  periodLabel,
  isHypothetical,
  onEdit,
  onDelete,
}: ItemRowProps) {
  const periodCents =
    frequency !== 'ONCE' ? toPeriodCents(amountCents, frequency, period) : 0

  return (
    <div
      className="d-flex align-items-center justify-content-between py-2 px-3"
      style={{
        borderRadius: 8,
        border: isHypothetical
          ? '1.5px dashed var(--bs-border-color)'
          : '1px solid var(--bs-border-color)',
        marginBottom: 8,
      }}
    >
      <div className="d-flex align-items-center gap-2 min-w-0">
        {isHypothetical && (
          <Badge bg="warning" text="dark" className="flex-shrink-0">
            ?
          </Badge>
        )}
        <span className="text-truncate">{name}</span>
        <Badge
          bg="secondary"
          className="flex-shrink-0"
          style={{ fontSize: '0.65rem' }}
        >
          {frequencyLabel(frequency)}
        </Badge>
      </div>
      <div className="d-flex align-items-center gap-2 ms-2 flex-shrink-0">
        <div className="text-end">
          {frequency === 'ONCE' ? (
            <div className="fw-semibold text-muted">One-off</div>
          ) : (
            <>
              <div className="fw-semibold">${formatMoney(periodCents)}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                /{periodLabel.toLowerCase()}
              </div>
            </>
          )}
        </div>
        {onEdit && (
          <Button
            variant="link"
            size="sm"
            className="p-0 text-muted"
            onClick={onEdit}
            aria-label={`Edit ${name}`}
          >
            <i className="mdi mdi-pencil-outline" aria-hidden />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="link"
            size="sm"
            className="p-0 text-muted"
            onClick={onDelete}
            aria-label={`Remove ${name}`}
          >
            <i className="mdi mdi-close" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Anchor row ───────────────────────────────────────────────────────────────

interface AnchorRowProps {
  anchor: BucketAnchorItem
  period: BudgetDisplayPeriod
  periodLabel: string
  onDelete: () => void
}

function AnchorRow({ anchor, period, periodLabel, onDelete }: AnchorRowProps) {
  const periodCents = toPeriodCents(
    anchor.latest_amount_cents,
    anchor.frequency,
    period
  )

  return (
    <div
      className="d-flex align-items-center justify-content-between py-2 px-3"
      style={{
        borderRadius: 8,
        border: '1px solid var(--bs-border-color)',
        marginBottom: 8,
      }}
    >
      <div className="d-flex align-items-center gap-2 min-w-0">
        <i
          className="mdi mdi-link-variant text-muted flex-shrink-0"
          aria-hidden
        />
        <div className="min-w-0">
          <div className="text-truncate fw-medium">
            {anchor.description_pattern}
          </div>
          {anchor.latest_transaction_date && (
            <div className="text-muted" style={{ fontSize: '0.7rem' }}>
              Last seen {formatShortDate(anchor.latest_transaction_date)}
            </div>
          )}
        </div>
        <Badge
          bg="secondary"
          className="flex-shrink-0"
          style={{ fontSize: '0.65rem' }}
        >
          {frequencyLabel(anchor.frequency)}
        </Badge>
      </div>
      <div className="d-flex align-items-center gap-2 ms-2 flex-shrink-0">
        <div className="text-end">
          <div className="fw-semibold">${formatMoney(periodCents)}</div>
          <div className="text-muted" style={{ fontSize: '0.7rem' }}>
            /{periodLabel.toLowerCase()}
          </div>
        </div>
        <Button
          variant="link"
          size="sm"
          className="p-0 text-muted"
          onClick={onDelete}
          aria-label={`Remove ${anchor.description_pattern}`}
        >
          <i className="mdi mdi-close" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function AnalyticsBudgetPlanBucket() {
  const { bucketId } = useParams<{ bucketId: string }>()
  const navigate = useNavigate()
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const [version, setVersion] = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const periodParam = searchParams.get('period')
  const period: BudgetDisplayPeriod =
    periodParam === 'WEEKLY' || periodParam === 'YEARLY'
      ? periodParam
      : 'MONTHLY'
  function setPeriod(p: BudgetDisplayPeriod) {
    setSearchParams(
      (prev) => {
        prev.set('period', p)
        return prev
      },
      { replace: true }
    )
  }

  const [showAddVariable, setShowAddVariable] = useState(false)
  const [showAddHypothetical, setShowAddHypothetical] = useState(false)
  const [editingLine, setEditingLine] = useState<BudgetLineRow | null>(null)
  const [showAddFixed, setShowAddFixed] = useState(false)
  const [showReassign, setShowReassign] = useState(false)
  const [showAddAnchor, setShowAddAnchor] = useState(false)

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  const id = bucketId ? Number(bucketId) : null

  const bucket: BudgetBucketRow | null = useMemo(
    () => (id != null ? getBucket(id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version, lastSyncCompletedAt]
  )

  const items = useMemo(
    () => (id != null ? getBucketItems(id) : { upcoming: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version, lastSyncCompletedAt]
  )

  const anchors = useMemo(
    () => (id != null ? getBucketAnchors(id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version, lastSyncCompletedAt]
  )

  const variableLines: BudgetLineRow[] = useMemo(
    () => (id != null ? getVariableLines(id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version, lastSyncCompletedAt]
  )

  const hypotheticalLines: BudgetLineRow[] = useMemo(
    () => (id != null ? getHypotheticalLines(id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version, lastSyncCompletedAt]
  )

  const bucketTotalCents = useMemo(
    () => (id != null ? getBucketTotalCents(id, period) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, period, version, lastSyncCompletedAt]
  )

  if (!bucket) {
    return (
      <div className="grid-margin">
        <p className="text-muted">Bucket not found.</p>
        <Button variant="link" onClick={() => navigate('/analytics/budget')}>
          Back to Budget Plan
        </Button>
      </div>
    )
  }

  const hex = bucketColourHex(bucket.colour)
  const periodLabel =
    BUDGET_DISPLAY_PERIODS.find((p) => p.value === period)?.label ?? period

  function handleDeleteLine(lineId: number, name: string) {
    deleteBudgetLine(lineId)
    toast.success(`Removed "${name}"`)
    refresh()
  }

  function handleDeleteAnchor(anchor: BucketAnchorItem) {
    unpinAnchor(anchor.id)
    toast.success(`Unpinned "${anchor.description_pattern}"`)
    refresh()
  }

  return (
    <div className="grid-margin">
      {/* Bucket header */}
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-3">
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: `${hex}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              color: hex,
              flexShrink: 0,
            }}
          >
            <i className={`mdi ${bucket.icon}`} aria-hidden />
          </span>
          <div>
            <h5 className="mb-0 fw-bold">{bucket.name}</h5>
            <span className="text-muted small">Budget bucket</span>
          </div>
        </div>
        <div className="btn-group btn-group-sm">
          {BUDGET_DISPLAY_PERIODS.map((p) => (
            <Button
              key={p.value}
              variant={period === p.value ? 'primary' : 'outline-secondary'}
              size="sm"
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Fixed payments + Recurring charges */}
      <Row className="g-3 mb-3">
        {/* Fixed payments — upcoming charges */}
        <Col xs={12} lg={6}>
          <Card className="h-100">
            <Card.Header className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <i className="mdi mdi-calendar-clock text-muted" aria-hidden />
                <span className="fw-semibold">Fixed payments</span>
              </div>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => setShowAddFixed(true)}
                >
                  <i className="mdi mdi-plus me-1" aria-hidden />
                  Add
                </Button>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setShowReassign(true)}
                >
                  <i className="mdi mdi-cog-outline me-1" aria-hidden />
                  Manage
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {items.upcoming.length === 0 ? (
                <p className="text-muted small mb-0">
                  No upcoming charges assigned. Assign them from the Upcoming
                  section on the dashboard, or use <strong>Manage</strong>.
                </p>
              ) : (
                items.upcoming.map((u) => (
                  <ItemRow
                    key={u.id}
                    name={u.name}
                    amountCents={u.amount}
                    frequency={u.frequency}
                    period={period}
                    periodLabel={periodLabel}
                  />
                ))
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Recurring charges — transaction anchors */}
        <Col xs={12} lg={6}>
          <Card className="h-100">
            <Card.Header className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <i className="mdi mdi-link-variant text-muted" aria-hidden />
                <span className="fw-semibold">Recurring charges</span>
              </div>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => setShowAddAnchor(true)}
              >
                <i className="mdi mdi-plus me-1" aria-hidden />
                Pin transaction
              </Button>
            </Card.Header>
            <Card.Body>
              {anchors.length === 0 ? (
                <p className="text-muted small mb-0">
                  Pin a real transaction to this bucket — the amount
                  auto-updates whenever a newer charge with the same description
                  appears. Perfect for subscriptions.
                </p>
              ) : (
                anchors.map((a) => (
                  <AnchorRow
                    key={a.id}
                    anchor={a}
                    period={period}
                    periodLabel={periodLabel}
                    onDelete={() => handleDeleteAnchor(a)}
                  />
                ))
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Variable spending — manual estimates */}
      <Card className="mb-3">
        <Card.Header className="d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="mdi mdi-chart-bar text-muted" aria-hidden />
            <span className="fw-semibold">Variable spending</span>
            <span className="text-muted small">— estimated amounts</span>
          </div>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => setShowAddVariable(true)}
          >
            <i className="mdi mdi-plus me-1" aria-hidden />
            Add item
          </Button>
        </Card.Header>
        <Card.Body>
          {variableLines.length === 0 ? (
            <p className="text-muted small mb-0">
              Estimate variable recurring expenses for this bucket — e.g.
              Groceries, Fuel, Dining out.
            </p>
          ) : (
            variableLines.map((l) => (
              <ItemRow
                key={l.id}
                name={l.name}
                amountCents={l.amount_cents}
                frequency={l.frequency}
                period={period}
                periodLabel={periodLabel}
                onEdit={() => setEditingLine(l)}
                onDelete={() => handleDeleteLine(l.id, l.name)}
              />
            ))
          )}
        </Card.Body>
      </Card>

      {/* Hypotheticals */}
      <Card className="mb-3">
        <Card.Header className="d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="mdi mdi-flask-outline text-muted" aria-hidden />
            <span className="fw-semibold">Hypotheticals</span>
            <span className="text-muted small">— can I afford X?</span>
          </div>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setShowAddHypothetical(true)}
          >
            <i className="mdi mdi-plus me-1" aria-hidden />
            Add hypothetical
          </Button>
        </Card.Header>
        <Card.Body>
          {hypotheticalLines.length === 0 ? (
            <p className="text-muted small mb-0">
              Add a hypothetical item to test "can I afford this?" — stays
              separate from real expenses and persists until you remove it.
            </p>
          ) : (
            hypotheticalLines.map((h) => (
              <ItemRow
                key={h.id}
                name={h.name}
                amountCents={h.amount_cents}
                frequency={h.frequency}
                period={period}
                periodLabel={periodLabel}
                isHypothetical
                onEdit={() => setEditingLine(h)}
                onDelete={() => handleDeleteLine(h.id, h.name)}
              />
            ))
          )}
        </Card.Body>
      </Card>

      {/* Bucket total */}
      <Card style={{ borderLeft: `4px solid ${hex}` }}>
        <Card.Body>
          <div className="d-flex align-items-center justify-content-between">
            <span className="fw-semibold text-muted">
              {bucket.name} — total outgoing ({periodLabel})
            </span>
            <span className="fw-bold fs-5" style={{ color: hex }}>
              ${formatMoney(bucketTotalCents)}
            </span>
          </div>
        </Card.Body>
      </Card>

      {/* Modals */}
      <AddToFixedPaymentsModal
        show={showAddFixed}
        bucketId={bucket.id}
        onClose={() => setShowAddFixed(false)}
        onSaved={refresh}
      />
      <AddBudgetLineModal
        show={showAddVariable}
        bucketId={bucket.id}
        isHypothetical={false}
        onClose={() => setShowAddVariable(false)}
        onSaved={refresh}
      />
      <AddBudgetLineModal
        show={showAddHypothetical}
        bucketId={bucket.id}
        isHypothetical={true}
        onClose={() => setShowAddHypothetical(false)}
        onSaved={refresh}
      />
      <EditBudgetLineModal
        line={editingLine}
        onClose={() => setEditingLine(null)}
        onSaved={refresh}
      />
      <ReassignModal
        show={showReassign}
        currentBucketId={bucket.id}
        upcoming={items.upcoming}
        onClose={() => setShowReassign(false)}
        onSaved={refresh}
      />
      <AddAnchorModal
        show={showAddAnchor}
        bucketId={bucket.id}
        onClose={() => setShowAddAnchor(false)}
        onSaved={refresh}
      />
    </div>
  )
}
