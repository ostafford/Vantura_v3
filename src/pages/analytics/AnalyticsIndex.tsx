import { Link } from 'react-router-dom'
import { Card, Row, Col } from 'react-bootstrap'
import { AnalyticsAtAGlanceSection } from '@/components/analytics/AnalyticsAtAGlanceSection'

export function AnalyticsIndex() {
  return (
    <div className="grid-margin">
      <p className="mb-3 fw-medium">Explore your analytics:</p>
      <Row className="mb-4 g-3">
        <Col xs={12} md={6} lg={4}>
          <Link
            to="/analytics/trackers"
            className="text-decoration-none"
            style={{ color: 'inherit' }}
          >
            <Card className="h-100">
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
                    Spending trends per tracker, budget vs spend across periods,
                    and transaction history.
                  </p>
                  <span
                    className="small mt-1 d-inline-block"
                    style={{ color: 'var(--vantura-primary)' }}
                  >
                    View trackers{' '}
                    <i className="mdi mdi-chevron-right" aria-hidden />
                  </span>
                </div>
              </Card.Body>
            </Card>
          </Link>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Link
            to="/analytics/reports"
            className="text-decoration-none"
            style={{ color: 'inherit' }}
          >
            <Card className="h-100">
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
                    Category spending, weekly money in/out trends, and monthly
                    reviews — all in one place.
                  </p>
                  <span
                    className="small mt-1 d-inline-block"
                    style={{ color: 'var(--vantura-primary)' }}
                  >
                    View reports{' '}
                    <i className="mdi mdi-chevron-right" aria-hidden />
                  </span>
                </div>
              </Card.Body>
            </Card>
          </Link>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Link
            to="/analytics/savers"
            className="text-decoration-none"
            style={{ color: 'inherit' }}
          >
            <Card className="h-100">
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
                    Track saver account balances, set savings goals, and view
                    monthly contribution history.
                  </p>
                  <span
                    className="small mt-1 d-inline-block"
                    style={{ color: 'var(--vantura-primary)' }}
                  >
                    View savers{' '}
                    <i className="mdi mdi-chevron-right" aria-hidden />
                  </span>
                </div>
              </Card.Body>
            </Card>
          </Link>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Link
            to="/analytics/budget"
            className="text-decoration-none"
            style={{ color: 'inherit' }}
          >
            <Card className="h-100">
              <Card.Body className="d-flex align-items-start">
                <span
                  className="page-title-icon bg-gradient-primary text-white rounded d-inline-flex align-items-center justify-content-center me-2 flex-shrink-0"
                  style={{ width: 36, height: 36, minWidth: 36 }}
                >
                  <i
                    className="mdi mdi-wallet-outline"
                    style={{ fontSize: '1.25rem' }}
                    aria-hidden
                  />
                </span>
                <div>
                  <h6 className="mb-1 fw-semibold">Budget Plan</h6>
                  <p className="mb-0 text-muted small">
                    Group your expenses into buckets, see weekly, monthly and
                    yearly totals, and test affordability with hypotheticals.
                  </p>
                  <span
                    className="small mt-1 d-inline-block"
                    style={{ color: 'var(--vantura-primary)' }}
                  >
                    View budget plan{' '}
                    <i className="mdi mdi-chevron-right" aria-hidden />
                  </span>
                </div>
              </Card.Body>
            </Card>
          </Link>
        </Col>
        <Col xs={12} md={6} lg={4}>
          <Link
            to="/analytics/net-worth"
            className="text-decoration-none"
            style={{ color: 'inherit' }}
          >
            <Card className="h-100">
              <Card.Body className="d-flex align-items-start">
                <span
                  className="page-title-icon bg-gradient-primary text-white rounded d-inline-flex align-items-center justify-content-center me-2 flex-shrink-0"
                  style={{ width: 36, height: 36, minWidth: 36 }}
                >
                  <i
                    className="mdi mdi-chart-timeline-variant"
                    style={{ fontSize: '1.25rem' }}
                    aria-hidden
                  />
                </span>
                <div>
                  <h6 className="mb-1 fw-semibold">Net Worth</h6>
                  <p className="mb-0 text-muted small">
                    Total assets minus liabilities — Up Bank accounts live, plus
                    manual entries for super, property, credit cards, and loans.
                  </p>
                  <span
                    className="small mt-1 d-inline-block"
                    style={{ color: 'var(--vantura-primary)' }}
                  >
                    View net worth{' '}
                    <i className="mdi mdi-chevron-right" aria-hidden />
                  </span>
                </div>
              </Card.Body>
            </Card>
          </Link>
        </Col>
      </Row>

      <AnalyticsAtAGlanceSection />
    </div>
  )
}
