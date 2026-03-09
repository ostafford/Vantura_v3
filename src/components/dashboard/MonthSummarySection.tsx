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
  type MonthDelta,
  type NarrativeInsight,
} from '@/services/insights'
import { formatMoney } from '@/lib/format'

function getMonthBoundsForOffset(offset: number): {
  from: string
  to: string
  year: number
  month: number
} {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const y = target.getFullYear()
  const m = target.getMonth() + 1
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to, year: y, month: m }
}

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

function DeltaBadge({
  delta,
  invert,
}: {
  delta: MonthDelta
  invert?: boolean
}) {
  if (delta.direction === 'flat') return null
  const isUp = delta.direction === 'up'
  const positive = invert ? !isUp : isUp
  const icon = isUp ? 'mdi-arrow-up' : 'mdi-arrow-down'
  const cls = positive ? 'text-success' : 'text-danger'
  const absDelta = Math.abs(delta.delta)
  const isCount = Number.isInteger(delta.current) && absDelta < 10000
  const label = isCount ? String(absDelta) : `$${formatMoney(absDelta)}`
  return (
    <div
      className={`small ${cls}`}
      aria-label={`${delta.direction} ${label} vs prev month`}
      style={{ fontSize: '0.75rem', lineHeight: 1.3 }}
    >
      <i
        className={`mdi ${icon}`}
        aria-hidden
        style={{ fontSize: '0.65rem' }}
      />{' '}
      {label}
    </div>
  )
}

const NARRATIVE_ICONS: Record<NarrativeInsight['type'], string> = {
  win: 'mdi-check-circle-outline',
  challenge: 'mdi-alert-circle-outline',
  opportunity: 'mdi-lightbulb-outline',
}

const NARRATIVE_COLORS: Record<NarrativeInsight['type'], string> = {
  win: 'text-success',
  challenge: 'text-danger',
  opportunity: 'text-warning',
}

export function MonthSummarySection() {
  const [monthOffset, setMonthOffset] = useState(0)

  const { from, to, year, month } = useMemo(
    () => getMonthBoundsForOffset(monthOffset),
    [monthOffset]
  )
  const comparison = useMemo(() => getMonthComparison(from, to), [from, to])
  const monthLabel = MONTH_NAMES[month - 1]
  const showYear = year !== new Date().getFullYear()

  return (
    <Card>
      <Card.Header className="d-flex justify-content-between align-items-center section-header">
        <div className="d-flex align-items-center">
          <span className="page-title-icon bg-gradient-primary text-white mr-2">
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
        <div className="d-flex flex-wrap gap-3 align-items-start">
          <div>
            <span className="small text-muted">Money in</span>
            <div className="fw-medium text-success">
              ${formatMoney(comparison.moneyIn.current)}
            </div>
            {comparison.hasPreviousData && (
              <DeltaBadge delta={comparison.moneyIn} />
            )}
          </div>
          <div>
            <span className="small text-muted">Money out</span>
            <div className="fw-medium text-danger">
              ${formatMoney(comparison.moneyOut.current)}
            </div>
            {comparison.hasPreviousData && (
              <DeltaBadge delta={comparison.moneyOut} invert />
            )}
          </div>
          <div>
            <span className="small text-muted">Charges</span>
            <div className="fw-medium">{comparison.charges.current}</div>
            {comparison.hasPreviousData && (
              <DeltaBadge delta={comparison.charges} invert />
            )}
          </div>
          {comparison.currentTopCategory && (
            <div>
              <span className="small text-muted">Top category</span>
              <div className="fw-medium">
                {comparison.currentTopCategory.category_name} ($
                {formatMoney(comparison.currentTopCategory.total)})
              </div>
            </div>
          )}
        </div>

        {comparison.hasPreviousData && comparison.narratives.length > 0 && (
          <div className="mt-3 pt-2 border-top">
            {comparison.narratives.map((n, i) => (
              <div key={i} className="d-flex align-items-start gap-1 mb-1">
                <i
                  className={`mdi ${NARRATIVE_ICONS[n.type]} ${NARRATIVE_COLORS[n.type]}`}
                  aria-hidden
                  style={{ fontSize: '0.95rem', marginTop: 1 }}
                />
                <span className="small">{n.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card.Body>
    </Card>
  )
}
