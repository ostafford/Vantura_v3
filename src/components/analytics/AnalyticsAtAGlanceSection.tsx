import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Card,
  Button,
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

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const WEEK_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function emptyYearPoints(monthCount: number): YearMonthPoint[] {
  return Array.from({ length: monthCount }, (_, i) => ({
    month: i + 1,
    moneyIn: 0,
    moneyOut: 0,
  }))
}

function yearMetricValue(p: YearMonthPoint, m: MonthMetric): number {
  if (m === 'spending') return p.moneyOut
  if (m === 'income') return p.moneyIn
  return p.moneyIn - p.moneyOut
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
  }, [mode, year, monthFrom, monthTo, weekOffset])

  const vsPriorLabel =
    mode === 'year'
      ? 'last year'
      : mode === 'month'
        ? 'prev month'
        : 'last week'

  const pointsCurrent = useMemo(() => getYearMonthlyTotals(year), [year])
  const pointsPrevious = useMemo(() => getYearMonthlyTotals(year - 1), [year])
  const previousYear = year - 1

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
    yearLegendStrokes?.currentStroke ??
    'var(--vantura-chart-accent, var(--bs-primary, #ff9f43))'
  const yearPreviousStroke =
    yearLegendStrokes?.previousStroke ??
    'var(--vantura-chart-previous, var(--bs-gray-600, #6c757d))'

  const monthSeries = useMemo(
    () => getMonthDayByDaySeries(monthFrom, monthTo),
    [monthFrom, monthTo]
  )

  const weekSeries = useMemo(
    () => getWeekDayByDaySeries(weekOffset),
    [weekOffset]
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
    semanticStrokes?.currentStroke ??
    'var(--vantura-chart-accent, var(--bs-primary, #ff9f43))'
  const lastPeriodStroke =
    semanticStrokes?.previousStroke ??
    'var(--vantura-chart-previous, var(--bs-gray-600, #6c757d))'

  const monthLabel = MONTH_NAMES[monthNum - 1]
  const showMonthYearLine = monthYear !== currentCalendarYear
  const weekRange = useMemo(() => getWeekRange(weekOffset), [weekOffset])

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

  const lineChartTitle =
    (metric === 'spending'
      ? 'Spending'
      : metric === 'income'
        ? 'Income'
        : 'Net') +
    (mode === 'year'
      ? ' This Year vs Last Year'
      : mode === 'month'
        ? ' This Month vs Last Month'
        : ' This Week vs Last Week')

  const formatWeekX = (d: number) =>
    WEEK_SHORT[Math.min(7, Math.max(1, d)) - 1] ?? `Day ${d}`

  return (
    <Card className="mb-4">
      <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2 section-header">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <span className="page-title-icon bg-gradient-primary text-white mr-2">
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
            to="/analytics/monthly-review"
            className="btn btn-outline-secondary btn-sm"
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
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setYear((y) => y - 1)}
                  aria-label="Previous year"
                >
                  <i className="mdi mdi-chevron-left" aria-hidden />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-year-next-tooltip">Next year</BSTooltip>
                }
              >
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setYear((y) => y + 1)}
                  disabled={year >= currentCalendarYear}
                  aria-label="Next year"
                >
                  <i className="mdi mdi-chevron-right" aria-hidden />
                </Button>
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
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setMonthOffset((o) => o - 1)}
                  aria-label="Previous month"
                >
                  <i className="mdi mdi-chevron-left" aria-hidden />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-month-next-tooltip">Next month</BSTooltip>
                }
              >
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setMonthOffset((o) => o + 1)}
                  disabled={monthOffset >= 0}
                  aria-label="Next month"
                >
                  <i className="mdi mdi-chevron-right" aria-hidden />
                </Button>
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
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setWeekOffset((o) => o - 1)}
                  aria-label="Previous week"
                >
                  <i className="mdi mdi-chevron-left" aria-hidden />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger
                placement="top"
                overlay={
                  <BSTooltip id="aag-week-next-tooltip">Next week</BSTooltip>
                }
              >
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setWeekOffset((o) => o + 1)}
                  disabled={weekOffset >= 0}
                  aria-label="Next week"
                >
                  <i className="mdi mdi-chevron-right" aria-hidden />
                </Button>
              </OverlayTrigger>
            </>
          )}
        </div>
      </Card.Header>
      <Card.Body className="py-3">
        <ComparisonKpis comparison={comparison} vsPriorLabel={vsPriorLabel} />

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
                  className="btn-group btn-group-sm"
                  role="group"
                  aria-label="Select metric for year chart"
                >
                  <button
                    type="button"
                    className={`btn btn-outline-secondary ${
                      metric === 'spending' ? 'active' : ''
                    }`}
                    onClick={() => setMetric('spending')}
                    aria-pressed={metric === 'spending'}
                  >
                    Spending
                  </button>
                  <button
                    type="button"
                    className={`btn btn-outline-secondary ${
                      metric === 'income' ? 'active' : ''
                    }`}
                    onClick={() => setMetric('income')}
                    aria-pressed={metric === 'income'}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    className={`btn btn-outline-secondary ${
                      metric === 'net' ? 'active' : ''
                    }`}
                    onClick={() => setMetric('net')}
                    aria-pressed={metric === 'net'}
                  >
                    Net
                  </button>
                </div>
              </div>

              <YearMonthlyLineChart
                pointsCurrent={
                  pointsCurrent.length === 12
                    ? pointsCurrent
                    : emptyYearPoints(12)
                }
                pointsPrevious={
                  pointsPrevious.length === 12
                    ? pointsPrevious
                    : emptyYearPoints(12)
                }
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
                    <span>Last year</span>
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
                    <span>This year</span>
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
                className="btn-group btn-group-sm"
                role="group"
                aria-label="Select metric for month comparison chart"
              >
                <button
                  type="button"
                  className={`btn btn-outline-secondary ${
                    metric === 'spending' ? 'active' : ''
                  }`}
                  onClick={() => setMetric('spending')}
                  aria-pressed={metric === 'spending'}
                >
                  Spending
                </button>
                <button
                  type="button"
                  className={`btn btn-outline-secondary ${
                    metric === 'income' ? 'active' : ''
                  }`}
                  onClick={() => setMetric('income')}
                  aria-pressed={metric === 'income'}
                >
                  Income
                </button>
                <button
                  type="button"
                  className={`btn btn-outline-secondary ${
                    metric === 'net' ? 'active' : ''
                  }`}
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
              aria-label="This month vs last month daily cumulative comparison"
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
                  <span>Last month</span>
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
                  <span>This month</span>
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
                className="btn-group btn-group-sm"
                role="group"
                aria-label="Select metric for week comparison chart"
              >
                <button
                  type="button"
                  className={`btn btn-outline-secondary ${
                    metric === 'spending' ? 'active' : ''
                  }`}
                  onClick={() => setMetric('spending')}
                  aria-pressed={metric === 'spending'}
                >
                  Spending
                </button>
                <button
                  type="button"
                  className={`btn btn-outline-secondary ${
                    metric === 'income' ? 'active' : ''
                  }`}
                  onClick={() => setMetric('income')}
                  aria-pressed={metric === 'income'}
                >
                  Income
                </button>
                <button
                  type="button"
                  className={`btn btn-outline-secondary ${
                    metric === 'net' ? 'active' : ''
                  }`}
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
              showAverage={false}
              showCurrent={showCurrent}
              showPrevious={showPrevious}
              formatXAxisTick={formatWeekX}
              formatTooltipDayTitle={formatWeekX}
              previousLineLabel="Last week"
              currentLineLabel="This week"
              aria-label="This week vs last week daily cumulative comparison"
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
                  <span>Last week</span>
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
                  <span>This week</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  )
}
