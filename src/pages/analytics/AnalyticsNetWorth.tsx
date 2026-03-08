import { useState, useMemo } from 'react'
import { Card, Row, Col, Form } from 'react-bootstrap'
import {
  getNetWorthHistory,
  getNetWorthHistoryByType,
} from '@/services/netWorth'
import { NetWorthChart } from '@/components/charts/NetWorthChart'
import { formatMoney } from '@/lib/format'

const TIME_RANGES = [
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: '365', label: 'Last year', days: 365 },
  { value: 'all', label: 'All time', days: 0 },
]

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'all', label: 'All accounts' },
  { value: 'TRANSACTIONAL', label: 'Transactional only' },
  { value: 'SAVER', label: 'Savers only' },
]

export function AnalyticsNetWorth() {
  const [timeRange, setTimeRange] = useState('90')
  const [accountTypeFilter, setAccountTypeFilter] = useState('all')

  const range = TIME_RANGES.find((r) => r.value === timeRange)
  const dateFrom = useMemo(() => {
    if (!range || range.days <= 0) return undefined
    const d = new Date()
    d.setDate(d.getDate() - range.days)
    return d.toISOString().slice(0, 10)
  }, [range])

  const history = useMemo(() => {
    const opts = { limit: range?.days ?? 365, dateFrom }
    if (accountTypeFilter === 'all') {
      return getNetWorthHistory(opts)
    }
    return getNetWorthHistoryByType(accountTypeFilter, opts)
  }, [dateFrom, range?.days, accountTypeFilter])

  const maxDomain = useMemo(() => {
    if (history.length === 0) return undefined
    return Math.max(...history.map((d) => d.total_balance_cents), 100)
  }, [history])

  const latest = history.length > 0 ? history[history.length - 1] : null

  return (
    <>
      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">Net worth (Up accounts)</Card.Title>
          <Card.Text as="div" className="small text-muted mt-1">
            Sum of your Up Bank account balances over time. Recorded after each
            sync. Filter by account type to see transactional vs saver balances.
          </Card.Text>
        </Card.Header>
        <Card.Body>
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
            <Col md={4}>
              <Form.Select
                value={accountTypeFilter}
                onChange={(e) => setAccountTypeFilter(e.target.value)}
                aria-label="Account type filter"
              >
                {ACCOUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Form.Select>
            </Col>
          </Row>
          {latest && (
            <p className="small text-muted mb-2">
              Latest: ${formatMoney(latest.total_balance_cents)} (
              {latest.snapshot_date})
            </p>
          )}
          {history.length === 0 ? (
            <p className="text-muted mb-0">
              {accountTypeFilter !== 'all'
                ? `No ${accountTypeFilter.toLowerCase()} net worth data yet. Per-type tracking starts after your next sync.`
                : 'No net worth data yet. Sync with Up Bank to record your first snapshot.'}
            </p>
          ) : (
            <div
              style={{ width: '100%', height: 280 }}
              className="position-relative"
            >
              <NetWorthChart
                data={history}
                maxDomain={maxDomain}
                aria-label="Net worth over time"
              />
            </div>
          )}
        </Card.Body>
      </Card>
    </>
  )
}
