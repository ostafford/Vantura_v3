import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, Row, Col, Button, Form, Badge } from 'react-bootstrap'
import {
  getTracker,
  getTrackerPeriodHistory,
  getTrackerTransactionTimeline,
  getTrackerTransactionsForTable,
  getTrackerTransactionsCount,
  getTrackerCategoryIds,
} from '@/services/trackers'
import { getCategories } from '@/services/categories'
import { formatMoney, formatShortDate } from '@/lib/format'
import { TrackerHistoryChart } from '@/components/charts/TrackerHistoryChart'
import { TrackerCumulativeChart } from '@/components/charts/TrackerCumulativeChart'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'

const PERIOD_OPTIONS = [
  { value: 3, label: 'Last 3 periods' },
  { value: 6, label: 'Last 6 periods' },
  { value: 12, label: 'Last 12 periods' },
]

const PAGE_SIZE = 20

export function AnalyticsTrackersDetail() {
  const { trackerId } = useParams<{ trackerId: string }>()
  const [periodsBack, setPeriodsBack] = useState(6)
  const [page, setPage] = useState(0)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)

  const id = trackerId != null ? parseInt(trackerId, 10) : NaN
  const tracker = useMemo(
    () => (Number.isNaN(id) ? null : getTracker(id)),
    [id]
  )

  const periodHistory = useMemo(
    () => (tracker ? getTrackerPeriodHistory(id, periodsBack) : []),
    [tracker, id, periodsBack]
  )

  const transactionTimeline = useMemo(
    () =>
      tracker
        ? getTrackerTransactionTimeline(id, {
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            limit: 500,
          })
        : [],
    [tracker, id, dateFrom, dateTo]
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
    [tracker, id, dateFilter, page]
  )

  const totalTransactions = useMemo(
    () => (tracker ? getTrackerTransactionsCount(id, dateFilter) : 0),
    [tracker, id, dateFilter]
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

  const maxDomainCumulative = useMemo(() => {
    if (transactionTimeline.length === 0) return undefined
    return Math.max(...transactionTimeline.map((d) => d.cumulativeSpent), 100)
  }, [transactionTimeline])

  const totalPages = Math.ceil(totalTransactions / PAGE_SIZE)

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
      <div className="d-flex align-items-start gap-2 mb-3">
        <Link
          to="/analytics/trackers"
          className="btn btn-outline-secondary btn-sm flex-shrink-0"
          aria-label="Back to trackers"
        >
          <i className="mdi mdi-arrow-left" aria-hidden />
        </Link>
        <div className="small text-muted d-flex flex-wrap gap-2 align-items-center pt-1">
          {tracker.badge_color && (
            <Badge
              style={{
                backgroundColor: tracker.badge_color,
                color: 'white',
              }}
            >
              {tracker.reset_frequency}
            </Badge>
          )}
          {categoryNames && <span>Categories: {categoryNames}</span>}
        </div>
      </div>

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
                <div
                  style={{
                    width: '100%',
                    height: isMobile ? 220 : 280,
                  }}
                >
                  <TrackerHistoryChart
                    data={periodHistory}
                    maxDomain={maxDomainPeriod}
                    aria-label="Tracker spend vs budget by period"
                  />
                </div>
              )}
              <div className="small text-muted mt-2">
                Gray = budget, Purple = spent (red when over budget)
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="grid-margin">
        <Col xs={12}>
          <Card>
            <Card.Header>
              <Card.Title className="mb-0">
                Cumulative Spending Over Time
              </Card.Title>
              <div className="d-flex flex-wrap gap-2 mt-2">
                <Form.Control
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="From"
                  className="w-auto"
                  aria-label="Date from"
                />
                <Form.Control
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="To"
                  className="w-auto"
                  aria-label="Date to"
                />
                {(dateFrom || dateTo) && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => {
                      setDateFrom('')
                      setDateTo('')
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </Card.Header>
            <Card.Body>
              {transactionTimeline.length === 0 ? (
                <p className="text-muted mb-0">
                  No transactions in the selected range.
                </p>
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: isMobile ? 200 : 240,
                  }}
                >
                  <TrackerCumulativeChart
                    data={transactionTimeline}
                    maxDomain={maxDomainCumulative}
                    aria-label="Cumulative spending over time"
                  />
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="grid-margin">
        <Col xs={12}>
          <Card>
            <Card.Header>
              <Card.Title className="mb-0">Transactions</Card.Title>
              <Card.Text as="div" className="small text-muted mt-1">
                {totalTransactions} transaction(s)
                {(dateFrom || dateTo) && ' in selected date range'}
              </Card.Text>
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
                            <td>{formatShortDate(tx.date)}</td>
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
