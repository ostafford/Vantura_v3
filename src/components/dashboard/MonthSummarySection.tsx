import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card } from 'react-bootstrap'
import {
  getInsightsForDateRange,
  getCategoryBreakdownForDateRange,
} from '@/services/insights'
import { formatMoney } from '@/lib/format'

function getCurrentMonthBounds(): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
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

export function MonthSummarySection() {
  const { from, to } = useMemo(() => getCurrentMonthBounds(), [])
  const insights = useMemo(() => getInsightsForDateRange(from, to), [from, to])
  const categories = useMemo(
    () => getCategoryBreakdownForDateRange(from, to),
    [from, to]
  )
  const topCategory = categories.length > 0 ? categories[0] : null
  const monthLabel = MONTH_NAMES[new Date().getMonth()]

  return (
    <Card>
      <Card.Header className="d-flex justify-content-between align-items-center section-header">
        <div className="d-flex align-items-center">
          <span className="page-title-icon bg-gradient-primary text-white mr-2">
            <i className="mdi mdi-calendar-month" aria-hidden />
          </span>
          <span>{monthLabel} at a glance</span>
        </div>
        <Link
          to="/analytics/monthly-review"
          className="btn btn-outline-secondary btn-sm"
          aria-label="View full monthly review"
        >
          <i className="mdi mdi-chevron-right" aria-hidden />
        </Link>
      </Card.Header>
      <Card.Body className="py-3">
        <div className="d-flex flex-wrap gap-3 align-items-center">
          <div>
            <span className="small text-muted">Money in</span>
            <div className="fw-medium text-success">
              ${formatMoney(insights.moneyIn)}
            </div>
          </div>
          <div>
            <span className="small text-muted">Money out</span>
            <div className="fw-medium text-danger">
              ${formatMoney(insights.moneyOut)}
            </div>
          </div>
          <div>
            <span className="small text-muted">Charges</span>
            <div className="fw-medium">{insights.charges}</div>
          </div>
          {topCategory && (
            <div>
              <span className="small text-muted">Top category</span>
              <div className="fw-medium">
                {topCategory.category_name} ($
                {formatMoney(topCategory.total)})
              </div>
            </div>
          )}
        </div>
      </Card.Body>
    </Card>
  )
}
