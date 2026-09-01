import { Fragment, useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Card,
  Button,
  ProgressBar,
  Modal,
  Form,
  Collapse,
  Alert,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap'
import {
  getTracker,
  getTrackersWithProgressForPeriod,
  getTrackerTransactionsInPeriod,
  getTrackerCategoryIds,
  getTrackerCategoryUsage,
  createTracker,
  updateTracker,
  deleteTracker,
  calculatePaydayBudgetTotal,
  getTrackersDisplayPeriodData,
  type TrackerResetFrequency,
} from '@/services/trackers'
import { getCategories } from '@/services/categories'
import { getPayAmountCents } from '@/services/balance'
import { getAppSetting } from '@/db'
import { type BudgetDisplayPeriod } from '@/lib/monthlyEquivalent'
import { formatMoney, formatShortDate } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import { syncStore } from '@/stores/syncStore'
import { HelpPopover } from '@/components/HelpPopover'
import type React from 'react'

const RESET_FREQUENCIES: { value: TrackerResetFrequency; label: string }[] = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'FORTNIGHTLY', label: 'Fortnightly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'PAYDAY', label: 'Payday' },
]

const FREQUENCY_ORDER: TrackerResetFrequency[] = [
  'PAYDAY',
  'WEEKLY',
  'FORTNIGHTLY',
  'MONTHLY',
]

function getTrackerProgressStyle(progress: number): {
  variant: 'primary' | 'warning' | 'danger' | 'success'
  striped: boolean
  animated: boolean
} {
  if (progress >= 100) {
    return { variant: 'danger', striped: true, animated: true }
  }
  if (progress >= 81) {
    return { variant: 'danger', striped: false, animated: false }
  }
  if (progress > 50) {
    return { variant: 'warning', striped: false, animated: false }
  }
  return { variant: 'success', striped: false, animated: false }
}

const DISPLAY_PERIODS: { value: BudgetDisplayPeriod; label: string }[] = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
]

export function TrackersSection({
  dragHandleProps,
}: {
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>
}) {
  const [refresh, setRefresh] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('')
  const [frequency, setFrequency] = useState<TrackerResetFrequency>('WEEKLY')
  const [resetDay, setResetDay] = useState(1)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [categoryUsage, setCategoryUsage] = useState<Record<string, string>>({})
  const [displayPeriod, setDisplayPeriod] =
    useState<BudgetDisplayPeriod>('MONTHLY')
  const [searchParams, setSearchParams] = useSearchParams()
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)

  useEffect(() => {
    const rawId = searchParams.get('editTracker')
    if (!rawId) return
    const targetId = parseInt(rawId, 10)
    if (Number.isNaN(targetId)) return
    const row = getTracker(targetId)
    if (!row) return
    openEdit(row)
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const trackers = useMemo(
    () => getTrackersWithProgressForPeriod(0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, lastSyncCompletedAt]
  )
  const categories = useMemo(
    () => getCategories(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, lastSyncCompletedAt]
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const payAmountCents = useMemo(() => getPayAmountCents(), [refresh])
  const totalPaydayBudgetCents = useMemo(
    () => calculatePaydayBudgetTotal(trackers),
    [trackers]
  )
  const periodTxsByTrackerId = useMemo(() => {
    const map: Record<
      number,
      ReturnType<typeof getTrackerTransactionsInPeriod>
    > = {}
    for (const t of trackers) {
      map[t.id] = getTrackerTransactionsInPeriod(t.id, 0)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackers, refresh])
  const paydayBudgetExceedsPay =
    payAmountCents != null &&
    payAmountCents > 0 &&
    totalPaydayBudgetCents > payAmountCents

  // Effective budget/spend per display period (normalized when display period differs from native)
  const effectiveDataByTrackerId = useMemo(
    () => getTrackersDisplayPeriodData(trackers, displayPeriod),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackers, displayPeriod, refresh, lastSyncCompletedAt]
  )

  function openCreate() {
    setEditingId(null)
    setName('')
    setBudget('')
    setFrequency('WEEKLY')
    setResetDay(1)
    setSelectedCategoryIds([])
    setCategoryUsage(getTrackerCategoryUsage(null))
    setShowModal(true)
  }

  function openEdit(t: {
    id: number
    name: string
    budget_amount: number
    reset_frequency: string
    reset_day: number | null
  }) {
    setEditingId(t.id)
    setName(t.name)
    setBudget(String(t.budget_amount / 100))
    setFrequency(t.reset_frequency as TrackerResetFrequency)
    setResetDay(t.reset_day ?? 1)
    setSelectedCategoryIds(getTrackerCategoryIds(t.id))
    setCategoryUsage(getTrackerCategoryUsage(t.id))
    setShowModal(true)
  }

  function handleSave() {
    const budgetCents = Math.round(parseFloat(budget || '0') * 100)
    if (!name.trim() || budgetCents <= 0 || selectedCategoryIds.length === 0) {
      toast.error('Please fill in name, budget, and at least one category.')
      return
    }
    if (frequency === 'PAYDAY' && !getAppSetting('next_payday')) {
      toast.error(
        'Payday not configured. Set up your pay schedule in Settings before adding a Payday tracker.'
      )
      return
    }
    try {
      if (editingId != null) {
        updateTracker(
          editingId,
          name.trim(),
          budgetCents,
          frequency,
          resetDay,
          selectedCategoryIds
        )
        toast.success('Tracker saved.')
      } else {
        createTracker(
          name.trim(),
          budgetCents,
          frequency,
          resetDay,
          selectedCategoryIds
        )
        toast.success('Tracker created.')
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'PAYDAY_NOT_CONFIGURED') {
        toast.error(
          'Payday not configured. Set up your pay schedule in Settings before adding a Payday tracker.'
        )
        return
      }
      if (
        e instanceof Error &&
        e.message.startsWith('CATEGORY_ALREADY_ASSIGNED:')
      ) {
        const catId = e.message.slice('CATEGORY_ALREADY_ASSIGNED:'.length)
        const catName = categories.find((c) => c.id === catId)?.name ?? catId
        toast.error(
          `"${catName}" is already assigned to another tracker. A category can only belong to one tracker at a time.`
        )
        return
      }
      throw e
    }
    setShowModal(false)
    setRefresh((r) => r + 1)
  }

  function handleDelete(id: number) {
    deleteTracker(id)
    setShowModal(false)
    setRefresh((r) => r + 1)
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (categoryUsage[id]) return prev // already claimed by another tracker
      return [...prev, id]
    })
  }

  const resetDayOptions =
    frequency === 'MONTHLY'
      ? Array.from({ length: 28 }, (_, i) => i + 1)
      : [1, 2, 3, 4, 5, 6, 7]

  const budgetCentsForModal = Math.round(parseFloat(budget || '0') * 100)
  const otherPaydayBudgetCents = calculatePaydayBudgetTotal(
    trackers,
    editingId ?? undefined
  )
  const newTotalPaydayCents = otherPaydayBudgetCents + budgetCentsForModal
  const modalPaydayExceedsPay =
    frequency === 'PAYDAY' &&
    payAmountCents != null &&
    payAmountCents > 0 &&
    budgetCentsForModal > 0 &&
    newTotalPaydayCents > payAmountCents

  const titleBlock = (
    <div className="d-flex align-items-center">
      <span className="page-title-icon" {...dragHandleProps}>
        <i className="mdi mdi-chart-line" aria-hidden />
      </span>
      <div className="d-flex align-items-center">
        <span>Trackers</span>
        <HelpPopover
          id="trackers-help"
          title="Trackers"
          content="Set a budget and reset period for each tracker, then assign spending categories. The Weekly / Monthly / Yearly toggle rescales all amounts to that period — for example, a $200/month tracker shown in weekly view displays ~$46/week. Payday trackers reset on your next payday instead of a calendar date. For trend charts and history, go to Analytics → Trackers."
          ariaLabel="What are trackers?"
        />
      </div>
    </div>
  )

  return (
    <>
      <Card>
        <Card.Header className="d-flex flex-column gap-2 section-header">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="d-flex align-items-center">
              {titleBlock}
              <OverlayTrigger
                placement="top"
                overlay={
                  <Tooltip id="trackers-analytics-header-tooltip">
                    View tracker analytics
                  </Tooltip>
                }
              >
                <Link
                  to="/analytics/trackers"
                  className="btn-icon ms-2"
                  aria-label="View tracker analytics"
                >
                  <i className="mdi mdi-chart-box" aria-hidden />
                </Link>
              </OverlayTrigger>
            </div>
            <OverlayTrigger
              placement="top"
              overlay={<Tooltip id="trackers-add-tooltip">Add tracker</Tooltip>}
            >
              <button
                type="button"
                className="btn-icon btn-icon-primary"
                onClick={openCreate}
                aria-label="Add tracker"
              >
                <i className="mdi mdi-plus" aria-hidden />
              </button>
            </OverlayTrigger>
          </div>
          {/* Display period toggle */}
          <div className="d-flex justify-content-center">
            <div
              className="period-toggle"
              role="group"
              aria-label="Select display period"
            >
              {DISPLAY_PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`segment-btn${displayPeriod === p.value ? ' active' : ''}`}
                  onClick={() => setDisplayPeriod(p.value)}
                  aria-pressed={displayPeriod === p.value}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          {paydayBudgetExceedsPay && (
            <Alert variant="warning" className="mb-3">
              Total PAYDAY tracker budgets ($
              {formatMoney(totalPaydayBudgetCents)}) exceed your pay amount ($
              {formatMoney(payAmountCents!)}). Consider adjusting budgets or pay
              amount in Settings.
            </Alert>
          )}
          {trackers.length === 0 ? (
            <p className="text-muted small mb-0">
              No trackers yet. Add one to get started.
            </p>
          ) : (
            <div
              className="d-flex flex-column gap-3"
              style={{ paddingBottom: '0.75rem' }}
            >
              {[...trackers]
                .sort(
                  (a, b) =>
                    FREQUENCY_ORDER.indexOf(
                      a.reset_frequency as TrackerResetFrequency
                    ) -
                    FREQUENCY_ORDER.indexOf(
                      b.reset_frequency as TrackerResetFrequency
                    )
                )
                .map((t) => {
                  const effectiveData = effectiveDataByTrackerId[t.id] ?? {
                    spent: t.spent,
                    budget: t.effectiveBudget,
                    remaining: t.remaining,
                    progress: t.progress,
                    daysLeft: t.daysLeft,
                    dateRangeLabel: '',
                    wasAdjusted: t.wasAdjustedThisPeriod,
                    isNativePeriod: false,
                  }
                  const progressStyle = getTrackerProgressStyle(
                    effectiveData.progress
                  )
                  const periodTxEntry = periodTxsByTrackerId[t.id]
                  const periodTxs = periodTxEntry?.list ?? []
                  const periodTxsHasMore = periodTxEntry?.hasMore ?? false
                  const displayPeriodLabel =
                    DISPLAY_PERIODS.find(
                      (p) => p.value === displayPeriod
                    )?.label?.toLowerCase() ?? 'period'
                  const daysTooltipText = `${effectiveData.daysLeft} days left in this ${displayPeriodLabel}`
                  return (
                    <Fragment key={t.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.name}, edit tracker`}
                        onClick={() => openEdit(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEdit(t)
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="d-flex justify-content-between align-items-start">
                          <strong>{t.name}</strong>
                          <div className="d-flex gap-1 align-items-center">
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id={`trackers-analytics-${t.id}`}>
                                  View analytics for {t.name}
                                </Tooltip>
                              }
                            >
                              <Link
                                to={`/analytics/trackers/${t.id}`}
                                className="btn-icon"
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`View analytics for ${t.name}`}
                              >
                                <i className="mdi mdi-chart-line" aria-hidden />
                              </Link>
                            </OverlayTrigger>
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id={`trackers-days-tooltip-${t.id}`}>
                                  {daysTooltipText}
                                </Tooltip>
                              }
                            >
                              <span className="badge badge-meta">
                                {effectiveData.daysLeft} days
                              </span>
                            </OverlayTrigger>
                          </div>
                        </div>
                        {effectiveData.spent > effectiveData.budget ? (
                          <h6 className="text-danger mt-1 text-end">
                            $
                            {formatMoney(
                              effectiveData.spent - effectiveData.budget
                            )}{' '}
                            over budget
                          </h6>
                        ) : (
                          <h6
                            className={`text-${progressStyle.variant} mt-1 text-end`}
                          >
                            ${formatMoney(effectiveData.remaining)} left
                          </h6>
                        )}
                        <ProgressBar
                          now={Math.min(100, effectiveData.progress)}
                          variant={progressStyle.variant}
                          striped={progressStyle.striped}
                          animated={progressStyle.animated}
                          label={`${Math.round(effectiveData.progress)}%`}
                        />
                      </div>
                      <div
                        className="d-flex justify-content-between align-items-center"
                        role="button"
                        tabIndex={0}
                        aria-label={
                          expandedId === t.id
                            ? 'Collapse transactions'
                            : 'View transactions for this period'
                        }
                        onClick={() => {
                          setExpandedId(expandedId === t.id ? null : t.id)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setExpandedId(expandedId === t.id ? null : t.id)
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                        title="View transactions"
                      >
                        <small className="text-muted">
                          ${formatMoney(effectiveData.spent)} of $
                          {formatMoney(effectiveData.budget)} spent
                          {effectiveData.wasAdjusted && (
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id={`trackers-adjusted-${t.id}`}>
                                  Budget or categories changed during this
                                  period. Each part of the period is judged
                                  against the settings that applied then.
                                </Tooltip>
                              }
                            >
                              <span className="ms-1 text-muted">
                                <i
                                  className="mdi mdi-tune-variant"
                                  aria-label="adjusted mid-period"
                                />
                              </span>
                            </OverlayTrigger>
                          )}
                        </small>
                        {effectiveData.dateRangeLabel && (
                          <span className="small text-muted text-end">
                            {effectiveData.dateRangeLabel}
                          </span>
                        )}
                      </div>
                      <Collapse in={expandedId === t.id}>
                        <div className="mt-2 small">
                          {periodTxs.length === 0 ? (
                            <span className="text-muted">
                              No transactions this period
                            </span>
                          ) : (
                            <>
                              <ul className="list-unstyled mb-0">
                                {periodTxs.map((tx) => (
                                  <li key={tx.id}>
                                    {formatShortDate(
                                      tx.created_at ?? tx.settled_at ?? ''
                                    )}{' '}
                                    {tx.description} $
                                    {formatMoney(Math.abs(tx.amount))}
                                    {tx.status === 'HELD' && (
                                      <span className="text-muted small ms-1">
                                        (Held)
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                              {periodTxsHasMore && (
                                <div className="text-muted mt-1">
                                  Showing first 20 —{' '}
                                  <Link
                                    to={`/analytics/trackers/${t.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    view all in analytics
                                  </Link>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </Collapse>
                    </Fragment>
                  )
                })}
            </div>
          )}
        </Card.Body>
      </Card>

      <Modal
        show={showModal}
        onHide={() => setShowModal(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {editingId != null ? 'Edit tracker' : 'Add tracker'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="tracker-edit-name">Name</Form.Label>
              <Form.Control
                id="tracker-edit-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Food & Drink"
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="tracker-edit-budget">Budget ($)</Form.Label>
              <Form.Control
                id="tracker-edit-budget"
                name="budget"
                type="number"
                step="0.01"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label htmlFor="tracker-edit-frequency">
                Frequency
              </Form.Label>
              <Form.Select
                id="tracker-edit-frequency"
                name="frequency"
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as TrackerResetFrequency)
                }
              >
                {RESET_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            {frequency !== 'PAYDAY' && (
              <Form.Group className="mb-2">
                <Form.Label htmlFor="tracker-edit-reset-day">
                  Reset day
                </Form.Label>
                <Form.Select
                  id="tracker-edit-reset-day"
                  name="resetDay"
                  value={resetDay}
                  onChange={(e) => setResetDay(Number(e.target.value))}
                >
                  {resetDayOptions.map((d) => (
                    <option key={d} value={d}>
                      {frequency === 'MONTHLY'
                        ? `${d}`
                        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][
                            d - 1
                          ]}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}
            {modalPaydayExceedsPay && (
              <Alert variant="warning" className="mb-2">
                Total PAYDAY budgets will be ${formatMoney(newTotalPaydayCents)}{' '}
                (pay amount ${formatMoney(payAmountCents!)}).
              </Alert>
            )}
            <Form.Group className="mb-2">
              <Form.Label>Categories</Form.Label>
              <div
                className="border rounded p-2"
                style={{ maxHeight: 160, overflowY: 'auto' }}
              >
                {categories.map((c) => {
                  const isSelected = selectedCategoryIds.includes(c.id)
                  const takenBy = categoryUsage[c.id]
                  return (
                    <Form.Check
                      key={c.id}
                      type="checkbox"
                      id={`cat-${c.id}`}
                      label={
                        <>
                          {c.name}
                          {takenBy && !isSelected && (
                            <span className="text-muted small ms-1">
                              (already in: {takenBy})
                            </span>
                          )}
                        </>
                      }
                      checked={isSelected}
                      disabled={!!takenBy && !isSelected}
                      onChange={() => toggleCategory(c.id)}
                    />
                  )
                })}
              </div>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          {editingId != null && (
            <Button
              variant="outline-danger"
              className="me-auto"
              onClick={() => handleDelete(editingId)}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
