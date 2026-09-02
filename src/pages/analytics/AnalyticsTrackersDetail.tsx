import { useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { useParams, Link } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Button,
  Form,
  Badge,
  ProgressBar,
} from 'react-bootstrap'
import {
  getTracker,
  getTrackerPeriodHistory,
  getTrackerTransactionTimeline,
  getTrackerTransactionsForTable,
  getTrackerTransactionsCount,
  getTrackerCategoryIds,
  getTrackerConfigHistory,
  type TrackerResetFrequency,
  type TrackerPeriodHistoryRow,
} from '@/services/trackers'
import { type BudgetDisplayPeriod } from '@/lib/monthlyEquivalent'
import { getCategories } from '@/services/categories'
import {
  formatMoney,
  formatDate,
  formatShortDate,
  formatShortDateWithYear,
  localDateString,
} from '@/lib/format'
import { addDaysToDateStr, daysBetweenDateStr } from '@/lib/dateStr'
import { buildCalendarPeriodHistory } from './trackerPeriodHistory'
import { TrackerHistoryChart } from '@/components/charts/TrackerHistoryChart'
import { TrackerPaceChart } from '@/components/charts/TrackerPaceChart'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'
import { syncStore } from '@/stores/syncStore'

const DISPLAY_PERIODS: { value: BudgetDisplayPeriod; label: string }[] = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
]

const PERIOD_OPTIONS = [
  { value: 3, label: 'Last 3 periods' },
  { value: 6, label: 'Last 6 periods' },
  { value: 12, label: 'Last 12 periods' },
]

const PAGE_SIZE = 20

const daysBetween = daysBetweenDateStr

// period_end is exclusive (first day of next period) — subtract one day for display.
function displayPeriodEnd(isoDate: string): string {
  return addDaysToDateStr(isoDate, -1)
}

export function AnalyticsTrackersDetail() {
  const { trackerId } = useParams<{ trackerId: string }>()
  const [displayPeriod, setDisplayPeriod] =
    useState<BudgetDisplayPeriod>('MONTHLY')
  const [periodsBack, setPeriodsBack] = useState(6)
  const [paceOffset, setPaceOffset] = useState(0)
  const [page, setPage] = useState(0)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const periodInitialized = useRef(false)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)

  // Local calendar date — feeds the pace math (`daysElapsed` / `daysLeft`) and
  // the `today` marker on the pace chart. UTC here reads a day stale for
  // UTC+10/+11 users in the early-morning-local window (#56).
  const today = localDateString()

  const id = trackerId != null ? parseInt(trackerId, 10) : NaN
  const tracker = useMemo(
    () => (Number.isNaN(id) ? null : getTracker(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, lastSyncCompletedAt]
  )

  const nativeMatch = useMemo(
    () =>
      tracker != null &&
      ((displayPeriod === 'WEEKLY' && tracker.reset_frequency === 'WEEKLY') ||
        (displayPeriod === 'MONTHLY' && tracker.reset_frequency === 'MONTHLY')),
    [tracker, displayPeriod]
  )

  // Reset initialization when display period changes so we re-derive default dates.
  useEffect(() => {
    periodInitialized.current = false
    setPaceOffset(0)
  }, [displayPeriod])

  const effectivePeriodHistory = useMemo((): TrackerPeriodHistoryRow[] => {
    if (!tracker) return []
    if (nativeMatch) {
      return getTrackerPeriodHistory(id, periodsBack)
    }
    return buildCalendarPeriodHistory(
      id,
      displayPeriod,
      periodsBack,
      tracker.budget_amount,
      tracker.reset_frequency as TrackerResetFrequency
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tracker,
    id,
    periodsBack,
    displayPeriod,
    nativeMatch,
    lastSyncCompletedAt,
  ])

  const currentPeriod = useMemo(
    () => effectivePeriodHistory.find((p) => p.periodOffset === 0) ?? null,
    [effectivePeriodHistory]
  )

  // #17 — informational "came in under / over budget" for the most recently
  // completed period. Only when there was real spend, so a pre-creation
  // fabricated period can't read as a $0-spend "win".
  const lastCompletedPeriod = useMemo(
    () =>
      effectivePeriodHistory.find(
        (p) => p.periodOffset === -1 && p.spent > 0
      ) ?? null,
    [effectivePeriodHistory]
  )

  // Initialise date filter when period data loads; re-initialise when display period changes.
  useEffect(() => {
    if (currentPeriod && !periodInitialized.current) {
      periodInitialized.current = true
      setDateFrom(currentPeriod.periodStart.slice(0, 10))
      setDateTo(displayPeriodEnd(currentPeriod.periodEnd))
      setPage(0)
    }
  }, [currentPeriod])

  const selectedPacePeriod = useMemo(
    () =>
      effectivePeriodHistory.find((p) => p.periodOffset === paceOffset) ??
      (effectivePeriodHistory.length > 0
        ? effectivePeriodHistory[effectivePeriodHistory.length - 1]
        : null),
    [effectivePeriodHistory, paceOffset]
  )

  const paceData = useMemo(
    () =>
      selectedPacePeriod
        ? getTrackerTransactionTimeline(id, {
            dateFrom: selectedPacePeriod.periodStart,
            dateTo: selectedPacePeriod.periodEnd,
            limit: 500,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracker, id, selectedPacePeriod, lastSyncCompletedAt]
  )

  const dateFilter = useMemo(() => {
    const f: { dateFrom?: string; dateTo?: string } = {}
    if (dateFrom) f.dateFrom = dateFrom
    if (dateTo) f.dateTo = dateTo
    return f
  }, [dateFrom, dateTo])

  const tableTransactions = useMemo(
    () =>
      tracker
        ? getTrackerTransactionsForTable(id, {
            ...dateFilter,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracker, id, dateFilter, page, lastSyncCompletedAt]
  )

  const totalTransactions = useMemo(
    () => (tracker ? getTrackerTransactionsCount(id, dateFilter) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracker, id, dateFilter, lastSyncCompletedAt]
  )

  const categories = getCategories()
  const categoryIds = tracker ? getTrackerCategoryIds(id) : []
  const categoryNames = categoryIds
    .map((cid) => categories.find((c) => c.id === cid)?.name)
    .filter(Boolean)
    .join(', ')

  // #16 Phase 2 — read-only config timeline, newest first. A single genesis
  // row means the tracker has never been reconfigured, so there's nothing to
  // show; the card only appears once there's real history.
  const configHistory = useMemo(() => {
    if (!tracker) return []
    return [...getTrackerConfigHistory(id)].reverse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker, id, lastSyncCompletedAt])

  // `categories` is re-fetched unmemoized each render, so a useMemo keyed on it
  // would rebuild every time anyway — just build the lookup inline.
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))

  const maxDomainPeriod = useMemo(() => {
    if (effectivePeriodHistory.length === 0) return undefined
    return Math.max(
      ...effectivePeriodHistory.flatMap((d) => [d.budget, d.spent]),
      100
    )
  }, [effectivePeriodHistory])

  const totalPages = Math.ceil(totalTransactions / PAGE_SIZE)

  // Current period pace stats
  const paceStats = useMemo(() => {
    if (!currentPeriod) return null
    const { spent, budget, periodStart, periodEnd } = currentPeriod
    const totalDays = Math.max(1, daysBetween(periodStart, periodEnd))
    const daysElapsed = Math.max(1, daysBetween(periodStart, today))
    const daysLeft = Math.max(0, daysBetween(today, periodEnd))
    const dailyAllowed = budget / totalDays
    const dailyActual = spent / daysElapsed
    const overPace = dailyActual > dailyAllowed
    const overBudget = spent > budget
    return {
      spent,
      budget,
      remaining: Math.max(0, budget - spent),
      overBy: Math.max(0, spent - budget),
      progress: budget > 0 ? Math.min(100, (spent / budget) * 100) : 0,
      daysLeft,
      totalDays,
      dailyAllowed,
      dailyActual,
      overPace,
      overBudget,
      periodStart,
      periodEnd,
    }
  }, [currentPeriod, today])

  if (!trackerId || Number.isNaN(id)) {
    return (
      <Card className="grid-margin">
        <Card.Body>
          <p className="text-muted mb-0">Invalid tracker.</p>
          <Link to="/analytics/trackers" className="btn btn-link mt-2 p-0">
            Back to Trackers
          </Link>
        </Card.Body>
      </Card>
    )
  }

  if (!tracker) {
    return (
      <Card className="grid-margin">
        <Card.Body>
          <p className="text-muted mb-0">Tracker not found.</p>
          <Link to="/analytics/trackers" className="btn btn-link mt-2 p-0">
            Back to Trackers
          </Link>
        </Card.Body>
      </Card>
    )
  }

  return (
    <>
      <div className="d-flex align-items-start justify-content-between gap-2 mb-3">
        <div className="d-flex align-items-start gap-2">
          <Link
            to="/analytics/trackers"
            className="btn-icon flex-shrink-0"
            aria-label="Back to trackers"
          >
            <i className="mdi mdi-arrow-left" aria-hidden />
          </Link>
          <div className="small text-muted d-flex flex-wrap gap-2 align-items-center pt-1">
            {categoryNames && <span>Categories: {categoryNames}</span>}
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center flex-shrink-0">
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
          <Link
            to={`/?editTracker=${id}`}
            className="btn btn-outline-secondary btn-sm"
          >
            <i className="mdi mdi-pencil me-1" aria-hidden />
            Edit
          </Link>
        </div>
      </div>

      {/* Current Period Summary */}
      <Row className="grid-margin">
        <Col xs={12}>
          <Card>
            <Card.Header>
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <Card.Title className="mb-0">Current Period</Card.Title>
                {paceStats && (
                  <span className="small text-muted">
                    {formatShortDate(paceStats.periodStart)} –{' '}
                    {formatShortDate(displayPeriodEnd(paceStats.periodEnd))}
                  </span>
                )}
              </div>
            </Card.Header>
            <Card.Body>
              {!paceStats ? (
                <p className="text-muted mb-0">No data for current period.</p>
              ) : (
                <>
                  <ProgressBar
                    now={paceStats.progress}
                    variant={
                      paceStats.overBudget
                        ? 'danger'
                        : paceStats.overPace
                          ? 'warning'
                          : 'success'
                    }
                    style={{ height: 8 }}
                    className="mb-3"
                  />
                  <div className="d-flex flex-wrap gap-4 mb-2">
                    <div>
                      <div className="small text-muted">Spent</div>
                      <div className="fw-semibold">
                        ${formatMoney(paceStats.spent)}
                      </div>
                    </div>
                    <div>
                      <div className="small text-muted">Budget</div>
                      <div className="fw-semibold">
                        ${formatMoney(paceStats.budget)}
                      </div>
                    </div>
                    <div>
                      <div className="small text-muted">
                        {paceStats.overBudget ? 'Over by' : 'Remaining'}
                      </div>
                      <div
                        className={`fw-semibold${paceStats.overBudget ? ' text-danger' : ''}`}
                      >
                        $
                        {formatMoney(
                          paceStats.overBudget
                            ? paceStats.overBy
                            : paceStats.remaining
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="d-flex flex-wrap gap-3 align-items-center small text-muted">
                    <span>
                      {paceStats.daysLeft} day
                      {paceStats.daysLeft !== 1 ? 's' : ''} left
                    </span>
                    <span>·</span>
                    <span>
                      Spending ${formatMoney(paceStats.dailyActual)}/day
                    </span>
                    <span>·</span>
                    <span>
                      Allows ${formatMoney(paceStats.dailyAllowed)}/day
                    </span>
                    <Badge
                      bg={paceStats.overPace ? 'warning' : 'success'}
                      className={paceStats.overPace ? 'text-dark' : ''}
                    >
                      {paceStats.overPace ? 'Over pace' : 'On pace'}
                    </Badge>
                  </div>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Spend vs Budget by Period */}
      <Row className="grid-margin">
        <Col xs={12}>
          <Card>
            <Card.Header>
              <Card.Title className="mb-0">
                Spend vs Budget by Period
              </Card.Title>
              {lastCompletedPeriod && (
                <Card.Text
                  as="div"
                  className={`small mt-1 ${
                    lastCompletedPeriod.spent < lastCompletedPeriod.budget
                      ? 'text-success'
                      : 'text-muted'
                  }`}
                >
                  {lastCompletedPeriod.spent < lastCompletedPeriod.budget ? (
                    <>
                      <i className="mdi mdi-trophy-outline me-1" aria-hidden />
                      {lastCompletedPeriod.periodLabel}: came in $
                      {formatMoney(
                        lastCompletedPeriod.budget - lastCompletedPeriod.spent
                      )}{' '}
                      under budget
                    </>
                  ) : lastCompletedPeriod.spent > lastCompletedPeriod.budget ? (
                    <>
                      {lastCompletedPeriod.periodLabel}: $
                      {formatMoney(
                        lastCompletedPeriod.spent - lastCompletedPeriod.budget
                      )}{' '}
                      over budget
                    </>
                  ) : (
                    <>{lastCompletedPeriod.periodLabel}: exactly on budget</>
                  )}
                </Card.Text>
              )}
              <Form.Select
                value={periodsBack}
                onChange={(e) => setPeriodsBack(Number(e.target.value))}
                className="mt-2 w-auto"
                aria-label="Periods to show"
              >
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Form.Select>
            </Card.Header>
            <Card.Body>
              {effectivePeriodHistory.length === 0 ? (
                <p className="text-muted mb-0">No period data available.</p>
              ) : (
                <div style={{ width: '100%', height: isMobile ? 220 : 280 }}>
                  <TrackerHistoryChart
                    data={effectivePeriodHistory}
                    maxDomain={maxDomainPeriod}
                    aria-label="Tracker spend vs budget by period"
                  />
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Configuration history (#16 Phase 2) */}
      {configHistory.length > 1 && (
        <Row className="grid-margin">
          <Col xs={12}>
            <Card>
              <Card.Header>
                <Card.Title className="mb-0">Configuration history</Card.Title>
                <Card.Text as="div" className="small text-muted mt-1">
                  How this tracker&rsquo;s budget and categories have changed
                  over time, newest first.
                </Card.Text>
              </Card.Header>
              <Card.Body className="p-0">
                <div className="table-responsive">
                  <table className="table table-striped mb-0">
                    <thead>
                      <tr>
                        <th>Effective from</th>
                        <th className="text-end">Budget</th>
                        <th>Categories</th>
                      </tr>
                    </thead>
                    <tbody>
                      {configHistory.map((v, i) => (
                        <tr key={v.id}>
                          <td>
                            {formatShortDateWithYear(v.effective_from)}
                            {i === configHistory.length - 1 && (
                              <Badge bg="secondary" className="text-dark ms-2">
                                Initial
                              </Badge>
                            )}
                          </td>
                          <td className="text-end">
                            ${formatMoney(v.budget_amount)}
                          </td>
                          <td className="small">
                            {v.category_ids
                              .map((cid) => categoryNameById.get(cid))
                              .filter((n): n is string => n != null)
                              .sort((a, b) => a.localeCompare(b))
                              .join(', ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* Spending Pace */}
      <Row className="grid-margin">
        <Col xs={12}>
          <Card>
            <Card.Header>
              <Card.Title className="mb-0">Spending Pace</Card.Title>
              {effectivePeriodHistory.length > 0 && (
                <Form.Select
                  value={paceOffset}
                  onChange={(e) => setPaceOffset(Number(e.target.value))}
                  className="mt-2 w-auto"
                  aria-label="Period to view"
                >
                  {[...effectivePeriodHistory].reverse().map((p) => (
                    <option key={p.periodOffset} value={p.periodOffset}>
                      {p.periodLabel} ({formatDate(p.periodStart)} –{' '}
                      {formatDate(displayPeriodEnd(p.periodEnd))})
                    </option>
                  ))}
                </Form.Select>
              )}
            </Card.Header>
            <Card.Body>
              {!selectedPacePeriod ? (
                <p className="text-muted mb-0">No period data available.</p>
              ) : (
                <div style={{ width: '100%', height: isMobile ? 220 : 280 }}>
                  <TrackerPaceChart
                    data={paceData}
                    periodStart={selectedPacePeriod.periodStart}
                    periodEnd={selectedPacePeriod.periodEnd}
                    budget={selectedPacePeriod.budget}
                    isCurrentPeriod={selectedPacePeriod.periodOffset === 0}
                    today={today}
                    aria-label="Spending pace for selected period"
                  />
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Transactions */}
      <Row className="grid-margin">
        <Col xs={12}>
          <Card>
            <Card.Header>
              <Card.Title className="mb-0">Transactions</Card.Title>
              <Card.Text as="div" className="small text-muted mt-1">
                {totalTransactions} transaction(s)
                {(dateFrom || dateTo) && ' in selected date range'}
              </Card.Text>
              <div className="d-flex flex-wrap gap-2 mt-2">
                <Form.Control
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setPage(0)
                  }}
                  placeholder="From"
                  className="w-auto"
                  aria-label="Date from"
                />
                <Form.Control
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setPage(0)
                  }}
                  placeholder="To"
                  className="w-auto"
                  aria-label="Date to"
                />
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => {
                    if (currentPeriod) {
                      setDateFrom(currentPeriod.periodStart.slice(0, 10))
                      setDateTo(displayPeriodEnd(currentPeriod.periodEnd))
                    }
                    setPage(0)
                  }}
                >
                  Reset
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {tableTransactions.length === 0 ? (
                <p className="text-muted mb-0">No transactions.</p>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="table table-striped table-hover mb-0">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th className="text-center">Status</th>
                          <th className="text-end">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableTransactions.map((tx) => (
                          <tr key={tx.id}>
                            <td>{formatDate(tx.date)}</td>
                            <td>{tx.description || 'Unknown'}</td>
                            <td className="text-center">
                              <Badge
                                bg={
                                  tx.status === 'HELD' ? 'warning' : 'secondary'
                                }
                                className="text-dark"
                              >
                                {tx.status === 'HELD' ? 'Held' : 'Settled'}
                              </Badge>
                            </td>
                            <td className="text-end">
                              ${formatMoney(tx.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="d-flex justify-content-between align-items-center mt-3">
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                      >
                        Previous
                      </Button>
                      <span className="small text-muted">
                        Page {page + 1} of {totalPages}
                      </span>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page >= totalPages - 1}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  )
}
