import type {
  MonthMetric,
  MonthSpendingSeriesPoint,
} from '@/lib/monthSpendingSeries'

const SUCCESS_COLOR = 'var(--vantura-success, #1bcfb4)'
const DANGER_COLOR = 'var(--vantura-danger, #fe7c96)'

function computeMtd(points: MonthSpendingSeriesPoint[], metric: MonthMetric) {
  const currentKey =
    metric === 'spending'
      ? 'currentSpending'
      : metric === 'income'
        ? 'currentIncome'
        : 'currentNet'
  const previousKey =
    metric === 'spending'
      ? 'previousSpending'
      : metric === 'income'
        ? 'previousIncome'
        : 'previousNet'

  let currentMtd: number | null = null
  let previousMtd: number | null = null

  for (const p of points) {
    const c = p[currentKey] as number | null
    const prev = p[previousKey] as number | null
    if (c != null) currentMtd = c
    if (prev != null) previousMtd = prev
  }

  return { currentMtd, previousMtd }
}

export function getMonthComparisonSemanticStrokes(
  points: MonthSpendingSeriesPoint[],
  metric: MonthMetric
): { currentStroke: string; previousStroke: string } | null {
  const { currentMtd, previousMtd } = computeMtd(points, metric)
  if (currentMtd == null || previousMtd == null) return null

  const isGood =
    metric === 'spending'
      ? currentMtd <= previousMtd
      : currentMtd >= previousMtd

  return {
    currentStroke: isGood ? SUCCESS_COLOR : DANGER_COLOR,
    previousStroke: isGood ? DANGER_COLOR : SUCCESS_COLOR,
  }
}

/**
 * Semantic line colors for year-at-a-glance monthly series: compares **YTD sums**
 * over parallel months. Pass **aligned** arrays of the same length (e.g. Jan–Apr
 * this year vs Jan–Apr last year for a YTD view), not necessarily full 12 months.
 */
export function getYearMonthlySemanticStrokes(
  currentMonthlyValues: number[],
  previousMonthlyValues: number[],
  metric: MonthMetric
): { currentStroke: string; previousStroke: string } | null {
  const n = Math.min(currentMonthlyValues.length, previousMonthlyValues.length)
  if (n < 1) return null

  let currentYtd = 0
  let previousYtd = 0
  for (let i = 0; i < n; i++) {
    currentYtd += currentMonthlyValues[i] ?? 0
    previousYtd += previousMonthlyValues[i] ?? 0
  }

  const isGood =
    metric === 'spending'
      ? currentYtd <= previousYtd
      : currentYtd >= previousYtd

  return {
    currentStroke: isGood ? SUCCESS_COLOR : DANGER_COLOR,
    previousStroke: isGood ? DANGER_COLOR : SUCCESS_COLOR,
  }
}
