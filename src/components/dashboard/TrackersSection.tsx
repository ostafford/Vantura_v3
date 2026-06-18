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
  getTrackersWithProgress,
  getTrackersWithProgressForPeriod,
  getTrackerTransactionsInPeriod,
  getTrackerSpentInPeriod,
  getTrackerCategoryIds,
  getTrackerCategoryUsage,
  createTracker,
  updateTracker,
  deleteTracker,
  type TrackerResetFrequency,
} from '@/services/trackers'
import { getCategories } from '@/services/categories'
import { getPayAmountCents } from '@/services/balance'
import { getAppSetting } from '@/db'
import {
  toPeriodCents,
  type BudgetDisplayPeriod,
} from '@/lib/monthlyEquivalent'
import { formatMoney, formatShortDate } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import { syncStore } from '@/stores/syncStore'
import { HelpPopover } from '@/components/HelpPopover'
import { ACCENT_PALETTES, type AccentId } from '@/lib/accentPalettes'
import type React from 'react'

const BADGE_COLOR_SWATCHES = (Object.keys(ACCENT_PALETTES) as AccentId[]).map(
  (id) => ACCENT_PALETTES[id].primary
)

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

// period_end is exclusive (the reset date / first day of next period), so subtract
// one day to get the last inclusive day for display purposes.
function displayPeriodEnd(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

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

function getCalendarPeriodBounds(period: BudgetDisplayPeriod): {
  from: string
  to: string
  label: string
} {
  const today = new Date()
  if (period === 'WEEKLY') {
    const day = today.getUTCDay()
    const daysFromMonday = (day + 6) % 7
    const monday = new Date(today)
    monday.setUTCDate(today.getUTCDate() - daysFromMonday)
    const nextMonday = new Date(monday)
    nextMonday.setUTCDate(monday.getUTCDate() + 7)
    return {
      from: monday.toISOString().slice(0, 10),
      to: nextMonday.toISOString().slice(0, 10),
      label: `${formatShortDate(monday.toISOString().slice(0, 10))} – ${formatShortDate(new Date(nextMonday.getTime() - 86400000).toISOString().slice(0, 10))}`,
    }
  }
  if (period === 'YEARLY') {
    const year = today.getUTCFullYear()
    return {
      from: `${year}-01-01`,
      to: `${year + 1}-01-01`,
      label: String(year),
    }
  }
  // MONTHLY: calendar month
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  const from = new Date(Date.UTC(year, month, 1))
  const to = new Date(Date.UTC(year, month + 1, 1))
  const toDisplay = new Date(to.getTime() - 86400000)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label: `${formatShortDate(from.toISOString().slice(0, 10))} – ${formatShortDate(toDisplay.toISOString().slice(0, 10))}`,
  }
}

function calendarDaysLeft(toExclusive: string): number {
  const today = new Date().toISOString().slice(0, 10)
  const a = new Date(today + 'T12:00:00Z').getTime()
  const b = new Date(toExclusive + 'T12:00:00Z').getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

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
  const [badgeColor, setBadgeColor] = useState<string | null>(null)
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
    () =>
      getTrackersWithProgress()
        .filter((t) => t.reset_frequency === 'PAYDAY')
        .reduce((sum, t) => sum + t.budget_amount, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, lastSyncCompletedAt]
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
  const effectiveDataByTrackerId = useMemo(() => {
    const map: Record<
      number,
      {
        spent: number
        budget: number
        remaining: number
        progress: number
        daysLeft: number
        dateRangeLabel: string
      }
    > = {}
    for (const t of trackers) {
      const nativeMatch =
        (displayPeriod === 'WEEKLY' && t.reset_frequency === 'WEEKLY') ||
        (displayPeriod === 'MONTHLY' && t.reset_frequency === 'MONTHLY')
      let spent: number
      let budget: number
      let daysLeft: number
      let dateRangeLabel: string
      if (nativeMatch) {
        spent = t.spent
        budget = t.budget_amount
        daysLeft = t.daysLeft
        dateRangeLabel =
          t.period_start && t.period_end
            ? `${formatShortDate(t.period_start)} – ${formatShortDate(displayPeriodEnd(t.period_end))}`
            : ''
      } else {
        const bounds = getCalendarPeriodBounds(displayPeriod)
        spent = getTrackerSpentInPeriod(t.id, bounds.from, bounds.to)
        const freq =
          t.reset_frequency === 'PAYDAY' ? 'MONTHLY' : t.reset_frequency
        budget = toPeriodCents(t.budget_amount, freq, displayPeriod)
        daysLeft = calendarDaysLeft(bounds.to)
        dateRangeLabel = bounds.label
      }
      const remaining = Math.max(0, budget - spent)
      const progress = budget > 0 ? (spent / budget) * 100 : 0
      map[t.id] = {
        spent,
        budget,
        remaining,
        progress,
        daysLeft,
        dateRangeLabel,
      }
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackers, displayPeriod, refresh, lastSyncCompletedAt])

  function openCreate() {
    setEditingId(null)
    setName('')
    setBudget('')
    setFrequency('WEEKLY')
    setResetDay(1)
    setSelectedCategoryIds([])
    setBadgeColor(null)
    setCategoryUsage(getTrackerCategoryUsage(null))
    setShowModal(true)
  }

  function openEdit(t: {
    id: number
    name: string
    budget_amount: number
    reset_frequency: string
    reset_day: number | null
    badge_color?: string | null
  }) {
    setEditingId(t.id)
    setName(t.name)
    setBudget(String(t.budget_amount / 100))
    setFrequency(t.reset_frequency as TrackerResetFrequency)
    setResetDay(t.reset_day ?? 1)
    setSelectedCategoryIds(getTrackerCategoryIds(t.id))
    setBadgeColor(t.badge_color ?? null)
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
          selectedCategoryIds,
          badgeColor
        )
        toast.success('Tracker saved.')
      } else {
        createTracker(
          name.trim(),
          budgetCents,
          frequency,
          resetDay,
          selectedCategoryIds,
          badgeColor
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
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const resetDayOptions =
    frequency === 'MONTHLY'
      ? Array.from({ length: 28 }, (_, i) => i + 1)
      : [1, 2, 3, 4, 5, 6, 7]

  const budgetCentsForModal = Math.round(parseFloat(budget || '0') * 100)
  const otherPaydayBudgetCents =
    editingId != null
      ? trackers
          .filter((t) => t.reset_frequency === 'PAYDAY' && t.id !== editingId)
          .reduce((sum, t) => sum + t.budget_amount, 0)
      : totalPaydayBudgetCents
  const newTotalPaydayCents = otherPaydayBudgetCents + budgetCentsForModal
  const modalPaydayExceedsPay =
    frequency === 'PAYDAY' &&
    payAmountCents != null &&
    payAmountCents > 0 &&
    budgetCentsForModal > 0 &&
    newTotalPaydayCents > payAmountCents

  const titleBlock = (
    <div className="d-flex align-items-center">
      <span
        className="page-title-icon bg-gradient-primary text-white mr-2"
        {...dragHandleProps}
      >
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
                    budget: t.budget_amount,
                    remaining: t.remaining,
                    progress: t.progress,
                    daysLeft: t.daysLeft,
                    dateRangeLabel: '',
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
            <Form.Group className="mb-2">
              <Form.Label>Frequency badge colour</Form.Label>
              <div className="d-flex flex-wrap gap-2 align-items-center">
                {BADGE_COLOR_SWATCHES.map((hex) => {
                  const isSelected = badgeColor === hex
                  return (
                    <button
                      key={hex}
                      type="button"
                      className="border rounded-circle p-0 d-flex align-items-center justify-content-center"
                      style={{
                        width: 32,
                        height: 32,
                        background: hex,
                        borderWidth: isSelected ? 3 : 1,
                        borderColor: isSelected
                          ? 'var(--vantura-text)'
                          : 'var(--vantura-border)',
                      }}
                      onClick={() => setBadgeColor(hex)}
                      aria-label={`Select badge colour ${hex}`}
                      aria-pressed={isSelected}
                    >
                      {isSelected && (
                        <i
                          className="mdi mdi-check"
                          style={{ fontSize: '1rem', color: '#1a1a2e' }}
                          aria-hidden
                        />
                      )}
                    </button>
                  )
                })}
                {badgeColor != null && (
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-muted"
                    onClick={() => setBadgeColor(null)}
                    aria-label="Use default badge colour"
                  >
                    Use default
                  </button>
                )}
              </div>
            </Form.Group>
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
                {categories.map((c) => (
                  <Form.Check
                    key={c.id}
                    type="checkbox"
                    id={`cat-${c.id}`}
                    label={
                      <>
                        {c.name}
                        {categoryUsage[c.id] && (
                          <span className="text-warning small ms-1">
                            (in: {categoryUsage[c.id]})
                          </span>
                        )}
                      </>
                    }
                    checked={selectedCategoryIds.includes(c.id)}
                    onChange={() => toggleCategory(c.id)}
                  />
                ))}
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
