import { Link } from 'react-router-dom'
import { Card, Row, Col } from 'react-bootstrap'
import { AnalyticsAtAGlanceSection } from '@/components/analytics/AnalyticsAtAGlanceSection'

export function AnalyticsComingSoon() {
  return (
    <div className="grid-margin">
      <AnalyticsAtAGlanceSection />

      <p className="mb-2 text-muted small">
        More detailed analytics are rolling out in upcoming updates.
      </p>

      <p className="mb-3 fw-medium">
        When Analytics is ready, you will be able to:
      </p>
      <Row className="mb-4 g-3">
        <Col xs={12} md={6}>
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
        <Col xs={12} md={6}>
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
            In the meantime, use your Dashboard for trackers, upcoming charges,
            and the weekly insights summary. You can also browse and filter all
            transactions on the Transactions page.
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
