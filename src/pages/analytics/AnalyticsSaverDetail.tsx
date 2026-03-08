import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, Row, Col, Form, ProgressBar, Table } from 'react-bootstrap'
import {
  getSaversWithProgress,
  getSaverBalanceSnapshots,
  getSaverBalanceHistory,
} from '@/services/savers'
import {
  ProgressChart,
  type ProgressDataPoint,
} from '@/components/charts/ProgressChart'
import { formatMoney } from '@/lib/format'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'

const TIME_RANGES = [
  { value: '3M', label: 'Last 3 months', daysBack: 90 },
  { value: '6M', label: 'Last 6 months', daysBack: 180 },
  { value: '1Y', label: 'Last year', daysBack: 365 },
  { value: 'all', label: 'All time', daysBack: 0 },
] as const

function getDateFrom(daysBack: number): string | undefined {
  if (daysBack <= 0) return undefined
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

export function AnalyticsSaverDetail() {
  const { saverId } = useParams<{ saverId: string }>()
  const [timeRange, setTimeRange] = useState<string>('6M')
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)

  const savers = getSaversWithProgress()
  const saver = savers.find((s) => s.id === saverId)

  const dateFrom = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.value === timeRange)
    return range ? getDateFrom(range.daysBack) : undefined
  }, [timeRange])

  const chartData: ProgressDataPoint[] = useMemo(() => {
    if (!saverId) return []
    const snapshots = getSaverBalanceSnapshots(saverId, { dateFrom })
    return snapshots.map((s) => ({
      date: s.snapshot_date,
      amount: s.balance_cents,
    }))
  }, [saverId, dateFrom])

  const contributions = useMemo(() => {
    if (!saverId) return []
    return getSaverBalanceHistory(saverId, { dateFrom, limit: 50 })
  }, [saverId, dateFrom])

  if (!saver) {
    return (
      <Card className="grid-margin">
        <Card.Body>
          <p className="text-muted mb-3">Saver not found.</p>
          <Link to="/analytics/savers" className="btn btn-outline-secondary">
            Back to Savers
          </Link>
        </Card.Body>
      </Card>
    )
  }

  const progress = Math.min(saver.progress, 100)
  const displayIcon = saver.user_icon ?? saver.icon

  return (
    <div className="grid-margin">
      <div className="mb-3">
        <Link
          to="/analytics/savers"
          className="text-decoration-none small text-muted"
        >
          <i className="mdi mdi-chevron-left" aria-hidden /> Back to Savers
        </Link>
      </div>

      <Card className="mb-4">
        <Card.Header>
          <div className="d-flex align-items-center gap-2">
            {displayIcon && (
              <span style={{ fontSize: '1.5rem' }}>{displayIcon}</span>
            )}
            <div>
              <Card.Title className="mb-0">{saver.name}</Card.Title>
              <Card.Text as="div" className="small text-muted mt-1">
                Balance growth over time
                {saver.completed_at && ' (completed)'}
              </Card.Text>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          <Row className="mb-3 g-3">
            <Col xs={6} md={3}>
              <div className="text-muted small">Current balance</div>
              <div className="fw-semibold">
                ${formatMoney(saver.current_balance)}
              </div>
            </Col>
            {saver.goal_amount != null && saver.goal_amount > 0 && (
              <>
                <Col xs={6} md={3}>
                  <div className="text-muted small">Goal</div>
                  <div className="fw-semibold">
                    ${formatMoney(saver.goal_amount)}
                  </div>
                </Col>
                <Col xs={6} md={3}>
                  <div className="text-muted small">Progress</div>
                  <ProgressBar
                    now={progress}
                    variant={progress >= 100 ? 'success' : 'primary'}
                    style={{ height: 8, marginTop: 6 }}
                  />
                  <div className="small text-muted mt-1">
                    {progress.toFixed(0)}%
                  </div>
                </Col>
                <Col xs={6} md={3}>
                  <div className="text-muted small">Status</div>
                  <div className="fw-semibold">
                    {saver.completed_at
                      ? 'Completed'
                      : saver.onTrack
                        ? 'On track'
                        : 'Behind'}
                  </div>
                </Col>
              </>
            )}
          </Row>

          <Row className="mb-3">
            <Col md={4}>
              <Form.Select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                aria-label="Time range"
              >
                {TIME_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Form.Select>
            </Col>
          </Row>

          {chartData.length === 0 ? (
            <p className="text-muted mb-0">
              No snapshot data yet. Snapshots are recorded each time you sync
              with Up Bank.
            </p>
          ) : (
            <div style={{ width: '100%', height: isMobile ? 220 : 280 }}>
              <ProgressChart
                data={chartData}
                goalAmount={
                  saver.goal_amount != null && saver.goal_amount > 0
                    ? saver.goal_amount
                    : undefined
                }
                lineColor="var(--vantura-accent, #7367f0)"
                aria-label={`${saver.name} balance over time`}
              />
            </div>
          )}
        </Card.Body>
      </Card>

      {contributions.length > 0 && (
        <Card>
          <Card.Header>
            <Card.Title className="mb-0">Recent Contributions</Card.Title>
            <Card.Text as="div" className="small text-muted mt-1">
              Transfers into this saver (from transactions)
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0">
            <Table responsive hover className="mb-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="text-end">Amount</th>
                  <th className="text-end">Balance</th>
                </tr>
              </thead>
              <tbody>
                {contributions
                  .slice()
                  .reverse()
                  .slice(0, 20)
                  .map((c) => (
                    <tr key={c.transactionId}>
                      <td className="text-nowrap">{c.date}</td>
                      <td>{c.description}</td>
                      <td
                        className={`text-end text-nowrap ${c.amount >= 0 ? 'text-success' : 'text-danger'}`}
                      >
                        {c.amount >= 0 ? '+' : ''}${formatMoney(c.amount)}
                      </td>
                      <td className="text-end text-nowrap">
                        ${formatMoney(c.balance)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}
    </div>
  )
}
