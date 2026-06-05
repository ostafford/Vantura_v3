import { useMemo } from 'react'
import { useStore } from 'zustand'
import { Link } from 'react-router-dom'
import { Card, Row, Col } from 'react-bootstrap'
import {
  getAccountsByTypes,
  getSaverBalanceHistory,
  sumAccountBalancesCents,
} from '@/services/accounts'
import { getInsightsHistory, getMonthlyInsights } from '@/services/insights'
import { formatMoney } from '@/lib/format'
import { syncStore } from '@/stores/syncStore'
import { SaverFlowChart } from '@/components/charts/SaverFlowChart'
import { SaverBalanceChart } from '@/components/charts/SaverBalanceChart'

function KpiCell({
  label,
  value,
  valueClass,
  detail,
}: {
  label: string
  value: string
  valueClass?: string
  detail?: string
}) {
  return (
    <div
      className="rounded p-3 flex-fill"
      style={{
        background: 'var(--bs-tertiary-bg, rgba(0,0,0,0.04))',
        minWidth: 120,
      }}
    >
      <div className="small text-muted mb-1">{label}</div>
      <div className={`fw-semibold fs-5 ${valueClass ?? ''}`}>{value}</div>
      {detail && (
        <div className="small text-muted mt-1" style={{ fontSize: '0.72rem' }}>
          {detail}
        </div>
      )}
    </div>
  )
}

export function AnalyticsSavers() {
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)

  const savers = getAccountsByTypes(['SAVER'])
  const homeLoans = getAccountsByTypes(['HOME_LOAN'])
  const saverTotal = sumAccountBalancesCents(savers)
  const homeLoanTotal = sumAccountBalancesCents(homeLoans)

  const now = new Date()
  const monthlyInsights = useMemo(
    () => getMonthlyInsights(now.getFullYear(), now.getMonth() + 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now.getFullYear(), now.getMonth(), lastSyncCompletedAt]
  )

  const weeklyHistory = useMemo(
    () => getInsightsHistory(12),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt]
  )

  const saverBalanceHistories = useMemo(
    () =>
      savers.map((s) => ({
        account: s,
        history: getSaverBalanceHistory(s.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savers.map((s) => s.id).join(','), lastSyncCompletedAt]
  )

  const isNetWithdrawal = monthlyInsights.saverChanges > 0
  const savedThisMonth = Math.abs(monthlyInsights.saverChanges)
  const roundUpsThisMonth = Math.abs(monthlyInsights.saverRoundUps)
  const savingsRate =
    monthlyInsights.moneyIn > 0
      ? ((isNetWithdrawal ? -savedThisMonth : savedThisMonth) /
          monthlyInsights.moneyIn) *
        100
      : null

  const transactionsAllSaversLink = '/transactions?saverActivity=1'
  const monthName = now.toLocaleString(undefined, { month: 'long' })

  return (
    <div className="grid-margin">
      <p className="text-muted mb-3">
        Balances sync from Up Bank account type{' '}
        <code className="small">SAVER</code>. &quot;Available&quot; on the
        Dashboard still sums transactional accounts only.
      </p>

      {/* Monthly KPIs */}
      <Card className="mb-4 border">
        <Card.Body>
          <h6 className="text-muted mb-3">{monthName} at a glance</h6>
          <div className="d-flex flex-wrap gap-3">
            <KpiCell
              label="Saved this month"
              value={
                savedThisMonth === 0
                  ? '$0.00'
                  : isNetWithdrawal
                    ? `-$${formatMoney(savedThisMonth)}`
                    : `+$${formatMoney(savedThisMonth)}`
              }
              valueClass={isNetWithdrawal ? 'text-danger' : 'text-success'}
            />
            <KpiCell
              label="of which round-ups"
              value={`$${formatMoney(roundUpsThisMonth)}`}
              detail="Loose Change accumulation"
            />
            <KpiCell
              label="Savings rate"
              value={savingsRate != null ? `${savingsRate.toFixed(1)}%` : '—'}
              detail="of income this month"
              valueClass={
                savingsRate == null
                  ? undefined
                  : savingsRate < 0
                    ? 'text-danger'
                    : savingsRate >= 10
                      ? 'text-success'
                      : undefined
              }
            />
            <KpiCell
              label="Total saver balance"
              value={`$${formatMoney(saverTotal)}`}
            />
          </div>
        </Card.Body>
      </Card>

      {/* Weekly savings flow chart */}
      <Card className="mb-4 border">
        <Card.Body>
          <h6 className="text-muted mb-1">Weekly savings flow</h6>
          <p className="small text-muted mb-3">
            Amount moved into savers each week over the last 12 weeks.
          </p>
          {weeklyHistory.every((w) => w.saverChanges === 0) ? (
            <p className="text-muted small mb-0">
              No saver transfers found in the last 12 weeks.
            </p>
          ) : (
            <div style={{ width: '100%', height: 240 }}>
              <SaverFlowChart
                data={weeklyHistory}
                aria-label="Weekly savings flow bar chart"
              />
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Per-saver balance history charts */}
      {saverBalanceHistories.map(({ account, history }) => (
        <Card key={account.id} className="mb-4 border">
          <Card.Body>
            <h6 className="text-muted mb-1">
              {account.display_name} — balance over time
            </h6>
            {history.length < 2 ? (
              <p className="small text-muted mb-0">
                Balance history will appear here after a few syncs. Current
                balance:{' '}
                <span className="fw-semibold">
                  ${formatMoney(account.balance)}
                </span>
              </p>
            ) : (
              <div style={{ width: '100%', height: 240 }}>
                <SaverBalanceChart
                  data={history}
                  aria-label={`${account.display_name} balance trend chart`}
                />
              </div>
            )}
          </Card.Body>
        </Card>
      ))}

      {/* Saver accounts */}
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
              <Row className="g-3 mb-3">
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
              <Link
                className="btn btn-outline-primary btn-sm"
                to={transactionsAllSaversLink}
              >
                View all saver transactions
              </Link>
            </>
          )}
        </Card.Body>
      </Card>

      {/* Home loan */}
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
