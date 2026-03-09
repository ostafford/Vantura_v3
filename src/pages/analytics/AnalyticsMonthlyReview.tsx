import { useState, useMemo } from 'react'
import { Card, Row, Col, Form } from 'react-bootstrap'
import {
  getMonthComparison,
  getCategoryBreakdownForDateRange,
  type MonthDelta,
  type NarrativeInsight,
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

function DeltaBadge({
  delta,
  invert,
}: {
  delta: MonthDelta
  invert?: boolean
}) {
  if (delta.direction === 'flat') return null
  const isUp = delta.direction === 'up'
  const positive = invert ? !isUp : isUp
  const icon = isUp ? 'mdi-arrow-up' : 'mdi-arrow-down'
  const cls = positive ? 'text-success' : 'text-danger'
  const absDelta = Math.abs(delta.delta)
  const isCount = Number.isInteger(delta.current) && absDelta < 10000
  const label = isCount ? String(absDelta) : `$${formatMoney(absDelta)}`
  return (
    <div
      className={`small ${cls}`}
      aria-label={`${delta.direction} ${label} vs last month`}
      style={{ fontSize: '0.75rem', lineHeight: 1.3 }}
    >
      <i
        className={`mdi ${icon}`}
        aria-hidden
        style={{ fontSize: '0.65rem' }}
      />{' '}
      {label}
    </div>
  )
}

const NARRATIVE_ICONS: Record<NarrativeInsight['type'], string> = {
  win: 'mdi-check-circle-outline',
  challenge: 'mdi-alert-circle-outline',
  opportunity: 'mdi-lightbulb-outline',
}

const NARRATIVE_COLORS: Record<NarrativeInsight['type'], string> = {
  win: 'text-success',
  challenge: 'text-danger',
  opportunity: 'text-warning',
}

export function AnalyticsMonthlyReview() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { from, to } = useMemo(() => getMonthBounds(year, month), [year, month])
  const comparison = useMemo(() => getMonthComparison(from, to), [from, to])
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
                ${formatMoney(comparison.moneyIn.current)}
              </div>
              {comparison.hasPreviousData && (
                <DeltaBadge delta={comparison.moneyIn} />
              )}
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">Money out</div>
              <div className="fw-semibold text-danger">
                ${formatMoney(comparison.moneyOut.current)}
              </div>
              {comparison.hasPreviousData && (
                <DeltaBadge delta={comparison.moneyOut} invert />
              )}
            </Col>
            <Col xs={6} md={3}>
              <div className="small text-muted">Charges (count)</div>
              <div className="fw-semibold">{comparison.charges.current}</div>
              {comparison.hasPreviousData && (
                <DeltaBadge delta={comparison.charges} invert />
              )}
            </Col>
            {comparison.currentTopCategory && (
              <Col xs={6} md={3}>
                <div className="small text-muted">Top category</div>
                <div className="fw-semibold">
                  {comparison.currentTopCategory.category_name} ($
                  {formatMoney(comparison.currentTopCategory.total)})
                </div>
              </Col>
            )}
          </Row>

          {comparison.hasPreviousData && comparison.narratives.length > 0 && (
            <div className="mt-3 pt-2 border-top">
              <div className="small text-muted mb-2">
                vs {MONTHS[(month - 2 + 12) % 12]}
              </div>
              {comparison.narratives.map((n, i) => (
                <div key={i} className="d-flex align-items-start gap-1 mb-1">
                  <i
                    className={`mdi ${NARRATIVE_ICONS[n.type]} ${NARRATIVE_COLORS[n.type]}`}
                    aria-hidden
                    style={{ fontSize: '0.95rem', marginTop: 1 }}
                  />
                  <span className="small">{n.label}</span>
                </div>
              ))}
            </div>
          )}
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
