import { Link } from 'react-router-dom'
import { Card, Row, Col } from 'react-bootstrap'

export function AnalyticsIndex() {
  return (
    <div className="grid-margin">
      <Card className="mb-4 bg-gradient-primary text-white border-0">
        <Card.Body className="text-center py-5">
          <div className="mb-3">
            <i
              className="mdi mdi-chart-box opacity-90"
              style={{ fontSize: '4rem' }}
              aria-hidden
            />
          </div>
          <h4 className="fw-bold mb-2 text-white">Analytics</h4>
          <p
            className="mb-0 opacity-90"
            style={{ maxWidth: '36rem', margin: '0 auto' }}
          >
            Understand your spending patterns, track progress over time, and see
            trends across your finances.
          </p>
        </Card.Body>
      </Card>

      <p className="mb-3 fw-medium">Explore your analytics:</p>
      <Row className="mb-4 g-3">
        <Col xs={12} md={6} lg={3}>
          <Link
            to="/analytics/reports"
            className="text-decoration-none"
            style={{ color: 'inherit' }}
          >
            <Card className="h-100 border">
              <Card.Body className="d-flex align-items-start">
                <span
                  className="page-title-icon bg-gradient-primary text-white rounded d-inline-flex align-items-center justify-content-center me-2 flex-shrink-0"
                  style={{ width: 36, height: 36, minWidth: 36 }}
                >
                  <i
                    className="mdi mdi-file-chart"
                    style={{ fontSize: '1.25rem' }}
                    aria-hidden
                  />
                </span>
                <div>
                  <h6 className="mb-1 fw-semibold">Reports</h6>
                  <p className="mb-0 text-muted small">
                    Spending by category over a date range and optional
                    income-to-spending flow (Sankey).
                  </p>
                  <span className="small text-primary mt-1 d-inline-block">
                    View reports{' '}
                    <i className="mdi mdi-chevron-right" aria-hidden />
                  </span>
                </div>
              </Card.Body>
            </Card>
          </Link>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Link
            to="/analytics/trackers"
            className="text-decoration-none"
            style={{ color: 'inherit' }}
          >
            <Card className="h-100 border">
              <Card.Body className="d-flex align-items-start">
                <span
                  className="page-title-icon bg-gradient-primary text-white rounded d-inline-flex align-items-center justify-content-center me-2 flex-shrink-0"
                  style={{ width: 36, height: 36, minWidth: 36 }}
                >
                  <i
                    className="mdi mdi-chart-line"
                    style={{ fontSize: '1.25rem' }}
                    aria-hidden
                  />
                </span>
                <div>
                  <h6 className="mb-1 fw-semibold">Trackers</h6>
                  <p className="mb-0 text-muted small">
                    View spending trends per tracker, compare budget vs spend
                    across periods, and explore transaction history.
                  </p>
                  <span className="small text-primary mt-1 d-inline-block">
                    View trackers{' '}
                    <i className="mdi mdi-chevron-right" aria-hidden />
                  </span>
                </div>
              </Card.Body>
            </Card>
          </Link>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Link
            to="/analytics/insights"
            className="text-decoration-none"
            style={{ color: 'inherit' }}
          >
            <Card className="h-100 border">
              <Card.Body className="d-flex align-items-start">
                <span
                  className="page-title-icon bg-gradient-primary text-white rounded d-inline-flex align-items-center justify-content-center me-2 flex-shrink-0"
                  style={{ width: 36, height: 36, minWidth: 36 }}
                >
                  <i
                    className="mdi mdi-chart-bar"
                    style={{ fontSize: '1.25rem' }}
                    aria-hidden
                  />
                </span>
                <div>
                  <h6 className="mb-1 fw-semibold">Weekly insights</h6>
                  <p className="mb-0 text-muted small">
                    Compare money in vs money out by week and explore category
                    spending trends.
                  </p>
                  <span className="small text-primary mt-1 d-inline-block">
                    View insights{' '}
                    <i className="mdi mdi-chevron-right" aria-hidden />
                  </span>
                </div>
              </Card.Body>
            </Card>
          </Link>
        </Col>
        <Col xs={12} md={6} lg={3}>
          <Link
            to="/analytics/monthly-review"
            className="text-decoration-none"
            style={{ color: 'inherit' }}
          >
            <Card className="h-100 border">
              <Card.Body className="d-flex align-items-start">
                <span
                  className="page-title-icon bg-gradient-primary text-white rounded d-inline-flex align-items-center justify-content-center me-2 flex-shrink-0"
                  style={{ width: 36, height: 36, minWidth: 36 }}
                >
                  <i
                    className="mdi mdi-calendar-month"
                    style={{ fontSize: '1.25rem' }}
                    aria-hidden
                  />
                </span>
                <div>
                  <h6 className="mb-1 fw-semibold">Monthly review</h6>
                  <p className="mb-0 text-muted small">
                    Money in/out, top categories, and tracker spend for any
                    month.
                  </p>
                  <span className="small text-primary mt-1 d-inline-block">
                    View monthly review{' '}
                    <i className="mdi mdi-chevron-right" aria-hidden />
                  </span>
                </div>
              </Card.Body>
            </Card>
          </Link>
        </Col>
      </Row>

      <Card className="border">
        <Card.Body>
          <p className="mb-3 text-muted small">
            Use your Dashboard for trackers, upcoming charges, and the weekly
            insights summary. Browse and filter all transactions on the
            Transactions page.
          </p>
          <div className="d-flex flex-wrap gap-2">
            <Link to="/" className="btn btn-primary">
              Go to Dashboard
            </Link>
            <Link to="/transactions" className="btn btn-outline-secondary">
              Browse Transactions
            </Link>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
