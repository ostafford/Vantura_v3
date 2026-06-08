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
} from '@/services/trackers'
import { getCategories } from '@/services/categories'
import { formatMoney, formatDate } from '@/lib/format'
import { TrackerHistoryChart } from '@/components/charts/TrackerHistoryChart'
import { TrackerPaceChart } from '@/components/charts/TrackerPaceChart'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'
import { syncStore } from '@/stores/syncStore'

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  MONTHLY: 'Monthly',
  PAYDAY: 'Payday',
}

const PERIOD_OPTIONS = [
  { value: 3, label: 'Last 3 periods' },
  { value: 6, label: 'Last 6 periods' },
  { value: 12, label: 'Last 12 periods' },
]

const PAGE_SIZE = 20

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b.slice(0, 10) + 'T12:00:00Z').getTime() -
      new Date(a.slice(0, 10) + 'T12:00:00Z').getTime()) /
      86400000
  )
}

// period_end is exclusive (first day of next period), subtract one day for display.
function displayPeriodEnd(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function AnalyticsTrackersDetail() {
  const { trackerId } = useParams<{ trackerId: string }>()
  const [periodsBack, setPeriodsBack] = useState(6)
  const [paceOffset, setPaceOffset] = useState(0)
  const [page, setPage] = useState(0)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const periodInitialized = useRef(false)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)

  const today = new Date().toISOString().slice(0, 10)

  const id = trackerId != null ? parseInt(trackerId, 10) : NaN
  const tracker = useMemo(
    () => (Number.isNaN(id) ? null : getTracker(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, lastSyncCompletedAt]
  )

  const periodHistory = useMemo(
    () => (tracker ? getTrackerPeriodHistory(id, periodsBack) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracker, id, periodsBack, lastSyncCompletedAt]
  )

  const currentPeriod = useMemo(
    () => periodHistory.find((p) => p.periodOffset === 0) ?? null,
    [periodHistory]
  )

  // Initialise date filter to current period on first load; ignore subsequent recomputes
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
      periodHistory.find((p) => p.periodOffset === paceOffset) ??
      (periodHistory.length > 0
        ? periodHistory[periodHistory.length - 1]
        : null),
    [periodHistory, paceOffset]
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

  const maxDomainPeriod = useMemo(() => {
    if (periodHistory.length === 0) return undefined
    return Math.max(...periodHistory.flatMap((d) => [d.budget, d.spent]), 100)
  }, [periodHistory])

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
            className="btn btn-outline-secondary btn-sm flex-shrink-0"
            aria-label="Back to trackers"
          >
            <i className="mdi mdi-arrow-left" aria-hidden />
          </Link>
          <div className="small text-muted d-flex flex-wrap gap-2 align-items-center pt-1">
            {tracker.badge_color && tracker.badge_color.trim() ? (
              <span
                className="badge badge-frequency-custom"
                style={{ backgroundColor: tracker.badge_color.trim() }}
              >
                {FREQUENCY_LABELS[tracker.reset_frequency] ??
                  tracker.reset_frequency}
              </span>
            ) : (
              <span className="badge badge-frequency-default">
                {FREQUENCY_LABELS[tracker.reset_frequency] ??
                  tracker.reset_frequency}
              </span>
            )}
            {categoryNames && <span>Categories: {categoryNames}</span>}
          </div>
        </div>
        <Link
          to={`/?editTracker=${id}`}
          className="btn btn-outline-secondary btn-sm flex-shrink-0"
        >
          <i className="mdi mdi-pencil me-1" aria-hidden />
          Edit tracker
        </Link>
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
                    {formatDate(paceStats.periodStart)} –{' '}
                    {formatDate(displayPeriodEnd(paceStats.periodEnd))}
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
              {periodHistory.length === 0 ? (
                <p className="text-muted mb-0">No period data available.</p>
              ) : (
                <div style={{ width: '100%', height: isMobile ? 220 : 280 }}>
                  <TrackerHistoryChart
                    data={periodHistory}
                    maxDomain={maxDomainPeriod}
                    aria-label="Tracker spend vs budget by period"
                  />
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Spending Pace */}
      <Row className="grid-margin">
        <Col xs={12}>
          <Card>
            <Card.Header>
              <Card.Title className="mb-0">Spending Pace</Card.Title>
              {periodHistory.length > 0 && (
                <Form.Select
                  value={paceOffset}
                  onChange={(e) => setPaceOffset(Number(e.target.value))}
                  className="mt-2 w-auto"
                  aria-label="Period to view"
                >
                  {[...periodHistory].reverse().map((p) => (
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
                    setDateFrom(currentPeriod?.periodStart.slice(0, 10) ?? '')
                    setDateTo(
                      currentPeriod
                        ? displayPeriodEnd(currentPeriod.periodEnd)
                        : ''
                    )
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
