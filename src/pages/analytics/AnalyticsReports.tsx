import { useState, useMemo } from 'react'
import {
  Card,
  Row,
  Col,
  Form,
  Button,
  ProgressBar,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap'
import {
  getMonthComparison,
  getCategoryBreakdownForDateRange,
  getInsightsForDateRange,
  type MonthDelta,
} from '@/services/insights'
import {
  getTrackersWithProgress,
  getTrackerSpentInPeriod,
} from '@/services/trackers'
import {
  getUpcomingChargesForMonth,
  type UpcomingChargeRow,
} from '@/services/upcoming'
import {
  getInsightsCategoryColors,
  normalizeCategoryIdForColor,
} from '@/lib/chartColors'
import { ACCENT_PALETTES } from '@/lib/accentPalettes'
import { useStore } from 'zustand'
import { accentStore } from '@/stores/accentStore'
import { syncStore } from '@/stores/syncStore'
import {
  ComparisonDeltaBadge,
  buildDeltaTooltip,
} from '@/components/atAGlance/ComparisonDeltaBadge'
import { ComparisonVisual } from '@/components/atAGlance/ComparisonVisual'
import { formatMoney, formatDollars } from '@/lib/format'
import {
  monthNameLong,
  previousCalendarMonth,
  comparisonMonthPairLabels,
} from '@/lib/monthLabels'
import type { InsightsChartDatum } from '@/types/charts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDefaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 30)
  return { from: localDateStr(from), to: localDateStr(to) }
}

function getMonthBounds(
  year: number,
  month: number
): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function getExclusiveMonthEnd(year: number, month: number): string {
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
}

function nextCalendarMonth(
  year: number,
  month: number
): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

function trackerProgressStyle(progress: number) {
  if (progress >= 100)
    return { variant: 'danger' as const, striped: true, animated: true }
  if (progress >= 81)
    return { variant: 'danger' as const, striped: false, animated: false }
  if (progress > 50)
    return { variant: 'warning' as const, striped: false, animated: false }
  return { variant: 'success' as const, striped: false, animated: false }
}

type ChargeGroup = {
  id: number
  name: string
  frequency: string
  total: number
  occurrences: number
}

function groupUpcomingCharges(charges: UpcomingChargeRow[]): ChargeGroup[] {
  const map = new Map<number, ChargeGroup>()
  for (const c of charges) {
    const existing = map.get(c.id)
    if (existing) {
      existing.total += c.amount
      existing.occurrences++
    } else {
      map.set(c.id, {
        id: c.id,
        name: c.name,
        frequency: c.frequency,
        total: c.amount,
        occurrences: 1,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

function makeDelta(current: number, previous: number): MonthDelta {
  const delta = current - previous
  const direction: MonthDelta['direction'] =
    Math.abs(delta) < 1 ? 'flat' : delta > 0 ? 'up' : 'down'
  return { current, previous, delta, direction }
}

// ─── Spending Category List ───────────────────────────────────────────────────

function SpendingCategoryList({
  chartData,
}: {
  chartData: InsightsChartDatum[]
}) {
  const totalDollars = chartData.reduce((s, d) => s + d.totalDollars, 0)
  const maxDollars = chartData[0]?.totalDollars ?? 1

  return (
    <div>
      {chartData.map((d) => {
        const barWidth =
          maxDollars > 0 ? (d.totalDollars / maxDollars) * 100 : 0
        const pctOfTotal =
          totalDollars > 0
            ? Math.round((d.totalDollars / totalDollars) * 100)
            : 0

        return (
          <div key={d.category_id} className="mb-3">
            <div className="d-flex align-items-center gap-2 mb-1">
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: d.fill,
                  flexShrink: 0,
                }}
              />
              <span
                className="small fw-medium"
                style={{ flex: 1, minWidth: 0 }}
              >
                {d.name}
              </span>
              <span className="small fw-semibold">
                ${formatDollars(d.totalDollars)}
              </span>
              <span
                className="small text-muted"
                style={{ minWidth: 32, textAlign: 'right' }}
              >
                {pctOfTotal}%
              </span>
            </div>
            <div
              style={{
                marginLeft: 18,
                height: 7,
                borderRadius: 4,
                background: 'var(--bs-secondary-bg, rgba(0,0,0,0.08))',
              }}
            >
              <div
                style={{
                  width: `${barWidth}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: d.fill,
                  opacity: 0.8,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── KPI Cell ─────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  valueClass,
  delta,
  vsPriorLabel,
  invert,
  detail,
}: {
  label: string
  value: string
  valueClass?: string
  delta?: MonthDelta
  vsPriorLabel?: string
  invert?: boolean
  detail?: string
}) {
  const tooltipLines =
    delta && vsPriorLabel ? buildDeltaTooltip(delta, vsPriorLabel, true) : null
  const isPositive = invert
    ? delta?.direction === 'down'
    : delta?.direction === 'up'
  const deltaColor = isPositive ? 'var(--bs-success)' : 'var(--bs-danger)'

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
          invert={invert}
          monetary
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

// ─── Main Export ──────────────────────────────────────────────────────────────

export function AnalyticsReports() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // --- Period state ---
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [isCustomRange, setIsCustomRange] = useState(false)
  const [dateFrom, setDateFrom] = useState(() => getDefaultDateRange().from)
  const [dateTo, setDateTo] = useState(() => getDefaultDateRange().to)

  // --- Derived period ---
  const { from, to } = useMemo(
    () =>
      isCustomRange
        ? { from: dateFrom, to: dateTo }
        : getMonthBounds(year, month),
    [isCustomRange, dateFrom, dateTo, year, month]
  )
  const exclusiveEnd = useMemo(
    () => (isCustomRange ? dateTo : getExclusiveMonthEnd(year, month)),
    [isCustomRange, dateTo, year, month]
  )
  const canGoForward =
    !isCustomRange && !(year === currentYear && month === currentMonth)
  const monthPairLabels = useMemo(
    () => comparisonMonthPairLabels(year, month),
    [year, month]
  )

  // --- Store ---
  const accent = useStore(accentStore, (s) => s.accent)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const chartPalette = ACCENT_PALETTES[accent].chartPalette
  const categoryColors = getInsightsCategoryColors()

  // --- Data ---
  const comparison = useMemo(
    () => (!isCustomRange ? getMonthComparison(from, to) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to, isCustomRange, lastSyncCompletedAt]
  )
  const rangeInsights = useMemo(
    () => (isCustomRange ? getInsightsForDateRange(dateFrom, dateTo) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateFrom, dateTo, isCustomRange, lastSyncCompletedAt]
  )
  const categories = useMemo(
    () => getCategoryBreakdownForDateRange(from, to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to, lastSyncCompletedAt]
  )
  const trackers = useMemo(
    () => getTrackersWithProgress(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt]
  )
  const trackerSpend = useMemo(
    () =>
      trackers.map((t) => ({
        tracker: t,
        spent: getTrackerSpentInPeriod(t.id, from, exclusiveEnd),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackers, from, exclusiveEnd, lastSyncCompletedAt]
  )
  const upcomingCharges = useMemo(
    () => (!isCustomRange ? getUpcomingChargesForMonth(year, month) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isCustomRange, year, month, lastSyncCompletedAt]
  )
  const chargeGroups = useMemo(
    () => groupUpcomingCharges(upcomingCharges),
    [upcomingCharges]
  )

  // --- Derived stats ---
  const moneyIn = comparison
    ? comparison.moneyIn.current
    : (rangeInsights?.moneyIn ?? 0)
  const moneyOut = comparison
    ? comparison.moneyOut.current
    : (rangeInsights?.moneyOut ?? 0)
  const chargesCount = comparison
    ? comparison.charges.current
    : (rangeInsights?.charges ?? 0)
  const net = moneyIn - moneyOut

  const committedTotal = useMemo(
    () => chargeGroups.reduce((s, g) => s + g.total, 0),
    [chargeGroups]
  )

  const netDelta = useMemo(
    () =>
      comparison?.hasPreviousData
        ? makeDelta(
            comparison.moneyIn.current - comparison.moneyOut.current,
            comparison.moneyIn.previous - comparison.moneyOut.previous
          )
        : null,
    [comparison]
  )

  const chartData: InsightsChartDatum[] = useMemo(
    () =>
      categories.map((c, index) => {
        const colorKey = normalizeCategoryIdForColor(c.category_id)
        return {
          category_id: c.category_id ?? '',
          name: c.category_name,
          totalDollars: c.total / 100,
          fill:
            categoryColors[colorKey] ??
            chartPalette[index % chartPalette.length],
          stroke:
            categoryColors[colorKey] ??
            chartPalette[index % chartPalette.length],
        }
      }),
    [categories, categoryColors, chartPalette]
  )
  const totalSpent = categories.reduce((s, c) => s + c.total, 0)
  const top3Total = categories.slice(0, 3).reduce((s, c) => s + c.total, 0)
  const top3Pct =
    totalSpent > 0 ? Math.round((top3Total / totalSpent) * 100) : 0
  const top3Names = categories
    .slice(0, 3)
    .map((c) => c.category_name)
    .join(', ')

  const trackersWithinBudget = trackerSpend.filter(
    ({ tracker, spent }) => spent <= tracker.budget_amount
  ).length

  const committedPct =
    moneyIn > 0 ? Math.round((committedTotal / moneyIn) * 100) : 0

  const periodLabel = isCustomRange
    ? `${dateFrom} → ${dateTo}`
    : `${monthNameLong(year, month)} ${year}`

  // --- Navigation ---
  function goToPrevMonth() {
    const p = previousCalendarMonth(year, month)
    setYear(p.year)
    setMonth(p.month)
  }

  function goToNextMonth() {
    if (!canGoForward) return
    const n = nextCalendarMonth(year, month)
    setYear(n.year)
    setMonth(n.month)
  }

  return (
    <div className="grid-margin">
      {/* ─── Period Selector ─────────────────────────────────────────────── */}
      <Card className="grid-margin">
        <Card.Body className="py-2">
          <div className="d-flex flex-wrap align-items-center gap-3 justify-content-between">
            {!isCustomRange ? (
              <div className="d-flex align-items-center gap-2">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={goToPrevMonth}
                  aria-label="Previous month"
                >
                  <i className="mdi mdi-chevron-left" aria-hidden />
                </Button>
                <span
                  className="fw-medium"
                  style={{ minWidth: 140, textAlign: 'center' }}
                >
                  {monthNameLong(year, month)} {year}
                </span>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={goToNextMonth}
                  disabled={!canGoForward}
                  aria-label="Next month"
                >
                  <i className="mdi mdi-chevron-right" aria-hidden />
                </Button>
              </div>
            ) : (
              <Row className="g-2 align-items-end flex-grow-1">
                <Col xs={12} sm="auto">
                  <Form.Group>
                    <Form.Label className="small mb-1">From</Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      aria-label="Report start date"
                    />
                  </Form.Group>
                </Col>
                <Col xs={12} sm="auto">
                  <Form.Group>
                    <Form.Label className="small mb-1">To</Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      aria-label="Report end date"
                    />
                  </Form.Group>
                </Col>
              </Row>
            )}
            <Button
              variant={isCustomRange ? 'primary' : 'outline-primary'}
              size="sm"
              onClick={() => setIsCustomRange((v) => !v)}
            >
              {isCustomRange ? 'Monthly view' : 'Custom range'}
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* ─── Block 1: Financial Snapshot ──────────────────────────────────── */}
      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">
            {periodLabel} — Financial Snapshot
          </Card.Title>
        </Card.Header>
        <Card.Body>
          <div className="d-flex flex-wrap gap-3">
            <KpiCell
              label="Money in"
              value={`$${formatMoney(moneyIn)}`}
              valueClass="text-success"
              delta={
                comparison?.hasPreviousData ? comparison.moneyIn : undefined
              }
              vsPriorLabel={monthPairLabels.vsPriorShort}
            />
            <KpiCell
              label="Money out"
              value={`$${formatMoney(moneyOut)}`}
              valueClass="text-danger"
              delta={
                comparison?.hasPreviousData ? comparison.moneyOut : undefined
              }
              vsPriorLabel={monthPairLabels.vsPriorShort}
              invert
              detail={
                chargesCount > 0 ? `${chargesCount} transactions` : undefined
              }
            />
            <KpiCell
              label="Net"
              value={`${net >= 0 ? '+' : '−'}$${formatMoney(Math.abs(net))}`}
              valueClass={net >= 0 ? 'text-success' : 'text-danger'}
              delta={
                comparison?.hasPreviousData && netDelta ? netDelta : undefined
              }
              vsPriorLabel={monthPairLabels.vsPriorShort}
            />
            {!isCustomRange && chargeGroups.length > 0 && (
              <KpiCell
                label="Committed"
                value={`$${formatMoney(committedTotal)}`}
                valueClass="text-warning"
                detail={
                  committedPct > 0 ? `${committedPct}% of income` : undefined
                }
              />
            )}
          </div>
        </Card.Body>
      </Card>

      {/* ─── Block 1b: What changed ───────────────────────────────────────── */}
      {!isCustomRange && comparison?.hasPreviousData && (
        <Card className="grid-margin">
          <Card.Header>
            <Card.Title className="mb-0">
              What changed vs {monthPairLabels.previousLabel}
            </Card.Title>
            {comparison.periodNote && (
              <Card.Text as="div" className="small text-muted mt-1">
                {comparison.periodNote}
              </Card.Text>
            )}
          </Card.Header>
          <Card.Body>
            <ComparisonVisual
              comparison={comparison}
              currentLabel={monthPairLabels.currentLabel}
              priorLabel={monthPairLabels.previousLabel}
            />
          </Card.Body>
        </Card>
      )}

      {/* ─── Block 2: Spending Habits ─────────────────────────────────────── */}
      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">Spending Habits</Card.Title>
          {chartData.length > 0 && top3Pct > 0 && (
            <Card.Text as="div" className="small text-muted mt-1">
              {top3Names} account for {top3Pct}% of spending
            </Card.Text>
          )}
        </Card.Header>
        <Card.Body>
          {chartData.length === 0 ? (
            <p className="text-muted mb-0">
              No spending recorded for this period.
            </p>
          ) : (
            <SpendingCategoryList chartData={chartData} />
          )}
        </Card.Body>
      </Card>

      {/* ─── Block 3: Tracker Performance ─────────────────────────────────── */}
      {trackerSpend.length > 0 && (
        <Card className="grid-margin">
          <Card.Header>
            <Card.Title className="mb-0">Tracker Performance</Card.Title>
            <Card.Text as="div" className="small text-muted mt-1">
              Spend vs budget for this period.
              {!isCustomRange &&
                ` ${trackersWithinBudget} of ${trackerSpend.length} within budget.`}
            </Card.Text>
          </Card.Header>
          <Card.Body>
            {trackerSpend.length > 4 ? (
              <ul className="list-group list-group-flush">
                {trackerSpend.map(({ tracker, spent }) => {
                  const progress =
                    tracker.budget_amount > 0
                      ? (spent / tracker.budget_amount) * 100
                      : 0
                  const style = trackerProgressStyle(progress)
                  const overBudget = spent > tracker.budget_amount
                  return (
                    <li key={tracker.id} className="list-group-item px-0 py-2">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="fw-medium small">{tracker.name}</span>
                        <span
                          className={`small ${overBudget ? 'text-danger' : 'text-muted'}`}
                        >
                          ${formatMoney(spent)} / $
                          {formatMoney(tracker.budget_amount)}
                        </span>
                      </div>
                      <ProgressBar
                        now={Math.min(100, progress)}
                        variant={style.variant}
                        striped={style.striped}
                        animated={style.animated}
                        style={{ height: 6 }}
                      />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Row className="g-3">
                {trackerSpend.map(({ tracker, spent }) => {
                  const progress =
                    tracker.budget_amount > 0
                      ? (spent / tracker.budget_amount) * 100
                      : 0
                  const style = trackerProgressStyle(progress)
                  const overBudget = spent > tracker.budget_amount
                  return (
                    <Col key={tracker.id} xs={12} md={6}>
                      <div className="border rounded p-3">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <span className="fw-medium">{tracker.name}</span>
                          <span
                            className="badge bg-secondary"
                            style={{ fontSize: '0.65rem' }}
                          >
                            {tracker.reset_frequency}
                          </span>
                        </div>
                        <ProgressBar
                          now={Math.min(100, progress)}
                          variant={style.variant}
                          striped={style.striped}
                          animated={style.animated}
                          label={`${Math.round(progress)}%`}
                          className="mb-2"
                        />
                        <div
                          className={`small ${overBudget ? 'text-danger' : 'text-muted'}`}
                        >
                          ${formatMoney(spent)} spent · $
                          {formatMoney(tracker.budget_amount)} budget
                          {overBudget && (
                            <span className="ms-1 fw-medium">
                              (${formatMoney(spent - tracker.budget_amount)}{' '}
                              over)
                            </span>
                          )}
                        </div>
                      </div>
                    </Col>
                  )
                })}
              </Row>
            )}
          </Card.Body>
        </Card>
      )}

      {/* ─── Block 4: Committed Charges ───────────────────────────────────── */}
      {!isCustomRange && chargeGroups.length > 0 && (
        <Card className="grid-margin">
          <Card.Header>
            <Card.Title className="mb-0">
              Committed Charges — {monthNameLong(year, month)} {year}
            </Card.Title>
            <Card.Text as="div" className="small text-muted mt-1">
              Recurring and scheduled charges for this month.
            </Card.Text>
          </Card.Header>
          <Card.Body>
            <ul className="list-group list-group-flush">
              {chargeGroups.map((g) => (
                <li
                  key={g.id}
                  className="list-group-item d-flex justify-content-between align-items-center px-0"
                >
                  <span>
                    {g.name}
                    {g.occurrences > 1 && (
                      <span
                        className="ms-2 badge bg-secondary"
                        style={{ fontSize: '0.65rem' }}
                      >
                        ×{g.occurrences}
                      </span>
                    )}
                  </span>
                  <span className="fw-medium">${formatMoney(g.total)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 pt-2 border-top d-flex justify-content-between fw-medium">
              <span>Total committed</span>
              <span>${formatMoney(committedTotal)}</span>
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  )
}
