import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Row, Col, Button, Modal, Form, Card } from 'react-bootstrap'
import { useStore } from 'zustand'
import {
  getBuckets,
  createBucket,
  updateBucket,
  deleteBucket,
  reorderBuckets,
  getUnassignedUpcoming,
  assignUpcomingToBucket,
  type BudgetBucketRow,
} from '@/services/budgetBuckets'
import { formatMoney } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import { BUCKET_ICONS } from '@/lib/budgetBucketMeta'
import { getBucketColor } from '@/lib/colorSystem'
import { themeStore, resolveTheme } from '@/stores/themeStore'
import type React from 'react'
import { HelpPopover } from '@/components/HelpPopover'
import {
  usePlanMonth,
  usePlanVsActual,
} from '@/components/budgetPlan/usePlanVsActual'
import {
  BucketPlanCard,
  MonthNav,
  MonthSummaryCard,
  NoPlanSummaryCard,
  CategoryBreakdownCard,
} from '@/components/budgetPlan/PlanVsActualParts'
import {
  UNPLANNED_CARD_ID,
  monthLabel,
} from '@/components/budgetPlan/planFormat'
import { planMonthSearch } from '@/components/budgetPlan/planMonth'
import { MonthByMonthCard } from '@/components/budgetPlan/MonthByMonthCard'

// ─── Bucket modal ────────────────────────────────────────────────────────────

interface BucketModalProps {
  show: boolean
  editing: BudgetBucketRow | null
  onClose: () => void
  onSaved: () => void
}

function BucketModal({ show, editing, onClose, onSaved }: BucketModalProps) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('mdi-wallet')

  useMemo(() => {
    if (show) {
      setName(editing?.name ?? '')
      setIcon(editing?.icon ?? 'mdi-wallet')
    }
  }, [show, editing])

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (editing) {
      updateBucket(editing.id, trimmed, icon)
      toast.success('Bucket updated')
    } else {
      createBucket(trimmed, icon)
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
                      ? '2px solid var(--vantura-primary)'
                      : '2px solid transparent',
                  backgroundColor:
                    icon === opt.icon
                      ? 'color-mix(in srgb, var(--vantura-primary) 13%, transparent)'
                      : 'var(--bs-body-bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  color:
                    icon === opt.icon
                      ? 'var(--vantura-primary-text)'
                      : 'var(--bs-body-color)',
                  transition:
                    'border-color var(--duration-fast) ease, background-color var(--duration-fast) ease',
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
        <Modal.Title>Assign Regulars to buckets</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {unassigned.length === 0 ? (
          <p className="text-muted mb-0">
            All Regulars are assigned to a bucket.
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
          Delete <strong>{bucket?.name}</strong>? Its Regulars and Trackers will
          become unassigned.
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

const PLAN_HELP =
  "Your plan vs what actually went out, for one calendar month. Group Regulars and Trackers into buckets: each shows what's gone out against what's planned that month. Committed is what your buckets plan, and Unallocated is the Income no bucket plans for. Spending that matched no Regular or Tracker is Unplanned. Set your pay amount in Settings → Pay to see Income, Free spending so far and the bar. Use ‹ to look back at a finished month: it's judged against the plan you had when it ended, while its spending stays up to date."

/** #282 — a Month without a plan has no buckets to explain. */
const NO_PLAN_HELP =
  "This month is from before your first plan, so there are no buckets to compare. It shows what went out, by Up category, and Saved from the pay you confirmed for it. Saved isn't worked out for the month your account opened, or a month that used a Saver that's since closed."

/** Scrolls to the Unplanned card and moves focus there (the bar's unplanned segment). */
function showUnplanned() {
  const el = document.getElementById(UNPLANNED_CARD_ID)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  el.focus({ preventScroll: true })
}

/**
 * The Budget Plan: plan vs actual for one calendar month (#241, Spec D #239),
 * on `getPlanVsActual` (#240). It opens on the current month; ‹ / › step to
 * finished months (`?month=`, #243), each judged against its Month-end plan.
 * There is no display period: every figure is that month's, occurrence-based,
 * and `?period=` is ignored. Bucket editing acts on the live plan, so it's
 * offered on the current month only.
 */
export function AnalyticsBudgetPlan() {
  const themeMode = useStore(themeStore, (s) => s.mode)
  const mode = resolveTheme(themeMode)
  const [version, setVersion] = useState(0)
  const [showBucketModal, setShowBucketModal] = useState(false)
  const [editingBucket, setEditingBucket] = useState<BudgetBucketRow | null>(
    null
  )
  const [deletingBucket, setDeletingBucket] = useState<BudgetBucketRow | null>(
    null
  )
  const [showAssignModal, setShowAssignModal] = useState(false)

  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const planMonth = usePlanMonth({ withMonthsWithoutAPlan: true })
  const plan = usePlanVsActual(version, planMonth.month)
  const editable = planMonth.isCurrent
  const nav = <MonthNav planMonth={planMonth} path="/analytics/budget" />

  const buckets = useMemo(
    () => getBuckets(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  )
  const unassignedRegulars = useMemo(
    () => getUnassignedUpcoming(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  )

  // Drag-and-drop reorder — same native-DnD pattern as Savers, but bucket
  // order lives directly on sort_order (no app_settings key needed): a drop
  // just rewrites sort_order and refreshes.
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('text/plain', String(id))
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, id: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }, [])

  const handleBucketDrop = useCallback(
    (e: React.DragEvent, targetId: number) => {
      e.preventDefault()
      setDragOverId(null)
      const sourceId = parseInt(e.dataTransfer.getData('text/plain'), 10)
      if (Number.isNaN(sourceId) || sourceId === targetId) return
      const order = buckets.map((b) => b.id)
      const from = order.indexOf(sourceId)
      const to = order.indexOf(targetId)
      if (from === -1 || to === -1) return
      const next = [...order]
      next.splice(from, 1)
      next.splice(to, 0, sourceId)
      reorderBuckets(next)
      refresh()
    },
    [buckets, refresh]
  )

  function openCreate() {
    setEditingBucket(null)
    setShowBucketModal(true)
  }

  const help = (
    <HelpPopover
      id="budget-plan-help"
      title="Budget Plan"
      content={plan?.state === 'no-plan' ? NO_PLAN_HELP : PLAN_HELP}
      ariaLabel="How does Budget Plan work?"
    />
  )

  // #282 — Month by month is the last card on every month the page shows. It
  // sits after the month's own cards at one place in the tree, so stepping
  // between months keeps its selection and scroll.
  const page = (body: React.ReactNode) => (
    <div className="grid-margin">
      {body}
      <MonthByMonthCard version={version} />
    </div>
  )

  // #282 — a Month without a plan: its summary and Spending by category only.
  // No buckets, Not in a bucket or Add bucket, and nothing to edit.
  if (plan?.state === 'no-plan') {
    return page(
      <>
        <NoPlanSummaryCard
          plan={plan}
          nav={nav}
          onPayChanged={refresh}
          aside={help}
        />
        <Row className="g-3 mb-4">
          <Col xs={12} sm={6} lg={4}>
            <CategoryBreakdownCard
              breakdown={plan.spendingByCategory}
              kind="by-category"
            />
          </Col>
        </Row>
      </>
    )
  }

  if (!plan) {
    if (editable) return null
    return page(
      <>
        <Card className="mb-3" data-testid="plan-summary">
          <Card.Body>
            <div className="mb-2">{nav}</div>
            <p className="plan-muted mb-0" data-testid="plan-no-month-end-plan">
              Vantura has no Month-end plan for {monthLabel(planMonth.month)},
              so it can’t judge that month.
            </p>
          </Card.Body>
        </Card>
      </>
    )
  }
  const monthSearch = planMonthSearch(planMonth.month, planMonth.current)

  const rowsByBucket = new Map(buckets.map((b) => [b.id, b]))
  const { notInABucket } = plan

  return page(
    <>
      <MonthSummaryCard
        plan={plan}
        nav={nav}
        onShowUnplanned={showUnplanned}
        aside={
          <div className="d-flex align-items-center gap-2">
            {help}
            {editable && (
              <Button
                variant="primary"
                size="sm"
                onClick={openCreate}
                aria-label="Add bucket"
              >
                <i className="mdi mdi-plus me-sm-1" aria-hidden />
                <span className="d-none d-sm-inline">Add bucket</span>
              </Button>
            )}
          </div>
        }
      />

      <Row className="g-3 mb-4">
        {plan.buckets.length === 0 && !editable && (
          <Col xs={12}>
            <Card className="plan-card--empty">
              <Card.Body className="text-center py-3 plan-muted small">
                There were no buckets in {monthLabel(plan.month)}’s plan.
              </Card.Body>
            </Card>
          </Col>
        )}

        {plan.buckets.length === 0 && editable && (
          <Col xs={12}>
            <div className="plan-empty-prompt">
              <i className="mdi mdi-wallet-outline" aria-hidden />
              <span>
                Group your Regulars and Trackers into <strong>buckets</strong>
              </span>
              <span className="plan-empty-prompt__sep" aria-hidden>
                ·
              </span>
              <Button
                variant="link"
                className="plan-empty-prompt__action"
                onClick={openCreate}
              >
                Create a bucket
              </Button>
            </div>
          </Col>
        )}

        {plan.buckets.map((b) => {
          const hex = getBucketColor(b.bucketId, mode)
          const row = rowsByBucket.get(b.bucketId)
          return (
            <Col
              // Keyed by month too: stepping ‹ / › shows a different month,
              // so its bars appear rather than easing from the last one's.
              key={`${plan.month}:${b.bucketId}`}
              xs={12}
              sm={6}
              lg={4}
              {...(editable && {
                draggable: true,
                onDragStart: (e: React.DragEvent) =>
                  handleDragStart(e, b.bucketId),
                onDragOver: (e: React.DragEvent) =>
                  handleDragOver(e, b.bucketId),
                // Moving over a child card fires dragleave on the column;
                // only leaving the column itself clears the target.
                onDragLeave: (e: React.DragEvent) => {
                  if (
                    e.relatedTarget instanceof Node &&
                    e.currentTarget.contains(e.relatedTarget)
                  ) {
                    return
                  }
                  setDragOverId(null)
                },
                onDrop: (e: React.DragEvent) => handleBucketDrop(e, b.bucketId),
                onDragEnd: () => setDragOverId(null),
              })}
              style={{
                opacity: dragOverId === b.bucketId ? 0.6 : 1,
                transition: 'opacity var(--duration-fast) var(--ease-out)',
              }}
            >
              <BucketPlanCard
                testId="plan-bucket"
                name={b.name}
                title={
                  <Link
                    to={`/analytics/budget/${b.bucketId}${monthSearch}`}
                    className="plan-card__link"
                  >
                    {b.name}
                  </Link>
                }
                icon={b.icon}
                color={hex}
                plannedCents={b.plannedCents}
                actualCents={b.actualCents}
                items={b.items}
                empty={
                  editable ? (
                    <div className="plan-muted small">
                      Nothing in this bucket yet.{' '}
                      <Link
                        to={`/analytics/budget/${b.bucketId}`}
                        className="plan-link"
                      >
                        Add Regulars or Trackers
                      </Link>
                    </div>
                  ) : (
                    <div className="plan-muted small">
                      Nothing was in this bucket.
                    </div>
                  )
                }
                actions={
                  editable &&
                  row && (
                    <div className="d-flex align-items-center gap-1 flex-shrink-0">
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-muted"
                        onClick={() => {
                          setEditingBucket(row)
                          setShowBucketModal(true)
                        }}
                        aria-label={`Edit ${b.name}`}
                      >
                        <i className="mdi mdi-pencil-outline" aria-hidden />
                      </Button>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-muted"
                        onClick={() => setDeletingBucket(row)}
                        aria-label={`Delete ${b.name}`}
                      >
                        <i className="mdi mdi-trash-can-outline" aria-hidden />
                      </Button>
                    </div>
                  )
                }
              />
            </Col>
          )
        })}

        {notInABucket.items.length > 0 && (
          <Col key={plan.month} xs={12} sm={6} lg={4}>
            <BucketPlanCard
              testId="plan-not-in-a-bucket"
              name="Not in a bucket"
              title="Not in a bucket"
              icon="mdi-tray-full"
              color="var(--bs-secondary-color)"
              dashed
              caption="Counts as Spent on plan. Plans nothing toward Committed."
              plannedCents={notInABucket.plannedCents}
              actualCents={notInABucket.actualCents}
              items={notInABucket.items}
              footer={
                editable &&
                unassignedRegulars.length > 0 &&
                plan.buckets.length > 0 && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="mt-1"
                    onClick={() => setShowAssignModal(true)}
                  >
                    Assign Regulars to buckets
                  </Button>
                )
              }
            />
          </Col>
        )}

        <Col xs={12} sm={6} lg={4}>
          <CategoryBreakdownCard breakdown={plan.unplanned} kind="unplanned" />
        </Col>
      </Row>

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
    </>
  )
}
