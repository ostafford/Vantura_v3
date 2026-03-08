/**
 * Shared chart data types used by dashboard bar charts (Insights, Savers).
 */

export type InsightsChartDatum = {
  category_id: string
  name: string
  totalDollars: number
  fill: string
  stroke: string
}

export type SaversChartRow = {
  id: string
  name: string
  current: number
  remaining: number
  goal: number
  saver: {
    id: string
    name: string
    current_balance: number
    goal_amount: number | null
    target_date: string | null
    monthly_transfer: number | null
    user_icon: string | null
  }
  currentFill: string
}
