import { Link } from 'react-router-dom'
import { Card, Row, Col } from 'react-bootstrap'

export function AnalyticsComingSoon() {
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
          <h4 className="fw-bold mb-2 text-white">Analytics is coming soon</h4>
          <p
            className="mb-0 opacity-90"
            style={{ maxWidth: '36rem', margin: '0 auto' }}
          >
            We are building detailed analytics to help you understand your
            spending patterns, track progress over time, and see trends across
            your finances. This will land in an upcoming update.
          </p>
        </Card.Body>
      </Card>

      <p className="mb-3 fw-medium">
        When Analytics is ready, you will be able to:
      </p>
      <Row className="mb-4 g-3">
        <Col xs={12} md={4}>
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
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="h-100 border">
            <Card.Body className="d-flex align-items-start">
              <span
                className="page-title-icon bg-gradient-primary text-white rounded d-inline-flex align-items-center justify-content-center me-2 flex-shrink-0"
                style={{ width: 36, height: 36, minWidth: 36 }}
              >
                <i
                  className="mdi mdi-piggy-bank"
                  style={{ fontSize: '1.25rem' }}
                  aria-hidden
                />
              </span>
              <div>
                <h6 className="mb-1 fw-semibold">Savers</h6>
                <p className="mb-0 text-muted small">
                  See saver balance over time and compare multiple savers in one
                  view.
                </p>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
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
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="border">
        <Card.Body>
          <p className="mb-3 text-muted small">
            In the meantime, use your Dashboard for trackers, savers, upcoming
            charges, and the weekly insights summary. You can also browse and
            filter all transactions on the Transactions page.
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
