import { Link } from 'react-router-dom'
import { Card, Row, Col, ProgressBar } from 'react-bootstrap'
import { getGoals } from '@/services/goals'
import { formatMoney } from '@/lib/format'

export function AnalyticsGoals() {
  const goals = getGoals()
  const active = goals.filter((g) => !g.completed_at)
  const completed = goals.filter((g) => g.completed_at)

  return (
    <div className="grid-margin">
      <Card className="mb-4">
        <Card.Header>
          <Card.Title className="mb-0">Goals</Card.Title>
          <Card.Text as="div" className="small text-muted mt-1">
            Track progress toward your financial goals over time.
          </Card.Text>
        </Card.Header>
        <Card.Body>
          {goals.length === 0 ? (
            <p className="text-muted mb-0">
              No goals yet. Create goals from the Dashboard to start tracking
              progress.
            </p>
          ) : (
            <>
              {active.length > 0 && (
                <Row className="g-3">
                  {active.map((g) => {
                    const progress = Math.min(g.progress, 100)
                    return (
                      <Col xs={12} md={6} key={g.id}>
                        <Link
                          to={`/analytics/goals/${g.id}`}
                          className="text-decoration-none"
                          style={{ color: 'inherit' }}
                        >
                          <Card className="h-100 border">
                            <Card.Body>
                              <div className="d-flex align-items-center mb-2">
                                {g.icon && (
                                  <span
                                    className="me-2"
                                    style={{ fontSize: '1.5rem' }}
                                  >
                                    {g.icon}
                                  </span>
                                )}
                                <h6 className="mb-0 fw-semibold">{g.name}</h6>
                                <i
                                  className="mdi mdi-chevron-right ms-auto"
                                  aria-hidden
                                />
                              </div>
                              <div className="d-flex justify-content-between small text-muted mb-1">
                                <span>${formatMoney(g.current_amount)}</span>
                                <span>${formatMoney(g.target_amount)}</span>
                              </div>
                              <ProgressBar
                                now={progress}
                                variant={
                                  progress >= 100 ? 'success' : 'primary'
                                }
                                style={{ height: 8 }}
                              />
                              <div className="d-flex justify-content-between small text-muted mt-1">
                                <span>{progress.toFixed(0)}%</span>
                                {g.monthly_contribution != null &&
                                  g.monthly_contribution > 0 && (
                                    <span>
                                      ${formatMoney(g.monthly_contribution)}/mo
                                    </span>
                                  )}
                              </div>
                            </Card.Body>
                          </Card>
                        </Link>
                      </Col>
                    )
                  })}
                </Row>
              )}

              {completed.length > 0 && (
                <div className={active.length > 0 ? 'mt-4' : ''}>
                  <h6 className="text-muted fw-normal mb-3">
                    Completed ({completed.length})
                  </h6>
                  <Row className="g-3">
                    {completed.map((g) => (
                      <Col xs={12} md={6} key={g.id}>
                        <Link
                          to={`/analytics/goals/${g.id}`}
                          className="text-decoration-none"
                          style={{ color: 'inherit' }}
                        >
                          <Card className="h-100 border opacity-75">
                            <Card.Body>
                              <div className="d-flex align-items-center mb-1">
                                {g.icon && (
                                  <span
                                    className="me-2"
                                    style={{ fontSize: '1.25rem' }}
                                  >
                                    {g.icon}
                                  </span>
                                )}
                                <span className="fw-semibold">{g.name}</span>
                                <span className="badge bg-success ms-auto">
                                  Complete
                                </span>
                              </div>
                              <div className="small text-muted">
                                ${formatMoney(g.target_amount)}
                              </div>
                            </Card.Body>
                          </Card>
                        </Link>
                      </Col>
                    ))}
                  </Row>
                </div>
              )}
            </>
          )}
        </Card.Body>
      </Card>
    </div>
  )
}
