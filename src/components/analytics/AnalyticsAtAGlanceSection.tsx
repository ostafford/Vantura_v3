import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from 'zustand'
import {
  Card,
  Form,
  OverlayTrigger,
  Tooltip as BSTooltip,
} from 'react-bootstrap'
import {
  getYearMonthlyTotals,
  getMonthComparison,
  getMonthDayByDaySeries,
  getMonthBoundsForOffset,
  getYearComparison,
  getYearComparisonPeriods,
  getWeekComparison,
  getWeekDayByDaySeries,
  getWeekRange,
  type YearMonthPoint,
} from '@/services/insights'
import type { MonthMetric } from '@/lib/monthSpendingSeries'
import { YearMonthlyLineChart } from '@/components/charts/YearMonthlyLineChart'
import { MonthSpendingComparisonChart } from '@/components/charts/MonthSpendingComparisonChart'
import {
  getMonthComparisonSemanticStrokes,
  getYearMonthlySemanticStrokes,
} from '@/components/charts/monthComparisonSemanticStrokes'
import { ComparisonKpis } from '@/components/atAGlance/ComparisonKpis'
import { ComparisonNarratives } from '@/components/atAGlance/ComparisonNarratives'
import {
  comparisonMonthPairLabels,
  formatWeekStartLabel,
  monthNameLong,
} from '@/lib/monthLabels'
import { syncStore } from '@/stores/syncStore'

const WEEK_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function yearMetricValue(p: YearMonthPoint, m: MonthMetric): number {
  if (m === 'spending') return p.moneyOut
  if (m === 'income') return p.moneyIn
  return p.moneyIn - p.moneyOut
}

function toDateOnlyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatWeekOfLabel(week: ReturnType<typeof getWeekRange>): string {
  return week.start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type AtAGlanceMode = 'year' | 'month' | 'week'

export function AnalyticsAtAGlanceSection() {
  const currentCalendarYear = new Date().getFullYear()
  const [mode, setMode] = useState<AtAGlanceMode>('year')
  const [year, setYear] = useState(currentCalendarYear)
  const [monthOffset, setMonthOffset] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
  const [metric, setMetric] = useState<MonthMetric>('spending')
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)

  const [showCurrentYear, setShowCurrentYear] = useState(true)
  const [showPreviousYear, setShowPreviousYear] = useState(true)

  const [showCurrent, setShowCurrent] = useState(true)
  const [showPrevious, setShowPrevious] = useState(true)
  const [showAverageLine, setShowAverageLine] = useState(true)

  const {
    from: monthFrom,
    to: monthTo,
    year: monthYear,
    month: monthNum,
  } = useMemo(() => getMonthBoundsForOffset(monthOffset), [monthOffset])

  const comparison = useMemo(() => {
    if (mode === 'year') return getYearComparison(year)
    if (mode === 'month') return getMonthComparison(monthFrom, monthTo)
    return getWeekComparison(weekOffset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, year, monthFrom, monthTo, weekOffset, lastSyncCompletedAt])

  const pointsCurrent = useMemo(
    () => getYearMonthlyTotals(year),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [year, lastSyncCompletedAt]
  )

  const pointsPrevious = useMemo(
    () => getYearMonthlyTotals(year - 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [year, lastSyncCompletedAt]
  )
  const previousYear = year - 1

  const monthPairLabels = useMemo(
    () => comparisonMonthPairLabels(monthYear, monthNum),
    [monthYear, monthNum]
  )

  const weekRange = useMemo(() => getWeekRange(weekOffset), [weekOffset])
  const weekRangePrev = useMemo(
    () => getWeekRange(weekOffset - 1),
    [weekOffset]
  )

  const weekLineLabels = useMemo(
    () => ({
      current: formatWeekStartLabel(weekRange.start),
      previous: formatWeekStartLabel(weekRangePrev.start),
    }),
    [weekRange, weekRangePrev]
  )

  const vsPriorLabel = useMemo(() => {
    if (mode === 'year') return String(previousYear)
    if (mode === 'month') return monthPairLabels.vsPriorShort
    return weekLineLabels.previous
  }, [
    mode,
    previousYear,
    monthPairLabels.vsPriorShort,
    weekLineLabels.previous,
  ])

  /** In-progress calendar year: draw “this year” only through the current month; historical years use all 12. */
  const yearCurrentThroughMonth = useMemo(
    () => (year === currentCalendarYear ? new Date().getMonth() + 1 : 12),
    [year, currentCalendarYear]
  )

  const yearLegendStrokes = useMemo(() => {
    const cur = pointsCurrent
      .slice(0, yearCurrentThroughMonth)
      .map((p) => yearMetricValue(p, metric))
    const prev = pointsPrevious
      .slice(0, yearCurrentThroughMonth)
      .map((p) => yearMetricValue(p, metric))
    return getYearMonthlySemanticStrokes(cur, prev, metric)
  }, [pointsCurrent, pointsPrevious, yearCurrentThroughMonth, metric])

  const yearCurrentStroke =
    yearLegendStrokes?.currentStroke ?? 'var(--vantura-chart-accent, #ffcc80)'
  const yearPreviousStroke =
    yearLegendStrokes?.previousStroke ??
    'var(--vantura-chart-previous, var(--bs-gray-600, #6c757d))'

  const monthSeries = useMemo(
    () => getMonthDayByDaySeries(monthFrom, monthTo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthFrom, monthTo, lastSyncCompletedAt]
  )

  const weekSeries = useMemo(
    () => getWeekDayByDaySeries(weekOffset),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekOffset, lastSyncCompletedAt]
  )

  const activeLineSeries =
    mode === 'month'
      ? monthSeries.series
      : mode === 'week'
        ? weekSeries.series
        : null

  const semanticStrokes = useMemo(() => {
    if (!activeLineSeries) return null
    return getMonthComparisonSemanticStrokes(activeLineSeries.points, metric)
  }, [activeLineSeries, metric])

  const thisPeriodStroke =
    semanticStrokes?.currentStroke ?? 'var(--vantura-chart-accent, #ffcc80)'
  const lastPeriodStroke =
    semanticStrokes?.previousStroke ??
    'var(--vantura-chart-previous, var(--bs-gray-600, #6c757d))'

  const monthLabel = monthNameLong(monthYear, monthNum)
  const showMonthYearLine = monthYear !== currentCalendarYear

  const headerIcon =
    mode === 'year'
      ? 'mdi-chart-timeline-variant'
      : mode === 'month'
        ? 'mdi-calendar-month'
        : 'mdi-calendar-week'

  const titlePrimary = useMemo(() => {
    if (mode === 'year') return `${year} at a glance`
    if (mode === 'month') return `${monthLabel} at a glance`
    return `Week of ${formatWeekOfLabel(weekRange)}`
  }, [mode, year, monthLabel, weekRange])

  const chartAriaYear = `${year} monthly ${metric} trend compared to ${previousYear}`

  const lineChartTitle = useMemo(() => {
    const base =
      metric === 'spending'
        ? 'Spending'
        : metric === 'income'
          ? 'Income'
          : 'Net'
    if (mode === 'year') return `${base} ${year} vs ${previousYear}`
    if (mode === 'month')
      return `${base} ${monthPairLabels.currentLabel} vs ${monthPairLabels.previousLabel}`
    return `${base} Week of ${formatWeekOfLabel(weekRange)} vs ${formatWeekOfLabel(weekRangePrev)}`
  }, [
    metric,
    mode,
    year,
    previousYear,
    monthPairLabels.currentLabel,
    monthPairLabels.previousLabel,
    weekRange,
    weekRangePrev,
  ])

  const formatWeekX = (d: number) =>
    WEEK_SHORT[Math.min(7, Math.max(1, d)) - 1] ?? `Day ${d}`

  /** Deep-links "View monthly review" into the exact period being viewed, rather than always Reports' default (current month). */
  const reviewLinkTo = useMemo(() => {
    if (mode === 'month') {
      return `/analytics/reports?year=${monthYear}&month=${monthNum}`
    }
    if (mode === 'week') {
      const from = toDateOnlyLocal(weekRange.start)
      const to = toDateOnlyLocal(weekRange.end)
      return `/analytics/reports?dateFrom=${from}&dateTo=${to}`
    }
    const { current } = getYearComparisonPeriods(year)
    return `/analytics/reports?dateFrom=${current.from}&dateTo=${current.to}`
  }, [mode, monthYear, monthNum, weekRange, year])

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2 section-header">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <span className="page-title-icon">
            <i className={`mdi ${headerIcon}`} aria-hidden />
          </span>
          <div className="d-flex flex-column">
            <span>{titlePrimary}</span>
            {mode === 'month' && showMonthYearLine && (
              <span className="small text-muted">{monthYear}</span>
            )}
          </div>
          <Form.Select
            size="sm"
            className="ms-1"
            style={{ width: 'auto', minWidth: 100 }}
            aria-label="Period for at a glance"
            value={mode}
            onChange={(e) => setMode(e.target.value as AtAGlanceMode)}
          >
            <option value="year">Year</option>
            <option value="month">Month</option>
            <option value="week">Week</option>
          </Form.Select>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <Link
            to={reviewLinkTo}
            className="btn-icon"
            aria-label="View monthly review"
          >
            <i className="mdi mdi-calendar-month" aria-hidden />
          </Link>
          {mode === 'year' && (
            <>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-year-prev-tooltip">
                    Previous year
                  </BSTooltip>
                }
              >
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setYear((y) => y - 1)}
                  aria-label="Previous year"
                >
                  <i className="mdi mdi-chevron-left" aria-hidden />
                </button>
              </OverlayTrigger>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-year-today-tooltip">
                    Go to current period
                  </BSTooltip>
                }
              >
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setYear(new Date().getFullYear())}
                  disabled={year === currentCalendarYear}
                  aria-label="Go to current period"
                >
                  <i className="mdi mdi-calendar-today" aria-hidden />
                </button>
              </OverlayTrigger>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-year-next-tooltip">Next year</BSTooltip>
                }
              >
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setYear((y) => y + 1)}
                  disabled={year >= currentCalendarYear}
                  aria-label="Next year"
                >
                  <i className="mdi mdi-chevron-right" aria-hidden />
                </button>
              </OverlayTrigger>
            </>
          )}
          {mode === 'month' && (
            <>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-month-prev-tooltip">
                    Previous month
                  </BSTooltip>
                }
              >
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setMonthOffset((o) => o - 1)}
                  aria-label="Previous month"
                >
                  <i className="mdi mdi-chevron-left" aria-hidden />
                </button>
              </OverlayTrigger>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-month-today-tooltip">
                    Go to current period
                  </BSTooltip>
                }
              >
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setMonthOffset(0)}
                  disabled={monthOffset === 0}
                  aria-label="Go to current period"
                >
                  <i className="mdi mdi-calendar-today" aria-hidden />
                </button>
              </OverlayTrigger>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-month-next-tooltip">Next month</BSTooltip>
                }
              >
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setMonthOffset((o) => o + 1)}
                  disabled={monthOffset >= 0}
                  aria-label="Next month"
                >
                  <i className="mdi mdi-chevron-right" aria-hidden />
                </button>
              </OverlayTrigger>
            </>
          )}
          {mode === 'week' && (
            <>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-week-prev-tooltip">
                    Previous week
                  </BSTooltip>
                }
              >
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setWeekOffset((o) => o - 1)}
                  aria-label="Previous week"
                >
                  <i className="mdi mdi-chevron-left" aria-hidden />
                </button>
              </OverlayTrigger>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-week-today-tooltip">
                    Go to current period
                  </BSTooltip>
                }
              >
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setWeekOffset(0)}
                  disabled={weekOffset === 0}
                  aria-label="Go to current period"
                >
                  <i className="mdi mdi-calendar-today" aria-hidden />
                </button>
              </OverlayTrigger>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-week-next-tooltip">Next week</BSTooltip>
                }
              >
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setWeekOffset((o) => o + 1)}
                  disabled={weekOffset >= 0}
                  aria-label="Next week"
                >
                  <i className="mdi mdi-chevron-right" aria-hidden />
                </button>
              </OverlayTrigger>
            </>
          )}
        </div>
      </Card.Header>
      <Card.Body className="py-3">
        <ComparisonKpis comparison={comparison} vsPriorLabel={vsPriorLabel} />

        {comparison.periodNote && (
          <div className="small text-muted mt-1">{comparison.periodNote}</div>
        )}

        {comparison.hasPreviousData && comparison.narratives.length > 0 && (
          <ComparisonNarratives narratives={comparison.narratives} />
        )}

        {mode === 'year' && (
          <>
            <div className="mt-3 pt-3 border-top">
              <div className="d-flex justify-content-between align-items-center mb-2 gap-3">
                <div className="d-flex justify-content-center flex-grow-1">
                  <div
                    className="fw-semibold text-center"
                    style={{
                      fontSize: '1rem',
                      letterSpacing: '0.02em',
                      color: 'var(--vantura-text)',
                      lineHeight: 1.2,
                    }}
                  >
                    {lineChartTitle}
                  </div>
                </div>
                <div
                  className="period-toggle"
                  role="group"
                  aria-label="Select metric for year chart"
                >
                  <button
                    type="button"
                    className={`segment-btn${metric === 'spending' ? ' active' : ''}`}
                    onClick={() => setMetric('spending')}
                    aria-pressed={metric === 'spending'}
                  >
                    Spending
                  </button>
                  <button
                    type="button"
                    className={`segment-btn${metric === 'income' ? ' active' : ''}`}
                    onClick={() => setMetric('income')}
                    aria-pressed={metric === 'income'}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    className={`segment-btn${metric === 'net' ? ' active' : ''}`}
                    onClick={() => setMetric('net')}
                    aria-pressed={metric === 'net'}
                  >
                    Net
                  </button>
                </div>
              </div>

              <YearMonthlyLineChart
                pointsCurrent={pointsCurrent}
                pointsPrevious={pointsPrevious}
                currentThroughMonth={yearCurrentThroughMonth}
                metric={metric}
                showCurrentYear={showCurrentYear}
                showPreviousYear={showPreviousYear}
                currentYear={year}
                previousYear={previousYear}
                showAverage={showAverageLine}
                height={230}
                aria-label={chartAriaYear}
              />

              <div className="d-flex justify-content-center mt-2">
                <div className="d-flex flex-wrap justify-content-center align-items-center gap-4 small text-muted">
                  <button
                    type="button"
                    className={`btn btn-outline-secondary btn-sm month-summary-legend-toggle d-flex align-items-center gap-2 ${
                      showPreviousYear ? 'active' : ''
                    }`}
                    onClick={() => setShowPreviousYear((v) => !v)}
                    aria-pressed={showPreviousYear}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 2,
                        background: yearPreviousStroke,
                        opacity: showPreviousYear ? 1 : 0.35,
                      }}
                      aria-hidden
                    />
                    <span>{previousYear}</span>
                  </button>

                  <button
                    type="button"
                    className={`btn btn-outline-secondary btn-sm month-summary-legend-toggle d-flex align-items-center gap-2 ${
                      showCurrentYear ? 'active' : ''
                    }`}
                    onClick={() => setShowCurrentYear((v) => !v)}
                    aria-pressed={showCurrentYear}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 2,
                        background: yearCurrentStroke,
                        opacity: showCurrentYear ? 1 : 0.35,
                      }}
                      aria-hidden
                    />
                    <span>{year}</span>
                  </button>

                  <button
                    type="button"
                    className={`btn btn-outline-secondary btn-sm month-summary-legend-toggle d-flex align-items-center gap-2 ${
                      showAverageLine ? 'active' : ''
                    }`}
                    onClick={() => setShowAverageLine((v) => !v)}
                    aria-pressed={showAverageLine}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 0,
                        borderBottom:
                          '1px dashed var(--vantura-chart-average, #f2994a)',
                        opacity: showAverageLine ? 1 : 0.35,
                      }}
                      aria-hidden
                    />
                    <span>Average</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {mode === 'month' && (
          <div className="mt-3 pt-3 border-top">
            <div className="d-flex justify-content-between align-items-center mb-2 gap-3">
              <div className="d-flex justify-content-center flex-grow-1">
                <div
                  className="fw-semibold text-center"
                  style={{
                    fontSize: '1rem',
                    letterSpacing: '0.02em',
                    color: 'var(--vantura-text)',
                    lineHeight: 1.2,
                  }}
                >
                  {lineChartTitle}
                </div>
              </div>
              <div
                className="period-toggle"
                role="group"
                aria-label="Select metric for month comparison chart"
              >
                <button
                  type="button"
                  className={`segment-btn${metric === 'spending' ? ' active' : ''}`}
                  onClick={() => setMetric('spending')}
                  aria-pressed={metric === 'spending'}
                >
                  Spending
                </button>
                <button
                  type="button"
                  className={`segment-btn${metric === 'income' ? ' active' : ''}`}
                  onClick={() => setMetric('income')}
                  aria-pressed={metric === 'income'}
                >
                  Income
                </button>
                <button
                  type="button"
                  className={`segment-btn${metric === 'net' ? ' active' : ''}`}
                  onClick={() => setMetric('net')}
                  aria-pressed={metric === 'net'}
                >
                  Net
                </button>
              </div>
            </div>

            <MonthSpendingComparisonChart
              series={monthSeries.series}
              metric={metric}
              height={230}
              showAverage={showAverageLine}
              showCurrent={showCurrent}
              showPrevious={showPrevious}
              previousLineLabel={monthPairLabels.previousLabel}
              currentLineLabel={monthPairLabels.currentLabel}
              aria-label={`${monthPairLabels.currentLabel} vs ${monthPairLabels.previousLabel} daily cumulative comparison`}
            />

            <div className="d-flex justify-content-center mt-2">
              <div className="d-flex flex-wrap justify-content-center align-items-center gap-4 small text-muted">
                <button
                  type="button"
                  className={`btn btn-outline-secondary btn-sm month-summary-legend-toggle d-flex align-items-center gap-2 ${
                    showPrevious ? 'active' : ''
                  }`}
                  onClick={() => setShowPrevious((v) => !v)}
                  aria-pressed={showPrevious}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 2,
                      background: lastPeriodStroke,
                      opacity: showPrevious ? 1 : 0.35,
                    }}
                    aria-hidden
                  />
                  <span>{monthPairLabels.previousLabel}</span>
                </button>

                <button
                  type="button"
                  className={`btn btn-outline-secondary btn-sm month-summary-legend-toggle d-flex align-items-center gap-2 ${
                    showCurrent ? 'active' : ''
                  }`}
                  onClick={() => setShowCurrent((v) => !v)}
                  aria-pressed={showCurrent}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 2,
                      background: thisPeriodStroke,
                      opacity: showCurrent ? 1 : 0.35,
                    }}
                    aria-hidden
                  />
                  <span>{monthPairLabels.currentLabel}</span>
                </button>

                <button
                  type="button"
                  className={`btn btn-outline-secondary btn-sm month-summary-legend-toggle d-flex align-items-center gap-2 ${
                    showAverageLine ? 'active' : ''
                  }`}
                  onClick={() => setShowAverageLine((v) => !v)}
                  aria-pressed={showAverageLine}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 0,
                      borderBottom:
                        '1px dashed var(--vantura-chart-average, #f2994a)',
                      opacity: showAverageLine ? 1 : 0.35,
                    }}
                    aria-hidden
                  />
                  <span>Average</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'week' && (
          <div className="mt-3 pt-3 border-top">
            <div className="d-flex justify-content-between align-items-center mb-2 gap-3">
              <div className="d-flex justify-content-center flex-grow-1">
                <div
                  className="fw-semibold text-center"
                  style={{
                    fontSize: '1rem',
                    letterSpacing: '0.02em',
                    color: 'var(--vantura-text)',
                    lineHeight: 1.2,
                  }}
                >
                  {lineChartTitle}
                </div>
              </div>
              <div
                className="period-toggle"
                role="group"
                aria-label="Select metric for week comparison chart"
              >
                <button
                  type="button"
                  className={`segment-btn${metric === 'spending' ? ' active' : ''}`}
                  onClick={() => setMetric('spending')}
                  aria-pressed={metric === 'spending'}
                >
                  Spending
                </button>
                <button
                  type="button"
                  className={`segment-btn${metric === 'income' ? ' active' : ''}`}
                  onClick={() => setMetric('income')}
                  aria-pressed={metric === 'income'}
                >
                  Income
                </button>
                <button
                  type="button"
                  className={`segment-btn${metric === 'net' ? ' active' : ''}`}
                  onClick={() => setMetric('net')}
                  aria-pressed={metric === 'net'}
                >
                  Net
                </button>
              </div>
            </div>

            <MonthSpendingComparisonChart
              series={weekSeries.series}
              metric={metric}
              height={230}
              showAverage={showAverageLine}
              showCurrent={showCurrent}
              showPrevious={showPrevious}
              formatXAxisTick={formatWeekX}
              formatTooltipDayTitle={formatWeekX}
              previousLineLabel={weekLineLabels.previous}
              currentLineLabel={weekLineLabels.current}
              aria-label={`${weekLineLabels.current} vs ${weekLineLabels.previous} daily cumulative comparison`}
            />

            <div className="d-flex justify-content-center mt-2">
              <div className="d-flex flex-wrap justify-content-center align-items-center gap-4 small text-muted">
                <button
                  type="button"
                  className={`btn btn-outline-secondary btn-sm month-summary-legend-toggle d-flex align-items-center gap-2 ${
                    showPrevious ? 'active' : ''
                  }`}
                  onClick={() => setShowPrevious((v) => !v)}
                  aria-pressed={showPrevious}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 2,
                      background: lastPeriodStroke,
                      opacity: showPrevious ? 1 : 0.35,
                    }}
                    aria-hidden
                  />
                  <span>{weekLineLabels.previous}</span>
                </button>

                <button
                  type="button"
                  className={`btn btn-outline-secondary btn-sm month-summary-legend-toggle d-flex align-items-center gap-2 ${
                    showCurrent ? 'active' : ''
                  }`}
                  onClick={() => setShowCurrent((v) => !v)}
                  aria-pressed={showCurrent}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 2,
                      background: thisPeriodStroke,
                      opacity: showCurrent ? 1 : 0.35,
                    }}
                    aria-hidden
                  />
                  <span>{weekLineLabels.current}</span>
                </button>

                <button
                  type="button"
                  className={`btn btn-outline-secondary btn-sm month-summary-legend-toggle d-flex align-items-center gap-2 ${
                    showAverageLine ? 'active' : ''
                  }`}
                  onClick={() => setShowAverageLine((v) => !v)}
                  aria-pressed={showAverageLine}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 0,
                      borderBottom:
                        '1px dashed var(--vantura-chart-average, #f2994a)',
                      opacity: showAverageLine ? 1 : 0.35,
                    }}
                    aria-hidden
                  />
                  <span>Average</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  )
}
