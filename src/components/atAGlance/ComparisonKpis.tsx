import { formatMoney } from '@/lib/format'
import type { MonthComparisonData } from '@/services/insights'
import { ComparisonDeltaBadge } from '@/components/atAGlance/ComparisonDeltaBadge'

export function ComparisonKpis({
  comparison,
  vsPriorLabel = 'prev month',
}: {
  comparison: MonthComparisonData
  /** Matches narrative period, e.g. "last year", "last week", "prev month". */
  vsPriorLabel?: string
}) {
  return (
    <div className="d-flex flex-wrap gap-3 align-items-start">
      <div>
        <span className="small text-muted">Money in</span>
        <div className="fw-medium text-success">
          ${formatMoney(comparison.moneyIn.current)}
        </div>
        {comparison.hasPreviousData && (
          <ComparisonDeltaBadge
            delta={comparison.moneyIn}
            vsPriorLabel={vsPriorLabel}
          />
        )}
      </div>
      <div>
        <span className="small text-muted">Money out</span>
        <div className="fw-medium text-danger">
          ${formatMoney(comparison.moneyOut.current)}
        </div>
        {comparison.hasPreviousData && (
          <ComparisonDeltaBadge
            delta={comparison.moneyOut}
            invert
            vsPriorLabel={vsPriorLabel}
          />
        )}
      </div>
      <div>
        <span className="small text-muted">Charges</span>
        <div className="fw-medium">{comparison.charges.current}</div>
        {comparison.hasPreviousData && (
          <ComparisonDeltaBadge
            delta={comparison.charges}
            invert
            vsPriorLabel={vsPriorLabel}
          />
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
  )
}
