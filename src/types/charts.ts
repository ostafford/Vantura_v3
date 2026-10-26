/**
 * Shared chart data types used by dashboard bar charts (Insights).
 */

export type InsightsChartDatum = {
  category_id: string
  name: string
  totalDollars: number
  fill: string
  stroke: string
}

/**
 * One row in the Weekly Insights chart: either a category bar, or an
 * unlabelled gap between parent-category clusters. The gap takes a band slot
 * the same size as a bar's, so bars from different hue families are never
 * adjacent — the layout the colour system's CVD check assumed (see
 * docs/adr/0011). Kept as a single ordered array (not bars + a separate gaps
 * side-array) so the data layer owns all ordering and the chart just renders
 * whatever order it's given.
 */
export type InsightsChartRow =
  | { kind: 'bar'; datum: InsightsChartDatum }
  | { kind: 'gap'; key: string }
