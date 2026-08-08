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
 * One row in the Weekly Insights chart: either a real category bar, or a
 * group-header divider between parent-category clusters. Kept as a single
 * ordered array (not bars + a separate groups side-array) so the data layer
 * owns all sorting/grouping and the chart just renders whatever order it's
 * given — no index-alignment bugs between two parallel arrays.
 */
export type InsightsChartRow =
  | { kind: 'bar'; datum: InsightsChartDatum }
  | { kind: 'header'; key: string; label: string }
