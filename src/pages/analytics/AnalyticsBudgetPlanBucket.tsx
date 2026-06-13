import { useState, useMemo, useCallback } from 'react'
import { useStore } from 'zustand'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Row, Col, Button, Modal, Form, Badge } from 'react-bootstrap'
import {
  getBucket,
  getBucketItems,
  getBucketTotalCents,
  getBuckets,
  assignUpcomingToBucket,
  type BudgetBucketRow,
  type BucketUpcomingItem,
} from '@/services/budgetBuckets'
import {
  getVariableLines,
  getHypotheticalLines,
  createBudgetLine,
  deleteBudgetLine,
  type BudgetLineRow,
} from '@/services/budgetHypotheticals'
import {
  toPeriodCents,
  type BudgetDisplayPeriod,
} from '@/lib/monthlyEquivalent'
import { formatMoney } from '@/lib/format'
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

  const title = isHypothetical ? 'Add hypothetical item' : 'Add variable item'

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isHypothetical && (
          <p className="text-muted small mb-3">
            Test affordability — this item is kept separate from your real
            expenses so you can remove it at any time.
          </p>
        )}
        {!isHypothetical && (
          <p className="text-muted small mb-3">
            Estimate a recurring variable expense for this bucket (e.g.
            Groceries, Petrol). It contributes to your bucket total.
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
    const id = bucketId ? Number(bucketId) : null
    assignUpcomingToBucket(upcomingId, id)
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
            No upcoming charges assigned to this bucket yet. Assign them from
            the Upcoming section on the dashboard.
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

// ─── Item row ────────────────────────────────────────────────────────────────

interface ItemRowProps {
  name: string
  amountCents: number
  frequency: string
  period: BudgetDisplayPeriod
  periodLabel: string
  isHypothetical?: boolean
  onDelete?: () => void
}

function ItemRow({
  name,
  amountCents,
  frequency,
  period,
  periodLabel,
  isHypothetical,
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

// ─── Main page ───────────────────────────────────────────────────────────────

export function AnalyticsBudgetPlanBucket() {
  const { bucketId } = useParams<{ bucketId: string }>()
  const navigate = useNavigate()
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const [version, setVersion] = useState(0)
  const [period, setPeriod] = useState<BudgetDisplayPeriod>('MONTHLY')
  const [showAddVariable, setShowAddVariable] = useState(false)
  const [showAddHypothetical, setShowAddHypothetical] = useState(false)
  const [showReassign, setShowReassign] = useState(false)

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
        <div className="d-flex gap-2 align-items-center">
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
      </div>

      {/* Fixed payments + Variable spending */}
      <Row className="g-3 mb-3">
        {/* Fixed payments — upcoming charges */}
        <Col xs={12} lg={6}>
          <Card className="h-100">
            <Card.Header className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <i className="mdi mdi-calendar-clock text-muted" aria-hidden />
                <span className="fw-semibold">Fixed payments</span>
              </div>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setShowReassign(true)}
              >
                <i className="mdi mdi-cog-outline me-1" aria-hidden />
                Manage
              </Button>
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

        {/* Variable spending — manual budget lines */}
        <Col xs={12} lg={6}>
          <Card className="h-100">
            <Card.Header className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <i className="mdi mdi-chart-bar text-muted" aria-hidden />
                <span className="fw-semibold">Variable spending</span>
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
                    onDelete={() => handleDeleteLine(l.id, l.name)}
                  />
                ))
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

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
              Add a hypothetical item to test "can I afford this?" — it stays
              separate from your real expenses and persists until you remove it.
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
      <ReassignModal
        show={showReassign}
        currentBucketId={bucket.id}
        upcoming={items.upcoming}
        onClose={() => setShowReassign(false)}
        onSaved={refresh}
      />
    </div>
  )
}
