import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, Row, Col, Form, ProgressBar } from 'react-bootstrap'
import { getGoals, getGoalSnapshots } from '@/services/goals'
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

export function AnalyticsGoalDetail() {
  const { goalId } = useParams<{ goalId: string }>()
  const [timeRange, setTimeRange] = useState<string>('all')
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)

  const goalIdNum = goalId ? parseInt(goalId, 10) : NaN
  const goals = getGoals()
  const goal = goals.find((g) => g.id === goalIdNum)

  const dateFrom = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.value === timeRange)
    return range ? getDateFrom(range.daysBack) : undefined
  }, [timeRange])

  const chartData: ProgressDataPoint[] = useMemo(() => {
    if (isNaN(goalIdNum)) return []
    const snapshots = getGoalSnapshots(goalIdNum, { dateFrom })
    return snapshots.map((s) => ({
      date: s.snapshot_date,
      amount: s.current_amount,
    }))
  }, [goalIdNum, dateFrom])

  if (!goal) {
    return (
      <Card className="grid-margin">
        <Card.Body>
          <p className="text-muted mb-3">Goal not found.</p>
          <Link to="/analytics/goals" className="btn btn-outline-secondary">
            Back to Goals
          </Link>
        </Card.Body>
      </Card>
    )
  }

  const progress = Math.min(goal.progress, 100)

  return (
    <div className="grid-margin">
      <div className="mb-3">
        <Link
          to="/analytics/goals"
          className="text-decoration-none small text-muted"
        >
          <i className="mdi mdi-chevron-left" aria-hidden /> Back to Goals
        </Link>
      </div>

      <Card className="mb-4">
        <Card.Header>
          <div className="d-flex align-items-center gap-2">
            {goal.icon && (
              <span style={{ fontSize: '1.5rem' }}>{goal.icon}</span>
            )}
            <div>
              <Card.Title className="mb-0">{goal.name}</Card.Title>
              <Card.Text as="div" className="small text-muted mt-1">
                Progress over time
                {goal.completed_at && ' (completed)'}
              </Card.Text>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          <Row className="mb-3 g-3">
            <Col xs={6} md={3}>
              <div className="text-muted small">Current</div>
              <div className="fw-semibold">
                ${formatMoney(goal.current_amount)}
              </div>
            </Col>
            <Col xs={6} md={3}>
              <div className="text-muted small">Target</div>
              <div className="fw-semibold">
                ${formatMoney(goal.target_amount)}
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
              <div className="text-muted small">Remaining</div>
              <div className="fw-semibold">${formatMoney(goal.remaining)}</div>
            </Col>
          </Row>

          {(goal.monthly_contribution != null || goal.target_date) && (
            <Row className="mb-3 g-3">
              {goal.monthly_contribution != null &&
                goal.monthly_contribution > 0 && (
                  <Col xs={6} md={3}>
                    <div className="text-muted small">Monthly contribution</div>
                    <div className="fw-semibold">
                      ${formatMoney(goal.monthly_contribution)}
                    </div>
                  </Col>
                )}
              {goal.target_date && (
                <Col xs={6} md={3}>
                  <div className="text-muted small">Target date</div>
                  <div className="fw-semibold">{goal.target_date}</div>
                </Col>
              )}
            </Row>
          )}

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
              No snapshot data yet. Snapshots are recorded when you create or
              update a goal's current amount.
            </p>
          ) : (
            <div style={{ width: '100%', height: isMobile ? 220 : 280 }}>
              <ProgressChart
                data={chartData}
                goalAmount={goal.target_amount}
                lineColor="var(--vantura-accent, #7367f0)"
                aria-label={`${goal.name} progress over time`}
              />
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  )
}
