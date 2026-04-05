import { Link } from 'react-router-dom'
import { Card, Row, Col } from 'react-bootstrap'
import {
  getAccountsByTypes,
  sumAccountBalancesCents,
} from '@/services/accounts'
import { formatMoney } from '@/lib/format'

export function AnalyticsSavers() {
  const savers = getAccountsByTypes(['SAVER'])
  const homeLoans = getAccountsByTypes(['HOME_LOAN'])
  const saverTotal = sumAccountBalancesCents(savers)
  const homeLoanTotal = sumAccountBalancesCents(homeLoans)

  const transactionsAllSaversLink = '/transactions?saverActivity=1'

  return (
    <div className="grid-margin">
      <p className="text-muted mb-3">
        Balances sync from Up Bank account type{' '}
        <code className="small">SAVER</code>. &quot;Available&quot; on the
        Dashboard still sums transactional accounts only.
      </p>

      <div className="mb-3">
        <Link
          className="btn btn-outline-primary btn-sm"
          to={transactionsAllSaversLink}
        >
          View saver-related transactions
        </Link>
      </div>

      <Card className="mb-4 border">
        <Card.Body>
          <h6 className="text-muted mb-2">Saver accounts</h6>
          {savers.length === 0 ? (
            <p className="text-muted mb-0 small">
              No saver accounts in your synced data. Re-sync after creating
              savers in the Up app, or check that your token can see all
              accounts.
            </p>
          ) : (
            <>
              <p className="mb-3 fw-semibold">
                Combined balance: ${formatMoney(saverTotal)}
              </p>
              <Row className="g-3">
                {savers.map((a) => (
                  <Col key={a.id} xs={12} md={6} lg={4}>
                    <Card className="h-100 border">
                      <Card.Body>
                        <h6 className="mb-1">{a.display_name}</h6>
                        <p className="mb-2 h5">${formatMoney(a.balance)}</p>
                        {a.ownership_type ? (
                          <p className="small text-muted mb-2">
                            {a.ownership_type === 'JOINT'
                              ? 'Joint / 2Up'
                              : 'Individual'}
                          </p>
                        ) : null}
                        <Link
                          className="btn btn-link p-0 small"
                          to={`/transactions?saverActivity=1&linkedAccountId=${encodeURIComponent(a.id)}`}
                        >
                          Transactions for this account
                        </Link>
                      </Card.Body>
                    </Card>
                  </Col>
                ))}
              </Row>
            </>
          )}
        </Card.Body>
      </Card>

      {homeLoans.length > 0 ? (
        <Card className="border">
          <Card.Body>
            <h6 className="text-muted mb-2">Home loan</h6>
            <p className="small text-muted mb-3">
              Up API type <code>HOME_LOAN</code> is not a saver; shown here for
              visibility.
            </p>
            <p className="mb-3 fw-semibold">
              Combined balance: ${formatMoney(homeLoanTotal)}
            </p>
            <Row className="g-3">
              {homeLoans.map((a) => (
                <Col key={a.id} xs={12} md={6} lg={4}>
                  <Card className="h-100 border">
                    <Card.Body>
                      <h6 className="mb-1">{a.display_name}</h6>
                      <p className="mb-0 h5">${formatMoney(a.balance)}</p>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card.Body>
        </Card>
      ) : null}
    </div>
  )
}
