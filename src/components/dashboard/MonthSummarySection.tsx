import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Card,
  Button,
  OverlayTrigger,
  Tooltip as BSTooltip,
} from 'react-bootstrap'
import {
  getMonthComparison,
  getMonthDayByDaySeries,
  getMonthBoundsForOffset,
} from '@/services/insights'
import type { MonthMetric } from '@/lib/monthSpendingSeries'
import { MonthSpendingComparisonChart } from '@/components/charts/MonthSpendingComparisonChart'
import { getMonthComparisonSemanticStrokes } from '@/components/charts/monthComparisonSemanticStrokes'
import { ComparisonKpis } from '@/components/atAGlance/ComparisonKpis'
import { ComparisonNarratives } from '@/components/atAGlance/ComparisonNarratives'
import type React from 'react'

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

export function MonthSummarySection({
  dragHandleProps,
}: {
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>
}) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [metric, setMetric] = useState<MonthMetric>('spending')
  const [showPrevious, setShowPrevious] = useState(true)
  const [showCurrent, setShowCurrent] = useState(true)
  const [showAverageLine, setShowAverageLine] = useState(true)

  const { from, to, year, month } = useMemo(
    () => getMonthBoundsForOffset(monthOffset),
    [monthOffset]
  )
  const comparison = useMemo(() => getMonthComparison(from, to), [from, to])
  const monthSeries = useMemo(
    () => getMonthDayByDaySeries(from, to),
    [from, to]
  )
  const monthLabel = MONTH_NAMES[month - 1]
  const showYear = year !== new Date().getFullYear()
  const semanticStrokes = useMemo(() => {
    return getMonthComparisonSemanticStrokes(monthSeries.series.points, metric)
  }, [monthSeries.series.points, metric])
  const thisMonthStroke =
    semanticStrokes?.currentStroke ??
    'var(--vantura-chart-accent, var(--bs-primary, #ff9f43))'
  const lastMonthStroke =
    semanticStrokes?.previousStroke ??
    'var(--vantura-chart-previous, var(--bs-gray-600, #6c757d))'

  return (
    <Card>
      <Card.Header className="d-flex justify-content-between align-items-center section-header">
        <div className="d-flex align-items-center">
          <span
            className="page-title-icon bg-gradient-primary text-white mr-2"
            {...dragHandleProps}
          >
            <i className="mdi mdi-calendar-month" aria-hidden />
          </span>
          <div className="d-flex flex-column">
            <span>{monthLabel} at a glance</span>
            {showYear && <span className="small text-muted">{year}</span>}
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <Link
            to="/analytics/monthly-review"
            className="btn btn-outline-secondary btn-sm"
            aria-label="View full monthly review"
          >
            <i className="mdi mdi-chart-box" aria-hidden />
          </Link>
          <OverlayTrigger
            placement="top"
            overlay={
              <BSTooltip id="month-prev-tooltip">Previous month</BSTooltip>
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
            overlay={<BSTooltip id="month-next-tooltip">Next month</BSTooltip>}
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
        </div>
      </Card.Header>
      <Card.Body className="py-3">
        <ComparisonKpis comparison={comparison} vsPriorLabel="prev month" />

        {comparison.hasPreviousData && comparison.narratives.length > 0 && (
          <ComparisonNarratives narratives={comparison.narratives} />
        )}

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
                {(metric === 'spending'
                  ? 'Spending'
                  : metric === 'income'
                    ? 'Income'
                    : 'Net') + ' This Month vs Last Month'}
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
                    background: lastMonthStroke,
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
                    background: thisMonthStroke,
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
      </Card.Body>
    </Card>
  )
}
