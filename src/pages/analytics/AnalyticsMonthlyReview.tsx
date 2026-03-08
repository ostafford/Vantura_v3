import { useState, useMemo } from 'react'
import { Card, Row, Col, Form } from 'react-bootstrap'
import {
  getInsightsForDateRange,
  getCategoryBreakdownForDateRange,
} from '@/services/insights'
import {
  getTrackersWithProgress,
  getTrackerSpentInPeriod,
} from '@/services/trackers'
import { formatMoney } from '@/lib/format'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function getMonthBounds(
  year: number,
  month: number
): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

export function AnalyticsMonthlyReview() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { from, to } = useMemo(() => getMonthBounds(year, month), [year, month])
  const insights = useMemo(() => getInsightsForDateRange(from, to), [from, to])
  const categories = useMemo(
    () => getCategoryBreakdownForDateRange(from, to),
    [from, to]
  )
  const trackers = getTrackersWithProgress()
  const trackerSpendInMonth = useMemo(() => {
    return trackers.map((t) => {
      const spent = getTrackerSpentInPeriod(t.id, from, to)
      return { tracker: t, spent }
    })
  }, [trackers, from, to])

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => current - i)
  }, [])

  return (
    <>
      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">Monthly review</Card.Title>
          <Card.Text as="div" className="small text-muted mt-1">
            Summary of money in, money out, top categories, and tracker spend
            for the selected month.
          </Card.Text>
        </Card.Header>
        <Card.Body>
          <Row className="mb-3">
            <Col md={3}>
              <Form.Select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="Month"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Year"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Form.Select>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">
            {MONTHS[month - 1]} {year} — Summary
          </Card.Title>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col xs={6} md={3}>
              <div className="small text-muted">Money in</div>
              <div className="fw-semibold text-success">
                ${formatMoney(insights.moneyIn)}
              </div>
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">Money out</div>
              <div className="fw-semibold text-danger">
                ${formatMoney(insights.moneyOut)}
              </div>
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">Saver changes</div>
              <div className="fw-semibold">
                ${formatMoney(insights.saverChanges)}
              </div>
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">Charges (count)</div>
              <div className="fw-semibold">{insights.charges}</div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">Top categories</Card.Title>
        </Card.Header>
        <Card.Body>
          {categories.length === 0 ? (
            <p className="text-muted mb-0">No spending in this month.</p>
          ) : (
            <ul className="list-group list-group-flush">
              {categories.slice(0, 10).map((c) => (
                <li
                  key={c.category_id ?? 'uncategorised'}
                  className="list-group-item d-flex justify-content-between align-items-center"
                >
                  <span>{c.category_name}</span>
                  <span>${formatMoney(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card.Body>
      </Card>

      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">Trackers (spend in month)</Card.Title>
        </Card.Header>
        <Card.Body>
          {trackerSpendInMonth.length === 0 ? (
            <p className="text-muted mb-0">No trackers.</p>
          ) : (
            <ul className="list-group list-group-flush">
              {trackerSpendInMonth.map(({ tracker, spent }) => (
                <li
                  key={tracker.id}
                  className="list-group-item d-flex justify-content-between align-items-center"
                >
                  <span>{tracker.name}</span>
                  <span>
                    ${formatMoney(spent)} of $
                    {formatMoney(tracker.budget_amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card.Body>
      </Card>
    </>
  )
}
