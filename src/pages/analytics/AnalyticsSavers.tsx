import { useMemo, useState } from 'react'
import { useStore } from 'zustand'
import { Link } from 'react-router-dom'
import { Card, Row, Col, ProgressBar, Form, Collapse } from 'react-bootstrap'
import {
  getAccountsByTypes,
  getSaverMonthlyFlow,
  sumAccountBalancesCents,
  updateSaverGoal,
  type SaverBalanceSnapshot,
  type SaverMonthlyFlowPoint,
} from '@/services/accounts'
import { getMonthlyInsights } from '@/services/insights'
import type { MonthDelta } from '@/services/insights'
import { formatMoney } from '@/lib/format'
import { syncStore } from '@/stores/syncStore'
import { SaverBalanceChart } from '@/components/charts/SaverBalanceChart'
import { SaverMonthlyFlowChart } from '@/components/charts/SaverMonthlyFlowChart'
import { ComparisonDeltaBadge } from '@/components/atAGlance/ComparisonDeltaBadge'
import { previousCalendarMonth, monthNameLong } from '@/lib/monthLabels'

// Reconstruct end-of-month balances from flow data working backwards from current balance.
// Both charts then share the same source and time window.
const MONTH_MAP: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
}

function deriveMonthlyBalances(
  flow: SaverMonthlyFlowPoint[],
  saverId: string,
  currentBalance: number
): SaverBalanceSnapshot[] {
  const result: SaverBalanceSnapshot[] = []
  let b = currentBalance
  for (let i = flow.length - 1; i >= 0; i--) {
    const p = flow[i]
    // "Jun '26" → "2026-06-01"
    const [mon, yr] = p.monthLabel.split(' ')
    const date = `20${yr.slice(1)}-${MONTH_MAP[mon]}-01`
    result.unshift({
      saver_id: saverId,
      snapshot_date: date,
      balance_cents: Math.max(0, b),
    })
    // balance at end of previous month = balance at end of this month + this month's flow
    b += p.flowCents
  }
  return result
}

function KpiCell({
  label,
  value,
  valueClass,
  delta,
  vsPriorLabel,
  detail,
}: {
  label: string
  value: string
  valueClass?: string
  delta?: MonthDelta
  vsPriorLabel?: string
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
      {delta && vsPriorLabel && (
        <ComparisonDeltaBadge delta={delta} vsPriorLabel={vsPriorLabel} />
      )}
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
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const prev = previousCalendarMonth(currentYear, currentMonth)

  const monthlyInsights = useMemo(
    () => getMonthlyInsights(currentYear, currentMonth),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentYear, currentMonth, lastSyncCompletedAt]
  )

  const prevMonthlyInsights = useMemo(
    () => getMonthlyInsights(prev.year, prev.month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prev.year, prev.month, lastSyncCompletedAt]
  )

  const saverData = useMemo(
    () =>
      savers.map((s) => {
        const monthlyFlow = getSaverMonthlyFlow(s.id, 12)
        const derivedBalances = deriveMonthlyBalances(
          monthlyFlow,
          s.id,
          s.balance
        )
        return { account: s, monthlyFlow, derivedBalances }
      }),
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

  const netSavedThis = isNetWithdrawal ? -savedThisMonth : savedThisMonth
  const prevIsWithdrawal = prevMonthlyInsights.saverChanges > 0
  const prevSavedAmount = Math.abs(prevMonthlyInsights.saverChanges)
  const netSavedPrev = prevIsWithdrawal ? -prevSavedAmount : prevSavedAmount
  const savedDelta: MonthDelta | null =
    netSavedThis === 0 && netSavedPrev === 0
      ? null
      : {
          current: netSavedThis,
          previous: netSavedPrev,
          delta: netSavedThis - netSavedPrev,
          direction:
            Math.abs(netSavedThis - netSavedPrev) < 1
              ? 'flat'
              : netSavedThis > netSavedPrev
                ? 'up'
                : 'down',
        }

  const prevMonthLabel = monthNameLong(prev.year, prev.month)
  const monthName = now.toLocaleString(undefined, { month: 'long' })
  const transactionsAllSaversLink = '/transactions?saverActivity=1'

  // Which saver cards have charts expanded (collapsed by default)
  const [expandedCharts, setExpandedCharts] = useState<Set<string>>(new Set())

  function toggleCharts(id: string) {
    setExpandedCharts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Goal editing state — one saver editable at a time
  const [editingGoalFor, setEditingGoalFor] = useState<string | null>(null)
  const [goalDraft, setGoalDraft] = useState('')
  // Local overrides so progress bar updates instantly without re-fetching DB
  const [goalOverrides, setGoalOverrides] = useState<
    Record<string, number | null>
  >({})

  function getGoal(id: string, dbGoal: number | null): number | null {
    return Object.prototype.hasOwnProperty.call(goalOverrides, id)
      ? goalOverrides[id]
      : dbGoal
  }

  function startEditGoal(id: string, currentGoal: number | null) {
    setEditingGoalFor(id)
    setGoalDraft(currentGoal ? (currentGoal / 100).toFixed(2) : '')
  }

  function saveGoal(id: string) {
    const dollars = parseFloat(goalDraft.replace(/[^0-9.]/g, ''))
    const cents =
      isNaN(dollars) || dollars <= 0 ? null : Math.round(dollars * 100)
    updateSaverGoal(id, cents)
    setGoalOverrides((prev) => ({ ...prev, [id]: cents }))
    setEditingGoalFor(null)
    setGoalDraft('')
  }

  function cancelEdit() {
    setEditingGoalFor(null)
    setGoalDraft('')
  }

  function removeGoal(id: string) {
    updateSaverGoal(id, null)
    setGoalOverrides((prev) => ({ ...prev, [id]: null }))
  }

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
              delta={savedDelta ?? undefined}
              vsPriorLabel={prevMonthLabel}
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

      {/* Per-saver cards */}
      {saverData.length === 0 && (
        <Card className="mb-4 border">
          <Card.Body>
            <p className="text-muted mb-0 small">
              No saver accounts in your synced data. Re-sync after creating
              savers in the Up app, or check that your token can see all
              accounts.
            </p>
          </Card.Body>
        </Card>
      )}
      {saverData.map(({ account, monthlyFlow, derivedBalances }) => {
        const hasMonthlyActivity = monthlyFlow.some((p) => p.flowCents !== 0)
        const hasBalance = derivedBalances.some((b) => b.balance_cents > 0)
        const goalCents = getGoal(account.id, account.target_amount_cents)
        const goalPct =
          goalCents && goalCents > 0
            ? Math.min(100, (account.balance / goalCents) * 100)
            : 0
        const goalReached =
          goalCents != null && goalCents > 0 && account.balance >= goalCents

        return (
          <Card key={account.id} className="mb-4 border">
            {/* Card header: saver identity + goal — mirrors tracker card layout */}
            <Card.Header className="py-3">
              {/* Row 1: name (left) + balance (right) */}
              <div className="d-flex justify-content-between align-items-start">
                <strong>{account.display_name}</strong>
                <span
                  className={`fw-semibold ${account.balance > 0 ? 'text-success' : ''}`}
                >
                  ${formatMoney(account.balance)}
                </span>
              </div>

              {/* Goal section */}
              {editingGoalFor === account.id ? (
                <div className="d-flex align-items-center gap-2 mt-2">
                  <div
                    className="input-group input-group-sm"
                    style={{ maxWidth: 180 }}
                  >
                    <span className="input-group-text">$</span>
                    <Form.Control
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={goalDraft}
                      onChange={(e) => setGoalDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveGoal(account.id)
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      autoFocus
                    />
                  </div>
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => saveGoal(account.id)}
                  >
                    Save
                  </button>
                  <button
                    className="btn btn-sm btn-link p-0 text-muted"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </button>
                </div>
              ) : goalCents && goalCents > 0 ? (
                <>
                  {/* Row 2: remaining / reached (right-aligned) — mirrors tracker "X left" */}
                  <div
                    className={`mt-1 text-end small fw-semibold ${goalReached ? 'text-success' : 'text-muted'}`}
                  >
                    {goalReached
                      ? 'Goal reached!'
                      : `$${formatMoney(goalCents - account.balance)} to go`}
                  </div>
                  {/* Row 3: progress bar — mirrors tracker ProgressBar */}
                  <ProgressBar
                    now={Math.min(100, goalPct)}
                    variant="success"
                    striped={goalReached}
                    animated={goalReached}
                    label={`${Math.round(goalPct)}%`}
                  />
                  {/* Row 4: "balance of goal" + actions — mirrors tracker "spent of budget" */}
                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <small className="text-muted">
                      ${formatMoney(account.balance)} of $
                      {formatMoney(goalCents)}
                    </small>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-link p-0 text-muted"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => startEditGoal(account.id, goalCents)}
                      >
                        Edit goal
                      </button>
                      <button
                        className="btn btn-link p-0 text-danger"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => removeGoal(account.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <button
                  className="btn btn-link p-0 mt-1 text-muted small"
                  onClick={() => startEditGoal(account.id, null)}
                >
                  + Set goal
                </button>
              )}

              {/* Charts toggle — mirrors Trackers expand row */}
              <div
                className="d-flex justify-content-between align-items-center mt-2"
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
                onClick={() => toggleCharts(account.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleCharts(account.id)
                  }
                }}
                aria-expanded={expandedCharts.has(account.id)}
              >
                <small className="text-muted">
                  {expandedCharts.has(account.id)
                    ? 'Hide charts'
                    : 'Show charts'}
                </small>
                <i
                  className={`mdi ${expandedCharts.has(account.id) ? 'mdi-chevron-up' : 'mdi-chevron-down'} text-muted`}
                  aria-hidden
                />
              </div>
            </Card.Header>

            {/* Card body: charts — collapsed by default */}
            <Collapse in={expandedCharts.has(account.id)}>
              <div>
                <Card.Body>
                  <p className="small text-muted mb-2">
                    Monthly contributions — last 12 months
                  </p>
                  {hasMonthlyActivity ? (
                    <div
                      style={{ width: '100%', height: 200 }}
                      className="mb-4"
                    >
                      <SaverMonthlyFlowChart
                        data={monthlyFlow}
                        aria-label={`${account.display_name} monthly contributions`}
                      />
                    </div>
                  ) : (
                    <p className="small text-muted mb-4">
                      No transfers recorded for this saver in the last 12
                      months.
                    </p>
                  )}

                  <p className="small text-muted mb-2">Balance over time</p>
                  {hasBalance && derivedBalances.length >= 2 ? (
                    <div
                      style={{ width: '100%', height: 180 }}
                      className="mb-4"
                    >
                      <SaverBalanceChart
                        data={derivedBalances}
                        aria-label={`${account.display_name} balance trend`}
                      />
                    </div>
                  ) : (
                    <p className="small text-muted mb-4">
                      Current balance:{' '}
                      <span className="fw-semibold">
                        ${formatMoney(account.balance)}
                      </span>
                    </p>
                  )}

                  {/* Data verification panel — dev mode only */}
                  {import.meta.env.DEV &&
                    (() => {
                      const impliedStart =
                        account.balance +
                        monthlyFlow.reduce((s, p) => s + p.flowCents, 0)
                      const totalTx = monthlyFlow.reduce(
                        (s, p) => s + p.txCount,
                        0
                      )
                      const totalSaved = monthlyFlow.reduce(
                        (s, p) =>
                          p.flowCents < 0 ? s + Math.abs(p.flowCents) : s,
                        0
                      )
                      const totalWithdrawn = monthlyFlow.reduce(
                        (s, p) => (p.flowCents > 0 ? s + p.flowCents : s),
                        0
                      )
                      const netChange =
                        account.balance - Math.max(0, impliedStart)
                      return (
                        <div
                          className="rounded p-3"
                          style={{
                            background:
                              'var(--bs-tertiary-bg, rgba(0,0,0,0.04))',
                            fontSize: '0.78rem',
                          }}
                        >
                          <p
                            className="fw-semibold mb-2 text-muted"
                            style={{
                              fontSize: '0.72rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Data check
                          </p>
                          <div className="d-flex flex-wrap gap-3">
                            <div>
                              <span className="text-muted">
                                Implied balance 12 mo. ago
                              </span>
                              <br />
                              <span className="fw-semibold">
                                ${formatMoney(Math.max(0, impliedStart))}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted">
                                Current balance
                              </span>
                              <br />
                              <span className="fw-semibold">
                                ${formatMoney(account.balance)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted">
                                Net change (12 mo.)
                              </span>
                              <br />
                              <span
                                className={`fw-semibold ${netChange >= 0 ? 'text-success' : 'text-danger'}`}
                              >
                                {netChange >= 0 ? '+' : '−'}$
                                {formatMoney(Math.abs(netChange))}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted">Contributed</span>
                              <br />
                              <span className="fw-semibold text-success">
                                +${formatMoney(totalSaved)}
                              </span>
                            </div>
                            {totalWithdrawn > 0 && (
                              <div>
                                <span className="text-muted">Withdrawn</span>
                                <br />
                                <span className="fw-semibold text-danger">
                                  −${formatMoney(totalWithdrawn)}
                                </span>
                              </div>
                            )}
                            <div>
                              <span className="text-muted">Transactions</span>
                              <br />
                              <span className="fw-semibold">{totalTx}</span>
                            </div>
                          </div>
                          <p
                            className="mb-0 mt-2 text-muted"
                            style={{ fontSize: '0.7rem' }}
                          >
                            Cross-check: compare &quot;Implied balance 12 mo.
                            ago&quot; and &quot;Current balance&quot; against Up
                            Bank&apos;s account history.
                          </p>
                        </div>
                      )
                    })()}
                </Card.Body>
              </div>
            </Collapse>
          </Card>
        )
      })}

      {saverData.length > 0 && (
        <div className="mb-4">
          <Link
            className="btn btn-outline-primary btn-sm"
            to={transactionsAllSaversLink}
          >
            View all saver transactions
          </Link>
        </div>
      )}

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
