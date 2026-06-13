import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { Link } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  ProgressBar,
  Form,
  Collapse,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap'
import {
  getAccountsByTypes,
  getSaverMonthlyFlow,
  getSaverGoalDate,
  sumAccountBalancesCents,
  updateSaverGoal,
  updateSaverGoalDate,
  type SaverBalanceSnapshot,
  type SaverMonthlyFlowPoint,
} from '@/services/accounts'
import { getMonthlyInsights } from '@/services/insights'
import type { MonthDelta } from '@/services/insights'
import { formatMoney } from '@/lib/format'
import { syncStore } from '@/stores/syncStore'
import { SaverBalanceChart } from '@/components/charts/SaverBalanceChart'
import { SaverMonthlyFlowChart } from '@/components/charts/SaverMonthlyFlowChart'
import {
  ComparisonDeltaBadge,
  buildDeltaTooltip,
} from '@/components/atAGlance/ComparisonDeltaBadge'
import { previousCalendarMonth, monthNameLong } from '@/lib/monthLabels'
import { getSaverOrder, setSaverOrder } from '@/lib/saverOrder'

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

interface ProjectionResult {
  onTrack: boolean
  lastMonthCents: number
  projectedBalanceCents: number
  monthsRemaining: number
  requiredMonthlyCents: number
}

function computeProjection(
  currentBalanceCents: number,
  goalCents: number,
  monthlyFlow: SaverMonthlyFlowPoint[],
  goalDate: string
): ProjectionResult {
  // Use the most recent complete month as the projected rate — matches Up Bank's
  // payday-split behaviour where each month's contribution is consistent and
  // the latest month is the most representative of the ongoing rate.
  const complete = monthlyFlow.slice(0, -1)
  const lastMonth = complete[complete.length - 1]
  // flowCents is negative for savings; negate to get positive = monthly saving rate
  const lastMonthCents = lastMonth ? -lastMonth.flowCents : 0

  const today = new Date()
  const target = new Date(goalDate)
  const monthsRemaining = Math.max(
    0,
    (target.getFullYear() - today.getFullYear()) * 12 +
      (target.getMonth() - today.getMonth())
  )

  const projectedBalanceCents =
    currentBalanceCents + lastMonthCents * monthsRemaining
  const requiredMonthlyCents =
    monthsRemaining > 0
      ? (goalCents - currentBalanceCents) / monthsRemaining
      : Infinity

  return {
    onTrack: projectedBalanceCents >= goalCents,
    lastMonthCents,
    projectedBalanceCents,
    monthsRemaining,
    requiredMonthlyCents,
  }
}

function formatGoalDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

function KpiCell({
  label,
  value,
  valueClass,
  delta,
  vsPriorLabel,
  detail,
  monetary,
}: {
  label: string
  value: string
  valueClass?: string
  delta?: MonthDelta
  vsPriorLabel?: string
  detail?: string
  monetary?: boolean
}) {
  const tooltipLines =
    delta && vsPriorLabel
      ? buildDeltaTooltip(delta, vsPriorLabel, monetary)
      : null
  const deltaColor =
    delta?.direction === 'up'
      ? 'var(--vantura-success)'
      : 'var(--vantura-danger)'

  const cell = (
    <div
      className="rounded p-3 flex-fill"
      style={{
        background: 'var(--bs-tertiary-bg, rgba(0,0,0,0.04))',
        minWidth: 120,
        cursor: tooltipLines ? 'default' : undefined,
      }}
    >
      <div className="small text-muted mb-1">{label}</div>
      <div className={`fw-semibold fs-5 ${valueClass ?? ''}`}>{value}</div>
      {delta && vsPriorLabel && (
        <ComparisonDeltaBadge
          delta={delta}
          vsPriorLabel={vsPriorLabel}
          monetary={monetary}
        />
      )}
      {detail && (
        <div className="small text-muted mt-1" style={{ fontSize: '0.72rem' }}>
          {detail}
        </div>
      )}
    </div>
  )

  if (!tooltipLines) return cell

  return (
    <OverlayTrigger
      placement="top"
      container={document.body}
      overlay={
        <Tooltip>
          <div>
            <span style={{ color: deltaColor }}>{tooltipLines.amount}</span>{' '}
            {tooltipLines.line1rest}
          </div>
          <div style={{ opacity: 0.75 }}>{tooltipLines.line2}</div>
        </Tooltip>
      }
    >
      {cell}
    </OverlayTrigger>
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
        const goalDate = getSaverGoalDate(s.id)
        return { account: s, monthlyFlow, derivedBalances, goalDate }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savers.map((s) => s.id).join(','), lastSyncCompletedAt]
  )

  // Round-ups (Loose Change) — always a deposit into savers
  const roundUpsThisMonth = Math.abs(monthlyInsights.saverRoundUps)
  const roundUpsPrevMonth = Math.abs(prevMonthlyInsights.saverRoundUps)

  // Self-contributed: net manual transfers (total net movement minus round-ups)
  const selfContribRaw =
    monthlyInsights.saverChanges - monthlyInsights.saverRoundUps
  const selfContribIsWithdrawal = selfContribRaw > 0
  const selfContribAmount = Math.abs(selfContribRaw)
  const netSelfContrib = selfContribIsWithdrawal
    ? -selfContribAmount
    : selfContribAmount

  const prevSelfContribRaw =
    prevMonthlyInsights.saverChanges - prevMonthlyInsights.saverRoundUps
  const prevSelfContribIsWithdrawal = prevSelfContribRaw > 0
  const prevSelfContribAmount = Math.abs(prevSelfContribRaw)
  const netPrevSelfContrib = prevSelfContribIsWithdrawal
    ? -prevSelfContribAmount
    : prevSelfContribAmount

  // Health status: is money net flowing into savers this month?
  const healthStatus: 'on-track' | 'no-activity' | 'withdrawal' =
    monthlyInsights.saverChanges < -1
      ? 'on-track'
      : monthlyInsights.saverChanges > 1
        ? 'withdrawal'
        : 'no-activity'

  // Month-over-month deltas
  const selfContribDelta: MonthDelta | null =
    netSelfContrib === 0 && netPrevSelfContrib === 0
      ? null
      : {
          current: netSelfContrib,
          previous: netPrevSelfContrib,
          delta: netSelfContrib - netPrevSelfContrib,
          direction:
            Math.abs(netSelfContrib - netPrevSelfContrib) < 1
              ? 'flat'
              : netSelfContrib > netPrevSelfContrib
                ? 'up'
                : 'down',
        }

  const roundUpsDelta: MonthDelta | null =
    roundUpsThisMonth === 0 && roundUpsPrevMonth === 0
      ? null
      : {
          current: roundUpsThisMonth,
          previous: roundUpsPrevMonth,
          delta: roundUpsThisMonth - roundUpsPrevMonth,
          direction:
            Math.abs(roundUpsThisMonth - roundUpsPrevMonth) < 1
              ? 'flat'
              : roundUpsThisMonth > roundUpsPrevMonth
                ? 'up'
                : 'down',
        }

  const prevMonthLabel = monthNameLong(prev.year, prev.month)
  const monthName = now.toLocaleString(undefined, { month: 'long' })
  const transactionsAllSaversLink = '/transactions?saverActivity=1'

  // Drag-and-drop order — persisted to app_settings, same pattern as Dashboard sections
  const saverIdsKey = savers.map((s) => s.id).join(',')
  const [saverOrder, setSaverOrderState] = useState<string[]>(() =>
    getSaverOrder(savers.map((s) => s.id))
  )
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const saverIdsRef = useRef<string[]>([])
  saverIdsRef.current = savers.map((s) => s.id)

  useEffect(() => {
    setSaverOrderState(getSaverOrder(saverIdsRef.current))
  }, [saverIdsKey])

  const sortedSaverData = useMemo(() => {
    const orderMap = new Map(saverOrder.map((id, i) => [id, i]))
    return [...saverData].sort((a, b) => {
      const ai = orderMap.get(a.account.id) ?? Infinity
      const bi = orderMap.get(b.account.id) ?? Infinity
      return ai - bi
    })
  }, [saverData, saverOrder])

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverId(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDragOverId(null)
    const sourceId = e.dataTransfer.getData('text/plain')
    if (!sourceId || sourceId === targetId) return
    const order = getSaverOrder(saverIdsRef.current)
    const from = order.indexOf(sourceId)
    const to = order.indexOf(targetId)
    if (from === -1 || to === -1) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, sourceId)
    setSaverOrder(next)
    setSaverOrderState(next)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragOverId(null)
  }, [])

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
  const [goalDateDraft, setGoalDateDraft] = useState('')
  // Local overrides so UI updates instantly without re-fetching DB
  const [goalOverrides, setGoalOverrides] = useState<
    Record<string, number | null>
  >({})
  const [goalDateOverrides, setGoalDateOverrides] = useState<
    Record<string, string | null>
  >({})

  function getGoal(id: string, dbGoal: number | null): number | null {
    return Object.prototype.hasOwnProperty.call(goalOverrides, id)
      ? goalOverrides[id]
      : dbGoal
  }

  function getGoalDate(id: string, dbDate: string | null): string | null {
    return Object.prototype.hasOwnProperty.call(goalDateOverrides, id)
      ? goalDateOverrides[id]
      : dbDate
  }

  function startEditGoal(
    id: string,
    currentGoal: number | null,
    currentDate: string | null
  ) {
    setEditingGoalFor(id)
    setGoalDraft(currentGoal ? (currentGoal / 100).toFixed(2) : '')
    setGoalDateDraft(currentDate ?? '')
  }

  function saveGoal(id: string) {
    const dollars = parseFloat(goalDraft.replace(/[^0-9.]/g, ''))
    const cents =
      isNaN(dollars) || dollars <= 0 ? null : Math.round(dollars * 100)
    updateSaverGoal(id, cents)
    setGoalOverrides((prev) => ({ ...prev, [id]: cents }))
    const dateTrimmed = goalDateDraft.trim()
    updateSaverGoalDate(id, dateTrimmed || null)
    setGoalDateOverrides((prev) => ({ ...prev, [id]: dateTrimmed || null }))
    setEditingGoalFor(null)
    setGoalDraft('')
    setGoalDateDraft('')
  }

  function cancelEdit() {
    setEditingGoalFor(null)
    setGoalDraft('')
    setGoalDateDraft('')
  }

  function removeGoal(id: string) {
    updateSaverGoal(id, null)
    setGoalOverrides((prev) => ({ ...prev, [id]: null }))
    updateSaverGoalDate(id, null)
    setGoalDateOverrides((prev) => ({ ...prev, [id]: null }))
  }

  return (
    <div className="grid-margin">
      <p className="text-muted mb-3">
        Balances sync from Up Bank account type{' '}
        <code className="small">SAVER</code>. &quot;Available&quot; on the
        Dashboard still sums transactional accounts only.
      </p>

      {/* Monthly KPIs */}
      <Card className="grid-margin">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="text-muted mb-0">{monthName} at a glance</h6>
            <span
              className={`badge ${
                healthStatus === 'on-track'
                  ? 'bg-success'
                  : healthStatus === 'withdrawal'
                    ? 'bg-danger'
                    : 'bg-warning text-dark'
              }`}
            >
              {healthStatus === 'on-track'
                ? 'On track'
                : healthStatus === 'withdrawal'
                  ? 'Net withdrawal'
                  : 'No contributions'}
            </span>
          </div>
          <div className="d-flex flex-wrap gap-3">
            <KpiCell
              label="Self-contributed"
              value={
                selfContribRaw === 0
                  ? '$0.00'
                  : selfContribIsWithdrawal
                    ? `-$${formatMoney(selfContribAmount)}`
                    : `+$${formatMoney(selfContribAmount)}`
              }
              valueClass={
                selfContribIsWithdrawal
                  ? 'text-danger'
                  : selfContribRaw < 0
                    ? 'text-success'
                    : undefined
              }
              delta={selfContribDelta ?? undefined}
              vsPriorLabel={prevMonthLabel}
              detail="Manual transfers to savers"
              monetary
            />
            <KpiCell
              label="Round-ups"
              value={`$${formatMoney(roundUpsThisMonth)}`}
              delta={roundUpsDelta ?? undefined}
              vsPriorLabel={prevMonthLabel}
              detail="Loose Change accumulation"
              monetary
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
        <Card className="grid-margin">
          <Card.Body>
            <p className="text-muted mb-0 small">
              No saver accounts in your synced data. Re-sync after creating
              savers in the Up app, or check that your token can see all
              accounts.
            </p>
          </Card.Body>
        </Card>
      )}
      {sortedSaverData.map(
        ({ account, monthlyFlow, derivedBalances, goalDate: dbGoalDate }) => {
          const hasMonthlyActivity = monthlyFlow.some((p) => p.flowCents !== 0)
          const hasBalance = derivedBalances.some((b) => b.balance_cents > 0)
          const goalCents = getGoal(account.id, account.target_amount_cents)
          const goalPct =
            goalCents && goalCents > 0
              ? Math.min(100, (account.balance / goalCents) * 100)
              : 0
          const goalReached =
            goalCents != null && goalCents > 0 && account.balance >= goalCents
          const activeGoalDate = getGoalDate(account.id, dbGoalDate)
          const projection =
            goalCents && goalCents > 0 && activeGoalDate
              ? computeProjection(
                  account.balance,
                  goalCents,
                  monthlyFlow,
                  activeGoalDate
                )
              : null

          return (
            <div
              key={account.id}
              className="grid-margin"
              onDragOver={(e) => handleDragOver(e, account.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, account.id)}
              onDragEnd={handleDragEnd}
              style={{
                outline:
                  dragOverId === account.id
                    ? '2px dashed var(--vantura-primary)'
                    : undefined,
                borderRadius: 8,
              }}
            >
              <Card>
                {/* Card header: saver identity + goal — mirrors tracker card layout */}
                <Card.Header className="py-3">
                  {/* Row 1: name (left) + balance (right) */}
                  <div className="d-flex justify-content-between align-items-start">
                    <strong
                      draggable
                      onDragStart={(e) => handleDragStart(e, account.id)}
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                      style={{ cursor: 'grab' }}
                    >
                      {account.display_name}
                    </strong>
                    <span
                      className={`fw-semibold ${account.balance > 0 ? 'text-success' : ''}`}
                    >
                      ${formatMoney(account.balance)}
                    </span>
                  </div>

                  {/* Goal section */}
                  {editingGoalFor === account.id ? (
                    <div className="mt-2">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
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
                        <Form.Control
                          type="date"
                          size="sm"
                          value={goalDateDraft}
                          onChange={(e) => setGoalDateDraft(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          style={{ maxWidth: 160 }}
                          title="Target date (optional)"
                        />
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
                      <div className="small text-muted mt-1">
                        Target date is optional — used to project whether
                        you&apos;re on track.
                      </div>
                    </div>
                  ) : goalCents && goalCents > 0 ? (
                    <>
                      {/* Row 2: remaining / reached + optional deadline */}
                      <div
                        className={`mt-1 text-end small fw-semibold ${goalReached ? 'text-success' : 'text-muted'}`}
                      >
                        {goalReached
                          ? 'Goal reached!'
                          : `$${formatMoney(goalCents - account.balance)} to go`}
                        {activeGoalDate && (
                          <span className="fw-normal ms-1">
                            · by {formatGoalDate(activeGoalDate)}
                          </span>
                        )}
                      </div>
                      {/* Row 3: progress bar */}
                      <ProgressBar
                        now={Math.min(100, goalPct)}
                        variant="success"
                        striped={goalReached}
                        animated={goalReached}
                        label={`${Math.round(goalPct)}%`}
                      />
                      {/* Row 4: "balance of goal" + actions */}
                      <div className="d-flex justify-content-between align-items-center mt-1">
                        <small className="text-muted">
                          ${formatMoney(account.balance)} of $
                          {formatMoney(goalCents)}
                        </small>
                        <div className="d-flex gap-2">
                          <button
                            className="btn btn-link p-0 text-muted"
                            style={{ fontSize: '0.75rem' }}
                            onClick={() =>
                              startEditGoal(
                                account.id,
                                goalCents,
                                activeGoalDate
                              )
                            }
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
                      {/* Row 5: on-track projection badge (only when a target date is set) */}
                      {projection && projection.monthsRemaining > 0 && (
                        <div
                          className="d-flex justify-content-end mt-2 pt-2"
                          style={{
                            borderTop:
                              '1px solid var(--bs-border-color, var(--vantura-border))',
                          }}
                        >
                          {projection.lastMonthCents <= 0 ? (
                            <span className="badge bg-secondary">
                              No history
                            </span>
                          ) : projection.onTrack ? (
                            <span className="badge bg-success">On track</span>
                          ) : (
                            <OverlayTrigger
                              placement="top"
                              container={document.body}
                              overlay={
                                <Tooltip>
                                  <div>
                                    <span
                                      style={{
                                        color: 'var(--vantura-warning)',
                                      }}
                                    >
                                      Need $
                                      {formatMoney(
                                        projection.requiredMonthlyCents
                                      )}
                                      /mo
                                    </span>{' '}
                                    to reach goal by{' '}
                                    {formatGoalDate(activeGoalDate!)}
                                  </div>
                                  <div style={{ opacity: 0.75 }}>
                                    Last mo. $
                                    {formatMoney(projection.lastMonthCents)} ·
                                    +$
                                    {formatMoney(
                                      projection.requiredMonthlyCents -
                                        projection.lastMonthCents
                                    )}
                                    /mo more needed
                                  </div>
                                </Tooltip>
                              }
                            >
                              <span
                                className="badge bg-warning text-dark"
                                style={{ cursor: 'default' }}
                              >
                                Behind pace
                              </span>
                            </OverlayTrigger>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      className="btn btn-link p-0 mt-1 text-muted small"
                      onClick={() => startEditGoal(account.id, null, null)}
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
                      {hasMonthlyActivity ? (
                        <>
                          <p className="small text-muted mb-2">
                            Monthly contributions — last 12 months
                          </p>
                          <div
                            style={{ width: '100%', height: 200 }}
                            className="mb-4"
                          >
                            <SaverMonthlyFlowChart
                              data={monthlyFlow}
                              aria-label={`${account.display_name} monthly contributions`}
                            />
                          </div>
                        </>
                      ) : (
                        <p className="small text-muted mb-4">
                          No transfers recorded for this saver in the last 12
                          months.
                        </p>
                      )}

                      {hasBalance && derivedBalances.length >= 2 ? (
                        <>
                          <p className="small text-muted mb-2">
                            Balance over time
                          </p>
                          <div
                            style={{ width: '100%', height: 180 }}
                            className="mb-4"
                          >
                            <SaverBalanceChart
                              data={derivedBalances}
                              aria-label={`${account.display_name} balance trend`}
                            />
                          </div>
                        </>
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
                                  <span className="text-muted">
                                    Contributed
                                  </span>
                                  <br />
                                  <span className="fw-semibold text-success">
                                    +${formatMoney(totalSaved)}
                                  </span>
                                </div>
                                {totalWithdrawn > 0 && (
                                  <div>
                                    <span className="text-muted">
                                      Withdrawn
                                    </span>
                                    <br />
                                    <span className="fw-semibold text-danger">
                                      −${formatMoney(totalWithdrawn)}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted">
                                    Transactions
                                  </span>
                                  <br />
                                  <span className="fw-semibold">{totalTx}</span>
                                </div>
                              </div>
                              <p
                                className="mb-0 mt-2 text-muted"
                                style={{ fontSize: '0.7rem' }}
                              >
                                Cross-check: compare &quot;Implied balance 12
                                mo. ago&quot; and &quot;Current balance&quot;
                                against Up Bank&apos;s account history.
                              </p>
                            </div>
                          )
                        })()}
                    </Card.Body>
                  </div>
                </Collapse>
              </Card>
            </div>
          )
        }
      )}

      {sortedSaverData.length > 0 && (
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
        <Card className="grid-margin">
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
                  <Card className="h-100">
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
