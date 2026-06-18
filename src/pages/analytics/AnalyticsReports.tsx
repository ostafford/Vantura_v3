import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Form,
  Button,
  OverlayTrigger,
  Tooltip,
  ProgressBar,
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
  getTrackerPeriodsInRange,
  type TrackerPeriodSlice,
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
import { ComparisonDeltaBadge } from '@/components/atAGlance/ComparisonDeltaBadge'
import { buildDeltaTooltip } from '@/components/atAGlance/deltaTooltip'
import { ComparisonVisual } from '@/components/atAGlance/ComparisonVisual'
import { PageBreadcrumb } from '@/components/PageBreadcrumb'
import { formatMoney, formatDollars, formatDate } from '@/lib/format'
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

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
  MONTHLY: 'Monthly',
  PAYDAY: 'Payday',
}

function trackerBarColor(progress: number): string {
  if (progress >= 81) return 'var(--vantura-danger)'
  if (progress > 50) return 'var(--vantura-warning)'
  return 'var(--vantura-success)'
}

function getProgressVariant(progress: number): {
  variant: 'success' | 'warning' | 'danger'
  striped: boolean
  animated: boolean
} {
  if (progress >= 100)
    return { variant: 'danger', striped: true, animated: true }
  if (progress >= 81)
    return { variant: 'danger', striped: false, animated: false }
  if (progress > 50)
    return { variant: 'warning', striped: false, animated: false }
  return { variant: 'success', striped: false, animated: false }
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

function formatFrequency(freq: string): string {
  switch (freq.toUpperCase()) {
    case 'WEEKLY':
      return 'Weekly'
    case 'FORTNIGHTLY':
      return 'Fortnightly'
    case 'MONTHLY':
      return 'Monthly'
    case 'QUARTERLY':
      return 'Quarterly'
    case 'YEARLY':
      return 'Yearly'
    case 'ONCE':
      return 'One-time'
    default:
      return freq.charAt(0).toUpperCase() + freq.slice(1).toLowerCase()
  }
}

function makeDelta(current: number, previous: number): MonthDelta {
  const delta = current - previous
  const direction: MonthDelta['direction'] =
    Math.abs(delta) < 1 ? 'flat' : delta > 0 ? 'up' : 'down'
  return { current, previous, delta, direction }
}

// ─── Spending Category List ───────────────────────────────────────────────────

const SPENDING_LIST_DEFAULT_VISIBLE = 8

function SpendingCategoryList({
  chartData,
  from,
  to,
}: {
  chartData: InsightsChartDatum[]
  from: string
  to: string
}) {
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)
  const totalDollars = chartData.reduce((s, d) => s + d.totalDollars, 0)
  const maxDollars = chartData[0]?.totalDollars ?? 1
  const visible = showAll
    ? chartData
    : chartData.slice(0, SPENDING_LIST_DEFAULT_VISIBLE)
  const hiddenCount = chartData.length - SPENDING_LIST_DEFAULT_VISIBLE

  return (
    <div>
      {visible.map((d) => {
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
                style={{
                  flex: 1,
                  minWidth: 0,
                  cursor: 'pointer',
                  color: 'var(--vantura-primary)',
                }}
                onClick={() => {
                  const params = new URLSearchParams()
                  params.set('dateFrom', from)
                  params.set('dateTo', to)
                  params.append(
                    'categoryId',
                    d.category_id || '__uncategorised__'
                  )
                  navigate(`/transactions?${params.toString()}`)
                }}
                title={`View ${d.name} transactions`}
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
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.25rem 0',
            cursor: 'pointer',
            fontSize: '0.8rem',
            color: 'var(--vantura-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            marginTop: '0.25rem',
          }}
        >
          <i
            className={`mdi ${showAll ? 'mdi-chevron-up' : 'mdi-chevron-down'}`}
            aria-hidden
          />
          {showAll ? 'Show less' : `Show ${hiddenCount} more`}
        </button>
      )}
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
  const deltaColor = isPositive
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

  // --- Tracker frequency filter ---
  const [trackerFreqFilter, setTrackerFreqFilter] = useState('MONTHLY')

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
  const prevMonthBounds = useMemo(() => {
    if (isCustomRange) return null
    const { year: py, month: pm } = previousCalendarMonth(year, month)
    return {
      from: getMonthBounds(py, pm).from,
      exclusiveEnd: getExclusiveMonthEnd(py, pm),
      label: monthNameLong(py, pm),
    }
  }, [isCustomRange, year, month])

  const trackerSpend = useMemo(
    () =>
      trackers.map((t) => ({
        tracker: t,
        spent: getTrackerSpentInPeriod(t.id, from, exclusiveEnd),
        prevSpent: prevMonthBounds
          ? getTrackerSpentInPeriod(
              t.id,
              prevMonthBounds.from,
              prevMonthBounds.exclusiveEnd
            )
          : null,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackers, from, exclusiveEnd, prevMonthBounds, lastSyncCompletedAt]
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

  const [chargeFreqFilter, setChargeFreqFilter] = useState('MONTHLY')

  const availableChargeFrequencies = useMemo(() => {
    const seen = new Set(chargeGroups.map((g) => g.frequency.toUpperCase()))
    return [
      'WEEKLY',
      'FORTNIGHTLY',
      'MONTHLY',
      'QUARTERLY',
      'YEARLY',
      'ONCE',
    ].filter((f) => seen.has(f))
  }, [chargeGroups])

  useEffect(() => {
    if (availableChargeFrequencies.length === 0) return
    if (
      !chargeFreqFilter ||
      !availableChargeFrequencies.includes(chargeFreqFilter)
    ) {
      const preferred = availableChargeFrequencies.includes('MONTHLY')
        ? 'MONTHLY'
        : availableChargeFrequencies[0]
      setChargeFreqFilter(preferred)
    }
  }, [availableChargeFrequencies, chargeFreqFilter])

  const filteredChargeGroups = chargeFreqFilter
    ? chargeGroups.filter((g) => g.frequency.toUpperCase() === chargeFreqFilter)
    : chargeGroups

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

  const availableFrequencies = useMemo(() => {
    const seen = new Set(trackers.map((t) => t.reset_frequency.toUpperCase()))
    return ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'PAYDAY'].filter((f) =>
      seen.has(f)
    )
  }, [trackers])

  useEffect(() => {
    if (availableFrequencies.length === 0) return
    if (
      !trackerFreqFilter ||
      !availableFrequencies.includes(trackerFreqFilter)
    ) {
      const preferred = availableFrequencies.includes('MONTHLY')
        ? 'MONTHLY'
        : availableFrequencies[0]
      setTrackerFreqFilter(preferred)
    }
  }, [availableFrequencies, trackerFreqFilter])

  const filteredTrackerSpend = trackerFreqFilter
    ? trackerSpend.filter(
        (r) =>
          r.tracker.reset_frequency.toUpperCase() ===
          trackerFreqFilter.toUpperCase()
      )
    : trackerSpend

  const trackersWithinBudget = filteredTrackerSpend.filter(
    ({ tracker, spent }) => spent <= tracker.budget_amount
  ).length

  // Per-period breakdowns for sub-monthly trackers (WEEKLY, FORTNIGHTLY).
  // Only computed for calendar month views, not custom date ranges.
  const trackerPeriodBreakdowns = useMemo((): Record<
    number,
    TrackerPeriodSlice[]
  > => {
    if (isCustomRange) return {}
    const result: Record<number, TrackerPeriodSlice[]> = {}
    for (const { tracker } of filteredTrackerSpend) {
      const freq = tracker.reset_frequency.toUpperCase()
      if (freq === 'WEEKLY' || freq === 'FORTNIGHTLY') {
        result[tracker.id] = getTrackerPeriodsInRange(
          tracker,
          from,
          exclusiveEnd
        )
      }
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filteredTrackerSpend,
    from,
    exclusiveEnd,
    isCustomRange,
    lastSyncCompletedAt,
  ])

  const committedPct =
    moneyIn > 0 ? Math.round((committedTotal / moneyIn) * 100) : 0

  const periodLabel = isCustomRange
    ? `${formatDate(dateFrom)} → ${formatDate(dateTo)}`
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
      {/* ─── Combined sticky toolbar: title + breadcrumb + period controls ── */}
      <div className="sticky-toolbar">
        <div
          className="page-header"
          style={{ margin: 0, paddingBottom: '0.5rem' }}
        >
          <h3 className="page-title">
            <span className="page-title-icon bg-gradient-primary text-white mr-2">
              <i className="mdi mdi-file-chart" aria-hidden />
            </span>
            Reports
          </h3>
          <PageBreadcrumb
            items={[
              { label: 'Dashboard', to: '/' },
              { label: 'Analytics', to: '/analytics' },
              { label: 'Reports' },
            ]}
          />
        </div>
        <div className="d-flex flex-wrap align-items-center gap-3 justify-content-center">
          {!isCustomRange ? (
            <div className="d-flex align-items-center gap-1">
              <button
                type="button"
                className="btn-icon"
                onClick={goToPrevMonth}
                aria-label="Previous month"
              >
                <i className="mdi mdi-chevron-left" aria-hidden />
              </button>
              <span
                className="fw-medium"
                style={{ minWidth: 140, textAlign: 'center' }}
              >
                {monthNameLong(year, month)} {year}
              </span>
              <button
                type="button"
                className="btn-icon"
                onClick={goToNextMonth}
                disabled={!canGoForward}
                aria-label="Next month"
              >
                <i className="mdi mdi-chevron-right" aria-hidden />
              </button>
            </div>
          ) : (
            <Row className="g-2 align-items-end">
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
            aria-label={
              isCustomRange
                ? 'Switch to monthly view'
                : 'Switch to custom range'
            }
            title={isCustomRange ? 'Monthly view' : 'Custom range'}
          >
            <i
              className={`mdi ${isCustomRange ? 'mdi-calendar-month' : 'mdi-calendar-range'}`}
              aria-hidden
            />
          </Button>
        </div>
      </div>

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
                label="Upcoming"
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
            <p className="text-muted small mb-0">
              No spending recorded for this period.
            </p>
          ) : (
            <SpendingCategoryList chartData={chartData} from={from} to={to} />
          )}
        </Card.Body>
      </Card>

      {/* ─── Block 3: Tracker Performance ─────────────────────────────────── */}
      {trackerSpend.length > 0 && (
        <Card className="grid-margin">
          <Card.Header>
            <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
              <div>
                <Card.Title className="mb-0">
                  Tracker Performance — {periodLabel}
                </Card.Title>
                <Card.Text as="div" className="small text-muted mt-1">
                  {!isCustomRange &&
                    `${trackersWithinBudget} of ${filteredTrackerSpend.length} within budget.`}
                  {prevMonthBounds && ` Compared to ${prevMonthBounds.label}.`}
                </Card.Text>
              </div>
              <Form.Select
                size="sm"
                value={trackerFreqFilter}
                onChange={(e) => setTrackerFreqFilter(e.target.value)}
                aria-label="Filter by frequency"
                style={{ width: 'auto', minWidth: 150 }}
              >
                {availableFrequencies.length > 1 && (
                  <option value="">All frequencies</option>
                )}
                {availableFrequencies.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f] ?? f}
                  </option>
                ))}
              </Form.Select>
            </div>
          </Card.Header>
          <Card.Body>
            {filteredTrackerSpend.length === 0 ? (
              <p className="text-muted mb-0 small">
                No trackers match the selected frequency.
              </p>
            ) : filteredTrackerSpend.length > 4 ? (
              /* ── List view (compact, >4 trackers) ── */
              <ul className="list-group list-group-flush">
                {filteredTrackerSpend.map(({ tracker, spent, prevSpent }) => {
                  const budget = tracker.budget_amount
                  const spendDelta =
                    prevSpent !== null ? spent - prevSpent : null
                  const hasDelta =
                    spendDelta !== null && Math.abs(spendDelta) >= 1
                  const deltaColor = hasDelta
                    ? spendDelta! > 0
                      ? 'var(--vantura-danger)'
                      : 'var(--vantura-success)'
                    : undefined
                  const periods = trackerPeriodBreakdowns[tracker.id]

                  if (periods) {
                    // Weekly / fortnightly — show each period as a sub-row
                    const hasPartial = periods.some((p) => p.isPartial)
                    return (
                      <li
                        key={tracker.id}
                        className="list-group-item px-0 py-2"
                      >
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="fw-medium small">
                            {tracker.name}
                          </span>
                          <div className="d-flex align-items-center gap-2">
                            <span className="small text-muted">
                              ${formatMoney(spent)} total
                            </span>
                            {hasDelta && spendDelta !== null && (
                              <span
                                className="small fw-medium"
                                style={{ color: deltaColor }}
                              >
                                {spendDelta > 0 ? '↑' : '↓'} $
                                {formatMoney(Math.abs(spendDelta))} vs{' '}
                                {prevMonthBounds?.label}
                              </span>
                            )}
                          </div>
                        </div>
                        {periods.map((p) => (
                          <div
                            key={p.periodStart}
                            className="mb-2"
                            style={{ paddingLeft: 8 }}
                          >
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <span
                                className="text-muted"
                                style={{ fontSize: '0.75rem' }}
                              >
                                {p.label}
                                {p.isPartial && ' *'}
                              </span>
                              <span style={{ fontSize: '0.75rem' }}>
                                <span
                                  style={{ color: trackerBarColor(p.progress) }}
                                >
                                  ${formatMoney(p.spent)}
                                </span>
                                <span className="text-muted">
                                  {' '}
                                  / ${formatMoney(p.budget)}
                                </span>
                              </span>
                            </div>
                            <ProgressBar
                              now={Math.min(100, p.progress)}
                              {...getProgressVariant(p.progress)}
                              label={`${Math.round(p.progress)}%`}
                              style={{ height: 13 }}
                            />
                          </div>
                        ))}
                        {hasPartial && (
                          <div
                            className="text-muted"
                            style={{ fontSize: '0.7rem', paddingLeft: 8 }}
                          >
                            * Partial week — spans into adjacent month
                          </div>
                        )}
                      </li>
                    )
                  }

                  // Monthly — single bar
                  const progress = budget > 0 ? (spent / budget) * 100 : 0
                  const overBudget = spent > budget
                  return (
                    <OverlayTrigger
                      key={tracker.id}
                      placement="top"
                      container={document.body}
                      overlay={
                        <Tooltip>
                          <div>
                            <span
                              style={{
                                color: overBudget
                                  ? 'var(--vantura-danger)'
                                  : 'var(--vantura-success)',
                              }}
                            >
                              ${formatMoney(spent)}
                            </span>{' '}
                            spent · ${formatMoney(budget)} budget
                          </div>
                          {prevSpent !== null && prevMonthBounds && (
                            <div style={{ opacity: 0.75 }}>
                              ${formatMoney(prevSpent)} in{' '}
                              {prevMonthBounds.label}
                            </div>
                          )}
                          {hasDelta && spendDelta !== null && (
                            <div style={{ color: deltaColor }}>
                              {spendDelta > 0 ? '↑' : '↓'} $
                              {formatMoney(Math.abs(spendDelta))}{' '}
                              {spendDelta > 0 ? 'more' : 'less'} than{' '}
                              {prevMonthBounds?.label}
                            </div>
                          )}
                        </Tooltip>
                      }
                    >
                      <li className="list-group-item px-0 py-2">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="fw-medium small">
                            {tracker.name}
                          </span>
                          <div className="d-flex align-items-center gap-2">
                            <span className="small">
                              <span
                                style={{ color: trackerBarColor(progress) }}
                              >
                                ${formatMoney(spent)}
                              </span>
                              <span className="text-muted">
                                {' '}
                                / ${formatMoney(budget)}
                              </span>
                            </span>
                            {hasDelta && spendDelta !== null && (
                              <span
                                className="small fw-medium"
                                style={{ color: deltaColor }}
                              >
                                {spendDelta > 0 ? '↑' : '↓'} $
                                {formatMoney(Math.abs(spendDelta))}
                              </span>
                            )}
                          </div>
                        </div>
                        <ProgressBar
                          now={Math.min(100, progress)}
                          {...getProgressVariant(progress)}
                          label={`${Math.round(progress)}%`}
                          style={{ height: 13 }}
                        />
                      </li>
                    </OverlayTrigger>
                  )
                })}
              </ul>
            ) : (
              /* ── Card view (detailed, ≤4 trackers) ── */
              <Row className="g-3">
                {filteredTrackerSpend.map(({ tracker, spent, prevSpent }) => {
                  const budget = tracker.budget_amount
                  const spendDelta =
                    prevSpent !== null ? spent - prevSpent : null
                  const hasDelta =
                    spendDelta !== null && Math.abs(spendDelta) >= 1
                  const deltaColor = hasDelta
                    ? spendDelta! > 0
                      ? 'var(--vantura-danger)'
                      : 'var(--vantura-success)'
                    : undefined
                  const periods = trackerPeriodBreakdowns[tracker.id]

                  if (periods) {
                    // Weekly / fortnightly card — per-period breakdown
                    const hasPartial = periods.some((p) => p.isPartial)
                    return (
                      <Col key={tracker.id} xs={12} md={6}>
                        <div className="border rounded p-3">
                          <div className="d-flex justify-content-between align-items-start mb-1">
                            <span className="fw-medium">{tracker.name}</span>
                            {tracker.badge_color?.trim() ? (
                              <span
                                className="badge badge-frequency-custom"
                                style={{
                                  backgroundColor: tracker.badge_color.trim(),
                                }}
                              >
                                {FREQUENCY_LABELS[tracker.reset_frequency] ??
                                  tracker.reset_frequency}
                              </span>
                            ) : (
                              <span className="badge badge-frequency-default">
                                {FREQUENCY_LABELS[tracker.reset_frequency] ??
                                  tracker.reset_frequency}
                              </span>
                            )}
                          </div>
                          <div className="small text-muted mb-3">
                            ${formatMoney(spent)} total
                            {hasDelta && spendDelta !== null && (
                              <span
                                className="ms-2 fw-medium"
                                style={{ color: deltaColor }}
                              >
                                {spendDelta > 0 ? '↑' : '↓'} $
                                {formatMoney(Math.abs(spendDelta))} vs{' '}
                                {prevMonthBounds?.label}
                              </span>
                            )}
                          </div>
                          {periods.map((p) => (
                            <div key={p.periodStart} className="mb-3">
                              <div className="d-flex justify-content-between align-items-center mb-1">
                                <span className="small text-muted">
                                  {p.label}
                                  {p.isPartial && ' *'}
                                </span>
                                <span className="small">
                                  <span
                                    style={{
                                      color: trackerBarColor(p.progress),
                                    }}
                                  >
                                    ${formatMoney(p.spent)}
                                  </span>
                                  <span className="text-muted">
                                    {' '}
                                    / ${formatMoney(p.budget)}
                                  </span>
                                </span>
                              </div>
                              <ProgressBar
                                now={Math.min(100, p.progress)}
                                {...getProgressVariant(p.progress)}
                                label={`${Math.round(p.progress)}%`}
                                style={{ height: 13 }}
                              />
                            </div>
                          ))}
                          {hasPartial && (
                            <div
                              className="text-muted mt-1"
                              style={{ fontSize: '0.7rem' }}
                            >
                              * Partial week — spans into adjacent month
                            </div>
                          )}
                        </div>
                      </Col>
                    )
                  }

                  // Monthly card — single bar
                  const progress = budget > 0 ? (spent / budget) * 100 : 0
                  const overBudget = spent > budget
                  return (
                    <Col key={tracker.id} xs={12} md={6}>
                      <OverlayTrigger
                        placement="top"
                        container={document.body}
                        overlay={
                          <Tooltip>
                            <div>
                              <span
                                style={{
                                  color: overBudget
                                    ? 'var(--vantura-danger)'
                                    : 'var(--vantura-success)',
                                }}
                              >
                                ${formatMoney(spent)}
                              </span>{' '}
                              spent · ${formatMoney(budget)} budget
                            </div>
                            {prevSpent !== null && prevMonthBounds && (
                              <div style={{ opacity: 0.75 }}>
                                ${formatMoney(prevSpent)} in{' '}
                                {prevMonthBounds.label}
                              </div>
                            )}
                            {hasDelta && spendDelta !== null && (
                              <div style={{ color: deltaColor }}>
                                {spendDelta > 0 ? '↑' : '↓'} $
                                {formatMoney(Math.abs(spendDelta))}{' '}
                                {spendDelta > 0 ? 'more' : 'less'} than{' '}
                                {prevMonthBounds?.label}
                              </div>
                            )}
                          </Tooltip>
                        }
                      >
                        <div className="border rounded p-3">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <span className="fw-medium">{tracker.name}</span>
                            {tracker.badge_color?.trim() ? (
                              <span
                                className="badge badge-frequency-custom"
                                style={{
                                  backgroundColor: tracker.badge_color.trim(),
                                }}
                              >
                                {FREQUENCY_LABELS[tracker.reset_frequency] ??
                                  tracker.reset_frequency}
                              </span>
                            ) : (
                              <span className="badge badge-frequency-default">
                                {FREQUENCY_LABELS[tracker.reset_frequency] ??
                                  tracker.reset_frequency}
                              </span>
                            )}
                          </div>
                          <ProgressBar
                            now={Math.min(100, progress)}
                            {...getProgressVariant(progress)}
                            label={`${Math.round(progress)}%`}
                            style={{ height: 13 }}
                            className="mb-2"
                          />
                          <div className="small mt-2">
                            <span style={{ color: trackerBarColor(progress) }}>
                              ${formatMoney(spent)} spent
                            </span>
                            <span className="text-muted">
                              {' '}
                              · ${formatMoney(budget)} budget
                              {overBudget && (
                                <span
                                  className="ms-1 fw-medium"
                                  style={{ color: trackerBarColor(progress) }}
                                >
                                  (${formatMoney(spent - budget)} over)
                                </span>
                              )}
                            </span>
                          </div>
                          {hasDelta && spendDelta !== null && (
                            <div
                              className="small mt-1 fw-medium"
                              style={{ color: deltaColor }}
                            >
                              {spendDelta > 0 ? '↑' : '↓'} $
                              {formatMoney(Math.abs(spendDelta))}{' '}
                              {spendDelta > 0 ? 'more' : 'less'} than{' '}
                              {prevMonthBounds?.label}
                            </div>
                          )}
                        </div>
                      </OverlayTrigger>
                    </Col>
                  )
                })}
              </Row>
            )}
          </Card.Body>
        </Card>
      )}

      {/* ─── Block 4: Upcoming Charges ────────────────────────────────────── */}
      {!isCustomRange && chargeGroups.length > 0 && (
        <Card className="grid-margin">
          <Card.Header>
            <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
              <div>
                <Card.Title className="mb-0">
                  Upcoming Charges — {monthNameLong(year, month)} {year}
                </Card.Title>
                <Card.Text as="div" className="small text-muted mt-1">
                  Upcoming charges for this month.
                </Card.Text>
              </div>
              <Form.Select
                size="sm"
                value={chargeFreqFilter}
                onChange={(e) => setChargeFreqFilter(e.target.value)}
                aria-label="Filter by frequency"
                style={{ width: 'auto', minWidth: 150 }}
              >
                {availableChargeFrequencies.length > 1 && (
                  <option value="">All frequencies</option>
                )}
                {availableChargeFrequencies.map((f) => (
                  <option key={f} value={f}>
                    {formatFrequency(f)}
                  </option>
                ))}
              </Form.Select>
            </div>
          </Card.Header>
          <Card.Body>
            {(() => {
              const maxTotal = filteredChargeGroups[0]?.total ?? 1
              return filteredChargeGroups.map((g) => {
                const perOccurrence = g.total / g.occurrences
                const barWidth = (g.total / maxTotal) * 100
                return (
                  <div key={g.id} className="mb-3">
                    <div className="d-flex align-items-baseline justify-content-between gap-2 mb-1">
                      <span
                        className="fw-medium small"
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        {g.name}
                      </span>
                      <span className="fw-medium small">
                        ${formatMoney(g.total)}
                      </span>
                    </div>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <span
                        className="badge"
                        style={{
                          fontSize: '0.65rem',
                          background: 'var(--vantura-surface)',
                          color: 'var(--vantura-text-secondary)',
                          border: '1px solid var(--vantura-border)',
                          fontWeight: 500,
                        }}
                      >
                        {formatFrequency(g.frequency)}
                      </span>
                      <span
                        className="text-muted"
                        style={{ fontSize: '0.75rem' }}
                      >
                        ${formatMoney(perOccurrence)}
                        {g.occurrences > 1 && <> × {g.occurrences}</>}
                      </span>
                    </div>
                    <div
                      style={{
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
                          background: 'var(--vantura-primary)',
                          opacity: 0.75,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                )
              })
            })()}
            <div className="pt-2 border-top d-flex justify-content-between fw-medium small">
              <span>Total upcoming</span>
              <span>
                $
                {formatMoney(
                  filteredChargeGroups.reduce((s, g) => s + g.total, 0)
                )}
              </span>
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  )
}
