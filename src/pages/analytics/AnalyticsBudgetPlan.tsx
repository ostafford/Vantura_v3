import { useState, useMemo, useCallback } from 'react'
import { useStore } from 'zustand'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Button,
  Modal,
  Form,
  ProgressBar,
} from 'react-bootstrap'
import {
  getBuckets,
  createBucket,
  updateBucket,
  deleteBucket,
  getBucketCardSummary,
  getUnassignedUpcoming,
  getIncomeCents,
  assignUpcomingToBucket,
  type BudgetBucketRow,
  type BucketCardSummary,
} from '@/services/budgetBuckets'
import { formatMoney } from '@/lib/format'
import { syncStore } from '@/stores/syncStore'
import { toast } from '@/stores/toastStore'
import {
  bucketColourHex,
  PASTEL_SWATCHES,
  BUCKET_ICONS,
  BUDGET_DISPLAY_PERIODS,
} from '@/lib/budgetBucketMeta'
import type { BudgetDisplayPeriod } from '@/lib/monthlyEquivalent'
import type React from 'react'

// ─── Bucket modal ────────────────────────────────────────────────────────────

interface BucketModalProps {
  show: boolean
  editing: BudgetBucketRow | null
  onClose: () => void
  onSaved: () => void
}

function BucketModal({ show, editing, onClose, onSaved }: BucketModalProps) {
  const [name, setName] = useState('')
  const [colour, setColour] = useState('sky')
  const [icon, setIcon] = useState('mdi-wallet')

  useMemo(() => {
    if (show) {
      setName(editing?.name ?? '')
      setColour(editing?.colour ?? 'sky')
      setIcon(editing?.icon ?? 'mdi-wallet')
    }
  }, [show, editing])

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (editing) {
      updateBucket(editing.id, trimmed, colour, icon)
      toast.success('Bucket updated')
    } else {
      createBucket(trimmed, colour, icon)
      toast.success('Bucket created')
    }
    onSaved()
    onClose()
  }

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{editing ? 'Edit Bucket' : 'New Bucket'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Name</Form.Label>
          <Form.Control
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Household"
            autoFocus
            maxLength={60}
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Colour</Form.Label>
          <div className="d-flex gap-2 flex-wrap">
            {PASTEL_SWATCHES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-label={s.label}
                onClick={() => setColour(s.id)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: s.hex,
                  border:
                    colour === s.id
                      ? '3px solid var(--vantura-primary)'
                      : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                  outline: 'none',
                }}
              />
            ))}
          </div>
        </Form.Group>

        <Form.Group>
          <Form.Label>Icon</Form.Label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 8,
            }}
          >
            {BUCKET_ICONS.map((opt) => (
              <button
                key={opt.icon}
                type="button"
                title={opt.label}
                aria-label={opt.label}
                onClick={() => setIcon(opt.icon)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  border:
                    icon === opt.icon
                      ? `2px solid ${bucketColourHex(colour)}`
                      : '2px solid transparent',
                  backgroundColor:
                    icon === opt.icon
                      ? `${bucketColourHex(colour)}22`
                      : 'var(--bs-body-bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  color:
                    icon === opt.icon
                      ? bucketColourHex(colour)
                      : 'var(--bs-body-color)',
                  transition: 'border-color 0.1s, background-color 0.1s',
                }}
              >
                <i className={`mdi ${opt.icon}`} aria-hidden />
              </button>
            ))}
          </div>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>
          {editing ? 'Save changes' : 'Create bucket'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

// ─── Assign upcoming modal ───────────────────────────────────────────────────

interface AssignModalProps {
  show: boolean
  buckets: BudgetBucketRow[]
  onClose: () => void
  onSaved: () => void
}

function AssignModal({ show, buckets, onClose, onSaved }: AssignModalProps) {
  const [version, setVersion] = useState(0)
  const unassigned = useMemo(
    () => getUnassignedUpcoming(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show, version]
  )

  function handleAssign(upcomingId: number, bucketId: string) {
    assignUpcomingToBucket(upcomingId, bucketId ? Number(bucketId) : null)
    setVersion((v) => v + 1)
    onSaved()
  }

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Assign upcoming charges to buckets</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {unassigned.length === 0 ? (
          <p className="text-muted mb-0">
            All upcoming charges are assigned to a bucket.
          </p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {unassigned.map((u) => (
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
                  defaultValue=""
                  onChange={(e) => handleAssign(u.id, e.target.value)}
                  aria-label={`Assign ${u.name} to bucket`}
                >
                  <option value="">Unassigned</option>
                  {buckets.map((b) => (
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

// ─── Delete confirm modal ────────────────────────────────────────────────────

interface DeleteModalProps {
  bucket: BudgetBucketRow | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteModal({ bucket, onClose, onDeleted }: DeleteModalProps) {
  function handleDelete() {
    if (!bucket) return
    deleteBucket(bucket.id)
    toast.success('Bucket deleted')
    onDeleted()
    onClose()
  }

  return (
    <Modal show={!!bucket} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Delete bucket</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Delete <strong>{bucket?.name}</strong>? Upcoming charges will become
          unassigned. Variable budget lines, hypotheticals, and pinned
          transactions will be permanently removed.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete}>
          Delete
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function AnalyticsBudgetPlan() {
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
  const [showBucketModal, setShowBucketModal] = useState(false)
  const [editingBucket, setEditingBucket] = useState<BudgetBucketRow | null>(
    null
  )
  const [deletingBucket, setDeletingBucket] = useState<BudgetBucketRow | null>(
    null
  )
  const [showAssignModal, setShowAssignModal] = useState(false)

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  const buckets = useMemo(
    () => getBuckets(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, lastSyncCompletedAt]
  )

  const bucketSummaries = useMemo(
    () =>
      Object.fromEntries(
        buckets.map((b) => [b.id, getBucketCardSummary(b.id, period)])
      ) as Record<number, BucketCardSummary>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buckets, period, version, lastSyncCompletedAt]
  )

  const unassignedUpcoming = useMemo(
    () => getUnassignedUpcoming(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, lastSyncCompletedAt]
  )

  const incomeCents = useMemo(
    () => getIncomeCents(period),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period, version, lastSyncCompletedAt]
  )

  const totalOutgoingCents = useMemo(
    () =>
      Object.values(bucketSummaries).reduce(
        (sum, s) => sum + s.plannedCents,
        0
      ),
    [bucketSummaries]
  )

  const freeSpendingCents =
    incomeCents != null ? incomeCents - totalOutgoingCents : null

  const periodLabel =
    BUDGET_DISPLAY_PERIODS.find((p) => p.value === period)?.label ?? period

  function openCreate() {
    setEditingBucket(null)
    setShowBucketModal(true)
  }

  function openEdit(b: BudgetBucketRow, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setEditingBucket(b)
    setShowBucketModal(true)
  }

  if (buckets.length === 0) {
    return (
      <div className="grid-margin">
        <Card>
          <Card.Body className="text-center py-5">
            <i
              className="mdi mdi-wallet-outline"
              style={{
                fontSize: '3rem',
                color: 'var(--vantura-primary)',
                opacity: 0.6,
              }}
              aria-hidden
            />
            <h5 className="mt-3 mb-2">Welcome to Budget Plan</h5>
            <p
              className="text-muted mb-1"
              style={{ maxWidth: 480, margin: '0 auto' }}
            >
              Budget Plan helps you understand your complete financial picture.
              Group your expenses into <strong>buckets</strong> — life pillars
              like Subscriptions, Household, or Lifestyle.
            </p>
            <p
              className="text-muted mb-1"
              style={{ maxWidth: 480, margin: '0 auto' }}
            >
              Each bucket holds your upcoming charges, pinned recurring
              transactions, and any variable spending estimates you set — broken
              down by week, month, or year.
            </p>
            <p
              className="text-muted mb-4"
              style={{ maxWidth: 480, margin: '0 auto' }}
            >
              At a glance you will always see your total outgoing, your income,
              and exactly how much free spending money you have left.
            </p>
            <Button variant="primary" onClick={openCreate}>
              <i className="mdi mdi-plus me-1" aria-hidden />
              Create your first bucket
            </Button>
          </Card.Body>
        </Card>

        <BucketModal
          show={showBucketModal}
          editing={null}
          onClose={() => setShowBucketModal(false)}
          onSaved={refresh}
        />
      </div>
    )
  }

  return (
    <div className="grid-margin">
      {/* Header row */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
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
        <div className="d-flex gap-2">
          {unassignedUpcoming.length > 0 && (
            <Button
              variant="outline-warning"
              size="sm"
              onClick={() => setShowAssignModal(true)}
            >
              <i className="mdi mdi-alert-circle-outline me-1" aria-hidden />
              {unassignedUpcoming.length} upcoming unassigned
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={openCreate}>
            <i className="mdi mdi-plus me-1" aria-hidden />
            Add bucket
          </Button>
        </div>
      </div>

      {/* Bucket grid */}
      <Row className="g-3 mb-4">
        {buckets.map((b) => {
          const hex = bucketColourHex(b.colour)
          const summary = bucketSummaries[b.id] ?? {
            plannedCents: 0,
            hypotheticalCents: 0,
          }

          return (
            <Col key={b.id} xs={12} sm={6} lg={4}>
              <Link
                to={`/analytics/budget/${b.id}?period=${period}`}
                className="text-decoration-none"
                style={{ color: 'inherit' }}
              >
                <Card
                  className="h-100"
                  style={{
                    borderLeft: `4px solid ${hex}`,
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow =
                      '0 3px 10px rgba(0,0,0,0.11)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = ''
                  }}
                >
                  <Card.Body className="py-3">
                    <div className="d-flex align-items-start justify-content-between">
                      <div className="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
                        <span
                          style={{
                            width: 36,
                            height: 36,
                            minWidth: 36,
                            borderRadius: 8,
                            backgroundColor: `${hex}22`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.2rem',
                            color: hex,
                          }}
                        >
                          <i className={`mdi ${b.icon}`} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-grow-1">
                          <div className="fw-semibold text-truncate">
                            {b.name}
                          </div>
                          <div
                            className="fw-bold"
                            style={{ color: hex, fontSize: '1.1rem' }}
                          >
                            ${formatMoney(summary.plannedCents)}
                            <span
                              className="text-muted fw-normal ms-1"
                              style={{ fontSize: '0.75rem' }}
                            >
                              /{periodLabel.toLowerCase()}
                            </span>
                          </div>
                          {summary.hypotheticalCents > 0 && (
                            <div
                              className="mt-1 d-flex align-items-center gap-1"
                              style={{ fontSize: '0.7rem' }}
                            >
                              <i
                                className="mdi mdi-flask-outline"
                                style={{ color: 'var(--bs-warning)' }}
                                aria-hidden
                              />
                              <span className="text-muted">
                                incl. ${formatMoney(summary.hypotheticalCents)}{' '}
                                hypothetical
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="d-flex align-items-center gap-1 ms-2 flex-shrink-0">
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 text-muted"
                          onClick={(e) => openEdit(b, e)}
                          aria-label={`Edit ${b.name}`}
                        >
                          <i className="mdi mdi-pencil-outline" aria-hidden />
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 text-muted"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setDeletingBucket(b)
                          }}
                          aria-label={`Delete ${b.name}`}
                        >
                          <i
                            className="mdi mdi-trash-can-outline"
                            aria-hidden
                          />
                        </Button>
                        <i
                          className="mdi mdi-chevron-right text-muted"
                          aria-hidden
                        />
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Link>
            </Col>
          )
        })}
      </Row>

      {/* Unassigned upcoming charges */}
      {unassignedUpcoming.length > 0 && (
        <Card className="mb-4 border-warning">
          <Card.Header className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <i
                className="mdi mdi-alert-circle-outline text-warning"
                aria-hidden
              />
              <span className="fw-semibold">
                Unassigned upcoming charges ({unassignedUpcoming.length})
              </span>
            </div>
            <Button
              variant="outline-warning"
              size="sm"
              onClick={() => setShowAssignModal(true)}
            >
              Assign now
            </Button>
          </Card.Header>
          <Card.Body className="py-2">
            <p className="text-muted small mb-2">
              These charges are not included in any bucket — your budget totals
              may be incomplete.
            </p>
            <div className="d-flex flex-wrap gap-2">
              {unassignedUpcoming.map((u) => (
                <span key={u.id} className="badge bg-secondary">
                  <i className="mdi mdi-calendar-clock me-1" aria-hidden />
                  {u.name}
                </span>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Income / Outgoing / Free Spending footer */}
      <Card>
        <Card.Body>
          <Row className="g-3 text-center mb-3">
            <Col xs={12} sm={4}>
              <div className="text-muted small mb-1">
                Income ({periodLabel})
              </div>
              {incomeCents != null ? (
                <div className="fw-bold fs-5">${formatMoney(incomeCents)}</div>
              ) : (
                <div className="text-muted small">
                  Not set —{' '}
                  <Link to="/settings" className="text-decoration-underline">
                    add in Settings
                  </Link>
                </div>
              )}
            </Col>
            <Col xs={12} sm={4}>
              <div className="text-muted small mb-1">
                Committed ({periodLabel})
              </div>
              <div className="fw-bold fs-5">
                ${formatMoney(totalOutgoingCents)}
                {incomeCents != null && incomeCents > 0 && (
                  <span
                    className="text-muted fw-normal ms-1"
                    style={{ fontSize: '0.75rem' }}
                  >
                    ({Math.round((totalOutgoingCents / incomeCents) * 100)}%)
                  </span>
                )}
              </div>
            </Col>
            <Col xs={12} sm={4}>
              <div className="text-muted small mb-1">
                Free spending ({periodLabel})
              </div>
              {freeSpendingCents != null ? (
                <div
                  className="fw-bold fs-5"
                  style={{
                    color:
                      freeSpendingCents >= 0
                        ? 'var(--vantura-success)'
                        : 'var(--vantura-danger)',
                  }}
                >
                  {freeSpendingCents < 0 ? '-' : ''}$
                  {formatMoney(Math.abs(freeSpendingCents))}
                </div>
              ) : (
                <div className="text-muted small">Set income to calculate</div>
              )}
            </Col>
          </Row>

          {incomeCents != null && incomeCents > 0 && (
            <>
              <ProgressBar
                style={{ height: 8, borderRadius: 4 }}
                aria-label="Income committed"
              >
                <ProgressBar
                  variant={
                    totalOutgoingCents / incomeCents >= 1
                      ? 'danger'
                      : totalOutgoingCents / incomeCents >= 0.85
                        ? 'warning'
                        : 'primary'
                  }
                  now={Math.min(100, (totalOutgoingCents / incomeCents) * 100)}
                  key={1}
                />
                {freeSpendingCents != null && freeSpendingCents > 0 && (
                  <ProgressBar
                    variant="secondary"
                    now={(freeSpendingCents / incomeCents) * 100}
                    style={{ opacity: 0.2 }}
                    key={2}
                  />
                )}
              </ProgressBar>
              <div className="d-flex justify-content-between mt-1">
                <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                  Committed
                </span>
                <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                  Free
                </span>
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      {/* Modals */}
      <BucketModal
        show={showBucketModal}
        editing={editingBucket}
        onClose={() => setShowBucketModal(false)}
        onSaved={refresh}
      />
      <AssignModal
        show={showAssignModal}
        buckets={buckets}
        onClose={() => setShowAssignModal(false)}
        onSaved={refresh}
      />
      <DeleteModal
        bucket={deletingBucket}
        onClose={() => setDeletingBucket(null)}
        onDeleted={refresh}
      />
    </div>
  )
}
