import { Fragment, useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { Link } from 'react-router-dom'
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
  getTrackersWithProgress,
  getTrackersWithProgressForPeriod,
  getTrackerTransactionsInPeriod,
  getTrackerCategoryIds,
  getTrackerCategoryUsage,
  getTrackersList,
  createTracker,
  updateTracker,
  deleteTracker,
  type TrackerResetFrequency,
} from '@/services/trackers'
import { getCategories } from '@/services/categories'
import { getPayAmountCents } from '@/services/balance'
import { getAppSetting } from '@/db'
import { formatMoney, formatShortDate } from '@/lib/format'
import { toast } from '@/stores/toastStore'
import { syncStore } from '@/stores/syncStore'
import { HelpPopover } from '@/components/HelpPopover'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'
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

type FrequencyScope = 'ALL' | TrackerResetFrequency

const FREQUENCY_SCOPE_OPTIONS: { value: FrequencyScope; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PAYDAY', label: 'Payday' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'FORTNIGHTLY', label: 'Fortnightly' },
  { value: 'MONTHLY', label: 'Monthly' },
]

function periodOffsetPhrase(offset: number): string {
  if (offset === 0) return 'Current period'
  if (offset === -1) return 'Previous period'
  return `${-offset} periods ago`
}

function formatOrdinalDayMonth(isoDate: string): string {
  const d = new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00Z' : ''))
  if (Number.isNaN(d.getTime())) return isoDate
  const day = d.getUTCDate()
  const mod100 = day % 100
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th'
  const month = d.toLocaleDateString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  })
  return `${day}${suffix} ${month}`
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
  const [selectedFrequencyScope, setSelectedFrequencyScope] =
    useState<FrequencyScope>('ALL')
  const [offsetByScope, setOffsetByScope] = useState<
    Record<FrequencyScope, number>
  >({
    ALL: 0,
    PAYDAY: 0,
    WEEKLY: 0,
    FORTNIGHTLY: 0,
    MONTHLY: 0,
  })
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)

  const trackerList = useMemo(
    () => getTrackersList(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, lastSyncCompletedAt]
  )
  const usedFrequencies = new Set(
    trackerList.map((t) => t.reset_frequency as TrackerResetFrequency)
  )
  const visibleScopeOptions = FREQUENCY_SCOPE_OPTIONS.filter((opt) =>
    opt.value === 'ALL'
      ? trackerList.length > 0
      : usedFrequencies.has(opt.value as TrackerResetFrequency)
  )

  useEffect(() => {
    if (trackerList.length === 0) return
    const used = new Set(
      trackerList.map((t) => t.reset_frequency as TrackerResetFrequency)
    )
    const allowed = new Set<FrequencyScope>(['ALL'])
    for (const f of used) allowed.add(f)
    if (!allowed.has(selectedFrequencyScope)) {
      setSelectedFrequencyScope('ALL')
    }
  }, [trackerList, selectedFrequencyScope])

  const activePeriodOffset = offsetByScope[selectedFrequencyScope]
  const resetActiveScopeToCurrentPeriod = () =>
    setOffsetByScope((prev) => ({ ...prev, [selectedFrequencyScope]: 0 }))
  const trackers = useMemo(
    () => getTrackersWithProgressForPeriod(activePeriodOffset),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePeriodOffset, refresh, lastSyncCompletedAt]
  )
  const visibleTrackers = useMemo(
    () =>
      selectedFrequencyScope === 'ALL'
        ? trackers
        : trackers.filter((t) => t.reset_frequency === selectedFrequencyScope),
    [trackers, selectedFrequencyScope]
  )
  const categories = useMemo(
    () => getCategories(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, lastSyncCompletedAt]
  )
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
    for (const t of visibleTrackers) {
      map[t.id] = getTrackerTransactionsInPeriod(t.id, activePeriodOffset)
    }
    return map
  }, [visibleTrackers, activePeriodOffset, refresh])
  const paydayBudgetExceedsPay =
    payAmountCents != null &&
    payAmountCents > 0 &&
    totalPaydayBudgetCents > payAmountCents

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
          content="Set a budget and reset frequency (Weekly, Fortnightly, Monthly, or Payday). Assign categories to each tracker. Use the frequency tabs to focus on one cadence at a time. Previous/Next moves the selected tab's period only, so you can browse Weekly, Payday, or Monthly history independently."
          ariaLabel="What are trackers?"
        />
      </div>
    </div>
  )

  const periodNavButtons = (
    <>
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip id="trackers-prev-tooltip">Previous period</Tooltip>}
      >
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() =>
            setOffsetByScope((prev) => ({
              ...prev,
              [selectedFrequencyScope]: prev[selectedFrequencyScope] - 1,
            }))
          }
          aria-label="Previous period"
        >
          <i className="mdi mdi-chevron-left" aria-hidden />
        </Button>
      </OverlayTrigger>
      <OverlayTrigger
        placement="top"
        overlay={
          <Tooltip id="trackers-today-tooltip">Go to current period</Tooltip>
        }
      >
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={resetActiveScopeToCurrentPeriod}
          disabled={activePeriodOffset === 0}
          aria-label="Go to current period"
        >
          <i className="mdi mdi-calendar-today" aria-hidden />
        </Button>
      </OverlayTrigger>
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip id="trackers-next-tooltip">Next period</Tooltip>}
      >
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() =>
            setOffsetByScope((prev) => ({
              ...prev,
              [selectedFrequencyScope]: Math.min(
                0,
                prev[selectedFrequencyScope] + 1
              ),
            }))
          }
          disabled={activePeriodOffset >= 0}
          aria-label="Next period"
        >
          <i className="mdi mdi-chevron-right" aria-hidden />
        </Button>
      </OverlayTrigger>
    </>
  )

  return (
    <>
      <Card>
        <Card.Header className="d-flex flex-column gap-2 section-header">
          {isMobile ? (
            <>
              <div className="d-flex align-items-center justify-content-between">
                {titleBlock}
                <div className="d-flex gap-1">
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
                      className="btn btn-outline-secondary btn-sm"
                      aria-label="View tracker analytics"
                    >
                      <i className="mdi mdi-chart-box" aria-hidden />
                    </Link>
                  </OverlayTrigger>
                  <OverlayTrigger
                    placement="top"
                    overlay={
                      <Tooltip id="trackers-add-tooltip">Add tracker</Tooltip>
                    }
                  >
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={openCreate}
                      aria-label="Add tracker"
                    >
                      <i className="mdi mdi-plus" aria-hidden />
                    </Button>
                  </OverlayTrigger>
                </div>
              </div>
              <div className="d-flex justify-content-center gap-2">
                {periodNavButtons}
              </div>
            </>
          ) : (
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="d-flex align-items-center">
                {titleBlock}
                <OverlayTrigger
                  placement="top"
                  overlay={
                    <Tooltip id="trackers-analytics-header-tooltip-desktop">
                      View tracker analytics
                    </Tooltip>
                  }
                >
                  <Link
                    to="/analytics/trackers"
                    className="btn btn-outline-secondary btn-sm ms-2"
                    aria-label="View tracker analytics"
                  >
                    <i className="mdi mdi-chart-box" aria-hidden />
                  </Link>
                </OverlayTrigger>
              </div>
              <div className="d-flex gap-1 align-items-center flex-nowrap ms-auto">
                {periodNavButtons}
                <OverlayTrigger
                  placement="top"
                  overlay={
                    <Tooltip id="trackers-add-tooltip">Add tracker</Tooltip>
                  }
                >
                  <Button
                    variant="primary"
                    size="sm"
                    className="ms-2"
                    onClick={openCreate}
                    aria-label="Add tracker"
                  >
                    <i className="mdi mdi-plus" aria-hidden />
                  </Button>
                </OverlayTrigger>
              </div>
            </div>
          )}
          {visibleScopeOptions.length > 0 && (
            <div className="d-flex justify-content-center mt-1">
              <div
                className="btn-group btn-group-sm flex-wrap"
                role="group"
                aria-label="Select tracker frequency view"
              >
                {visibleScopeOptions.map((scope) => (
                  <button
                    key={scope.value}
                    type="button"
                    className={`btn btn-outline-secondary ${
                      selectedFrequencyScope === scope.value ? 'active' : ''
                    }`}
                    onClick={() => setSelectedFrequencyScope(scope.value)}
                    aria-pressed={selectedFrequencyScope === scope.value}
                  >
                    {scope.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {trackers.length > 0 && (
            <div
              className="small text-muted text-center mt-1 px-2"
              aria-live="polite"
            >
              {selectedFrequencyScope !== 'ALL' ? (
                visibleTrackers[0]?.period_start &&
                visibleTrackers[0]?.period_end ? (
                  <>
                    {FREQUENCY_SCOPE_OPTIONS.find(
                      (o) => o.value === selectedFrequencyScope
                    )?.label ?? ''}{' '}
                    period
                    {activePeriodOffset !== 0 && (
                      <> ({periodOffsetPhrase(activePeriodOffset)})</>
                    )}
                    : {formatOrdinalDayMonth(visibleTrackers[0].period_start)} -{' '}
                    {formatOrdinalDayMonth(visibleTrackers[0].period_end)}
                  </>
                ) : null
              ) : (
                <>
                  <div className="mb-1">
                    {periodOffsetPhrase(activePeriodOffset)}
                  </div>
                  {FREQUENCY_ORDER.map((freq) => {
                    const sample = trackers.find(
                      (tr) => tr.reset_frequency === freq
                    )
                    if (!sample?.period_start || !sample?.period_end)
                      return null
                    const label =
                      RESET_FREQUENCIES.find((f) => f.value === freq)?.label ??
                      freq
                    return (
                      <div key={freq}>
                        {label}: {formatOrdinalDayMonth(sample.period_start)} -{' '}
                        {formatOrdinalDayMonth(sample.period_end)}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}
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
          {visibleTrackers.length === 0 ? (
            <p className="text-muted small mb-0">
              {selectedFrequencyScope === 'ALL'
                ? 'No trackers yet. Add one to get started.'
                : `No ${selectedFrequencyScope.toLowerCase()} trackers yet.`}
            </p>
          ) : (
            <div
              className="d-flex flex-column gap-3"
              style={{ paddingBottom: '0.75rem' }}
            >
              {[...visibleTrackers]
                .sort(
                  (a, b) =>
                    FREQUENCY_ORDER.indexOf(
                      a.reset_frequency as TrackerResetFrequency
                    ) -
                    FREQUENCY_ORDER.indexOf(
                      b.reset_frequency as TrackerResetFrequency
                    )
                )
                .map((t, index, sorted) => {
                  const showGroupLabel =
                    selectedFrequencyScope === 'ALL' &&
                    (index === 0 ||
                      sorted[index - 1].reset_frequency !== t.reset_frequency)
                  const groupLabel = RESET_FREQUENCIES.find(
                    (f) => f.value === t.reset_frequency
                  )?.label
                  const progressStyle = getTrackerProgressStyle(t.progress)
                  const frequencyLabel =
                    RESET_FREQUENCIES.find((f) => f.value === t.reset_frequency)
                      ?.label ?? t.reset_frequency
                  const periodRangeText =
                    t.period_start && t.period_end
                      ? `${formatShortDate(t.period_start)} – ${formatShortDate(t.period_end)}`
                      : ''
                  const periodTxEntry = periodTxsByTrackerId[t.id]
                  const periodTxs = periodTxEntry?.list ?? []
                  const periodTxsHasMore = periodTxEntry?.hasMore ?? false
                  const daysTooltipText = periodRangeText
                    ? `${t.daysLeft} days left in this ${frequencyLabel.toLowerCase()} period (${periodRangeText})`
                    : `${t.daysLeft} days left in this ${frequencyLabel.toLowerCase()} period`
                  return (
                    <Fragment key={t.id}>
                      {showGroupLabel && (
                        <>
                          {index > 0 && (
                            <hr className="my-2 border-secondary" />
                          )}
                          {/* Section heading for this frequency group (Payday, Weekly, etc.) */}
                          <h6
                            className={`text-center fw-semibold text-muted text-uppercase small mb-2${index > 0 ? ' mt-2' : ''}`}
                            id={`tracker-group-${t.reset_frequency}`}
                          >
                            {groupLabel}
                          </h6>
                        </>
                      )}
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
                                className="btn btn-link btn-sm p-0 text-primary"
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`View analytics for ${t.name}`}
                              >
                                <i className="mdi mdi-chart-line" aria-hidden />
                              </Link>
                            </OverlayTrigger>
                            {t.badge_color && t.badge_color.trim() ? (
                              <span
                                className="badge badge-frequency-custom"
                                style={{
                                  backgroundColor: t.badge_color.trim(),
                                  color: 'white',
                                }}
                              >
                                {frequencyLabel}
                              </span>
                            ) : (
                              <span className="badge badge-frequency-default">
                                {frequencyLabel}
                              </span>
                            )}
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id={`trackers-days-tooltip-${t.id}`}>
                                  {daysTooltipText}
                                </Tooltip>
                              }
                            >
                              <span className="badge badge-meta">
                                {t.daysLeft} days
                              </span>
                            </OverlayTrigger>
                          </div>
                        </div>
                        {t.spent > t.budget_amount ? (
                          <h6 className="text-danger mt-1 text-end">
                            ${formatMoney(t.spent - t.budget_amount)} over
                            budget
                          </h6>
                        ) : (
                          <h6
                            className={`text-${progressStyle.variant} mt-1 text-end`}
                          >
                            ${formatMoney(t.remaining)} left
                          </h6>
                        )}
                        <ProgressBar
                          now={Math.min(100, t.progress)}
                          variant={progressStyle.variant}
                          striped={progressStyle.striped}
                          animated={progressStyle.animated}
                          label={`${Math.round(t.progress)}%`}
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
                          ${formatMoney(t.spent)} of $
                          {formatMoney(t.budget_amount)} spent
                        </small>
                        {t.period_start && t.period_end && (
                          <span className="small text-muted text-end">
                            {formatShortDate(t.period_start)} –{' '}
                            {formatShortDate(t.period_end)}
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
                Reset frequency
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
                          className="mdi mdi-check text-white"
                          style={{
                            fontSize: '1rem',
                            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                          }}
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
