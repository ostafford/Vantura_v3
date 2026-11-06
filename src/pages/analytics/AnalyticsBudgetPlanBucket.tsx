import { useState, useMemo, useCallback } from 'react'
import { useStore } from 'zustand'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Row, Col, Button, Modal, Form, Badge } from 'react-bootstrap'
import {
  getBucket,
  getBucketItems,
  getBucketTotalCents,
  assignUpcomingToBucket,
  getUnassignedUpcoming,
  type BudgetBucketRow,
  type BucketUpcomingItem,
} from '@/services/budgetBuckets'
import { blankDraft, draftFromTransaction } from '@/services/regulars'
import { useRegularDraft } from '@/components/regulars/useRegularDraft'
import {
  getBucketTrackers,
  assignTrackerToBucket,
  getTrackersForPicker,
  type BucketTrackerItem,
  type TrackerPickerItem,
  type TrackerResetFrequency,
} from '@/services/trackers'
import {
  searchRecentDebits,
  type RecentDebitRow,
} from '@/services/transactions'
import {
  toPeriodCents,
  type BudgetDisplayPeriod,
} from '@/lib/monthlyEquivalent'
import { formatMoney, formatShortDate } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import { syncStore } from '@/stores/syncStore'
import {
  BUDGET_FREQUENCIES,
  BUDGET_DISPLAY_PERIODS,
} from '@/lib/budgetBucketMeta'
import {
  getBucketColor,
  getTrackerColor,
  getFrequencyBadgeColors,
  type ColorMode,
} from '@/lib/colorSystem'
import { themeStore, resolveTheme } from '@/stores/themeStore'

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

// ─── Add upcoming transaction modal ──────────────────────────────────────────

interface AddUpcomingTransactionModalProps {
  show: boolean
  bucketId: number
  onClose: () => void
  onSaved: () => void
}

function AddUpcomingTransactionModal({
  show,
  bucketId,
  onClose,
  onSaved,
}: AddUpcomingTransactionModalProps) {
  const [step, setStep] = useState<'pick' | 'configure'>('pick')
  const [txSearch, setTxSearch] = useState('')
  const [selectedTx, setSelectedTx] = useState<RecentDebitRow | null>(null)
  const { draft, reset, update, setFrequency, save } =
    useRegularDraft(blankDraft)

  useMemo(() => {
    if (show) {
      setStep('pick')
      setTxSearch('')
      setSelectedTx(null)
      reset(blankDraft())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  const unassigned = useMemo(
    () => getUnassignedUpcoming(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show]
  )
  const txResults = useMemo(() => searchRecentDebits(txSearch, 40), [txSearch])

  function handleAssignExisting(charge: BucketUpcomingItem) {
    assignUpcomingToBucket(charge.id, bucketId)
    toast.success(`"${charge.name}" added`)
    onSaved()
    onClose()
  }

  // Same Regular the Dashboard creates from this payment, including the
  // payment link (#147) and its date as the anchor (#153): an expense, in this
  // bucket.
  function handleSelectTx(tx: RecentDebitRow) {
    setSelectedTx(tx)
    reset({ ...draftFromTransaction(tx, draft.frequency), bucketId })
    setStep('configure')
  }

  function handleCreateAndAssign() {
    if (!selectedTx) return
    const result = save()
    if (!result.ok) {
      toast.error(
        result.errors.name
          ? 'This transaction has no description to name the Regular by.'
          : (Object.values(result.errors)[0] ?? 'This Regular can’t be saved.')
      )
      return
    }
    toast.success(`"${selectedTx.description}" added as upcoming transaction`)
    onSaved()
    onClose()
  }

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {step === 'configure'
            ? 'Set charge details'
            : 'Add upcoming transaction'}
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
                    value={draft.frequency}
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
                    value={draft.nextChargeDate}
                    onChange={(e) => update({ nextChargeDate: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>
            <p className="text-muted small mt-3 mb-0">
              Creates a new upcoming transaction using this charge's description
              and amount, then assigns it to this bucket.
            </p>
          </>
        ) : (
          <>
            {unassigned.length > 0 && (
              <div className="mb-4">
                <div
                  className="fw-semibold small text-muted mb-2 text-uppercase"
                  style={{ letterSpacing: '0.05em' }}
                >
                  Your Regulars
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
                          {frequencyLabel(c.frequency)}
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
              disabled={!draft.nextChargeDate}
            >
              Add to bucket
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

// ─── Add tracker modal ────────────────────────────────────────────────────────

interface AddTrackerModalProps {
  show: boolean
  bucketId: number
  onClose: () => void
  onSaved: () => void
}

function AddTrackerModal({
  show,
  bucketId,
  onClose,
  onSaved,
}: AddTrackerModalProps) {
  const themeMode = useStore(themeStore, (s) => s.mode)
  const mode = resolveTheme(themeMode)
  const allTrackers: TrackerPickerItem[] = useMemo(
    () => (show ? getTrackersForPicker() : []),

    [show]
  )

  const available = allTrackers.filter((t) => t.current_bucket_id !== bucketId)
  const alreadyHere = allTrackers.filter(
    (t) => t.current_bucket_id === bucketId
  )

  function handleAssign(tracker: TrackerPickerItem) {
    assignTrackerToBucket(tracker.id, bucketId)
    toast.success(`"${tracker.name}" added to bucket`)
    onSaved()
    onClose()
  }

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Add tracker</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {allTrackers.length === 0 ? (
          <p className="text-muted mb-0">
            No trackers yet — create them from the Dashboard.
          </p>
        ) : available.length === 0 ? (
          <p className="text-muted mb-0">
            All your trackers are already in this bucket.
          </p>
        ) : (
          <div className="d-flex flex-column gap-1">
            {available.map((t) => (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                className="d-flex align-items-center justify-content-between px-3 py-2 rounded"
                style={{
                  cursor: 'pointer',
                  border: '1px solid var(--bs-border-color)',
                }}
                onClick={() => handleAssign(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAssign(t)
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bs-tertiary-bg)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = ''
                }}
              >
                <div className="d-flex align-items-center gap-2 min-w-0">
                  <span
                    className="rounded-circle flex-shrink-0"
                    style={{
                      width: 10,
                      height: 10,
                      backgroundColor: getTrackerColor(
                        { id: t.id, bucket_id: t.current_bucket_id },
                        mode
                      ),
                    }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="fw-medium text-truncate">{t.name}</div>
                    {t.current_bucket_name && (
                      <div className="text-warning small">
                        Currently in "{t.current_bucket_name}" — will be moved
                      </div>
                    )}
                  </div>
                </div>
                <span
                  className="badge flex-shrink-0"
                  style={{
                    backgroundColor: getFrequencyBadgeColors(
                      t.reset_frequency as TrackerResetFrequency,
                      mode
                    ).bg,
                    color: getFrequencyBadgeColors(
                      t.reset_frequency as TrackerResetFrequency,
                      mode
                    ).text,
                  }}
                >
                  {frequencyLabel(t.reset_frequency)}
                </span>
              </div>
            ))}
          </div>
        )}
        {alreadyHere.length > 0 && available.length > 0 && (
          <p className="text-muted small mt-3 mb-0">
            {alreadyHere.length} tracker
            {alreadyHere.length !== 1 ? 's' : ''} already in this bucket.
          </p>
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

// ─── Upcoming transaction row ─────────────────────────────────────────────────

interface UpcomingRowProps {
  item: BucketUpcomingItem
  period: BudgetDisplayPeriod
  periodLabel: string
  onUnassign: () => void
}

function UpcomingRow({
  item,
  period,
  periodLabel,
  onUnassign,
}: UpcomingRowProps) {
  const periodCents =
    item.frequency !== 'ONCE'
      ? toPeriodCents(item.amount, item.frequency, period)
      : 0

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
          className="mdi mdi-calendar-clock text-muted flex-shrink-0"
          aria-hidden
        />
        <span className="text-truncate">{item.name}</span>
        <Badge
          bg="secondary"
          className="flex-shrink-0"
          style={{ fontSize: '0.65rem' }}
        >
          {frequencyLabel(item.frequency)}
        </Badge>
      </div>
      <div className="d-flex align-items-center gap-2 ms-2 flex-shrink-0">
        <div className="text-end">
          {item.frequency === 'ONCE' ? (
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
        <Button
          variant="link"
          size="sm"
          className="p-0 text-muted"
          onClick={onUnassign}
          aria-label={`Remove ${item.name}`}
        >
          <i className="mdi mdi-close" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

// ─── Tracker row ──────────────────────────────────────────────────────────────

interface TrackerBucketRowProps {
  tracker: BucketTrackerItem
  bucketId: number
  period: BudgetDisplayPeriod
  periodLabel: string
  onUnassign: () => void
}

function TrackerBucketRow({
  tracker,
  bucketId,
  period,
  periodLabel,
  onUnassign,
}: TrackerBucketRowProps) {
  const themeMode = useStore(themeStore, (s) => s.mode)
  const mode = resolveTheme(themeMode)
  const periodCents = toPeriodCents(
    tracker.budget_amount,
    tracker.reset_frequency,
    period
  )
  const frequencyColors = getFrequencyBadgeColors(
    tracker.reset_frequency as TrackerResetFrequency,
    mode
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
        <span
          className="rounded-circle flex-shrink-0"
          style={{
            width: 10,
            height: 10,
            backgroundColor: getTrackerColor(
              { id: tracker.id, bucket_id: bucketId },
              mode
            ),
          }}
          aria-hidden
        />
        <span className="text-truncate fw-medium">{tracker.name}</span>
        <span
          className="badge flex-shrink-0"
          style={{
            fontSize: '0.65rem',
            backgroundColor: frequencyColors.bg,
            color: frequencyColors.text,
          }}
        >
          {frequencyLabel(tracker.reset_frequency)}
        </span>
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
          onClick={onUnassign}
          aria-label={`Remove ${tracker.name} from bucket`}
        >
          <i className="mdi mdi-close" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AnalyticsBudgetPlanBucket() {
  const { bucketId } = useParams<{ bucketId: string }>()
  const navigate = useNavigate()
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const themeMode = useStore(themeStore, (s) => s.mode)
  const mode: ColorMode = resolveTheme(themeMode)
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

  const [showAddUpcoming, setShowAddUpcoming] = useState(false)
  const [showAddTracker, setShowAddTracker] = useState(false)

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  const id = bucketId ? Number(bucketId) : null

  const bucket: BudgetBucketRow | null = useMemo(
    () => (id != null ? getBucket(id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version, lastSyncCompletedAt]
  )

  const upcomingItems = useMemo(
    () => (id != null ? getBucketItems(id).upcoming : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, version, lastSyncCompletedAt]
  )

  const trackers = useMemo(
    () => (id != null ? getBucketTrackers(id) : []),
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

  const hex = getBucketColor(bucket.id, mode)
  const periodLabel =
    BUDGET_DISPLAY_PERIODS.find((p) => p.value === period)?.label ?? period

  function handleUnassignUpcoming(item: BucketUpcomingItem) {
    assignUpcomingToBucket(item.id, null)
    toast.success(`"${item.name}" removed from bucket`)
    refresh()
  }

  function handleUnassignTracker(tracker: BucketTrackerItem) {
    assignTrackerToBucket(tracker.id, null)
    toast.success(`"${tracker.name}" removed from bucket`)
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
        <div
          className="period-toggle"
          role="group"
          aria-label="Select display period"
        >
          {BUDGET_DISPLAY_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`segment-btn${period === p.value ? ' active' : ''}`}
              onClick={() => setPeriod(p.value)}
              aria-pressed={period === p.value}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Upcoming Transactions */}
      <Card className="mb-3">
        <Card.Header className="d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="mdi mdi-calendar-clock text-muted" aria-hidden />
            <span className="fw-semibold">Regulars</span>
          </div>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => setShowAddUpcoming(true)}
          >
            <i className="mdi mdi-plus me-1" aria-hidden />
            Add
          </Button>
        </Card.Header>
        <Card.Body>
          {upcomingItems.length === 0 ? (
            <p className="text-muted small mb-0">
              Add fixed recurring charges — subscriptions, bills, loan
              repayments. You can assign existing Regulars or create one from a
              real transaction.
            </p>
          ) : (
            upcomingItems.map((u) => (
              <UpcomingRow
                key={u.id}
                item={u}
                period={period}
                periodLabel={periodLabel}
                onUnassign={() => handleUnassignUpcoming(u)}
              />
            ))
          )}
        </Card.Body>
      </Card>

      {/* Trackers */}
      <Card className="mb-3">
        <Card.Header className="d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="mdi mdi-chart-line text-muted" aria-hidden />
            <span className="fw-semibold">Trackers</span>
          </div>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => setShowAddTracker(true)}
          >
            <i className="mdi mdi-plus me-1" aria-hidden />
            Add tracker
          </Button>
        </Card.Header>
        <Card.Body>
          {trackers.length === 0 ? (
            <p className="text-muted small mb-0">
              Link a spending tracker to this bucket — its budget will
              contribute to the bucket total, normalized to your selected
              period.
            </p>
          ) : (
            id != null &&
            trackers.map((t) => (
              <TrackerBucketRow
                key={t.id}
                tracker={t}
                bucketId={id}
                period={period}
                periodLabel={periodLabel}
                onUnassign={() => handleUnassignTracker(t)}
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
      <AddUpcomingTransactionModal
        show={showAddUpcoming}
        bucketId={bucket.id}
        onClose={() => setShowAddUpcoming(false)}
        onSaved={refresh}
      />
      <AddTrackerModal
        show={showAddTracker}
        bucketId={bucket.id}
        onClose={() => setShowAddTracker(false)}
        onSaved={refresh}
      />
    </div>
  )
}
