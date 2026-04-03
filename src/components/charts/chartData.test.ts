import { describe, it, expect } from 'vitest'
import type { InsightsChartDatum } from '@/types/charts'

/**
 * Chart data building logic (mirrors InsightsSection).
 * Tests ensure maxDomain and chartData shape are safe for D3 charts.
 */

function buildInsightsChartData(
  categories: { category_id: string; category_name: string; total: number }[],
  categoryColors: Record<string, string>,
  chartPalette: string[]
): { chartData: InsightsChartDatum[]; maxDomain: number } {
  const chartData: InsightsChartDatum[] = categories.map((c, index) => {
    const totalDollars = Number.isFinite(c.total / 100) ? c.total / 100 : 0
    return {
      category_id: c.category_id,
      name: c.category_name,
      totalDollars,
      fill:
        categoryColors[c.category_id] ??
        chartPalette[index % chartPalette.length],
      stroke:
        categoryColors[c.category_id] ??
        chartPalette[index % chartPalette.length],
    }
  })
  const maxDomain = Math.max(
    1,
    ...chartData.map((d) => d.totalDollars).filter(Number.isFinite)
  )
  return { chartData, maxDomain }
}

describe('buildInsightsChartData', () => {
  const palette = ['#a', '#b', '#c']

  it('returns empty chartData and maxDomain 1 for empty categories', () => {
    const { chartData, maxDomain } = buildInsightsChartData([], {}, palette)
    expect(chartData).toHaveLength(0)
    expect(maxDomain).toBe(1)
  })

  it('returns one row and maxDomain >= 1 for single category', () => {
    const { chartData, maxDomain } = buildInsightsChartData(
      [{ category_id: 'c1', category_name: 'Food', total: 5000 }],
      {},
      palette
    )
    expect(chartData).toHaveLength(1)
    expect(chartData[0].category_id).toBe('c1')
    expect(chartData[0].name).toBe('Food')
    expect(chartData[0].totalDollars).toBe(50)
    expect(maxDomain).toBe(50)
  })

  it('maxDomain is at least 1 when all values are zero', () => {
    const { chartData, maxDomain } = buildInsightsChartData(
      [
        { category_id: 'c1', category_name: 'A', total: 0 },
        { category_id: 'c2', category_name: 'B', total: 0 },
      ],
      {},
      palette
    )
    expect(chartData).toHaveLength(2)
    expect(chartData.every((d) => d.totalDollars === 0)).toBe(true)
    expect(maxDomain).toBe(1)
  })

  it('sanitizes non-finite total to 0', () => {
    const { chartData, maxDomain } = buildInsightsChartData(
      [
        {
          category_id: 'c1',
          category_name: 'A',
          total: NaN as unknown as number,
        },
      ],
      {},
      palette
    )
    expect(chartData[0].totalDollars).toBe(0)
    expect(maxDomain).toBe(1)
  })

  it('applies same category color across different weeks (cross-week persistence)', () => {
    const categoryColors: Record<string, string> = {
      groceries: '#ff0000',
      transport: '#00ff00',
    }
    const week1Categories = [
      { category_id: 'groceries', category_name: 'Groceries', total: 10000 },
      { category_id: 'transport', category_name: 'Transport', total: 5000 },
    ]
    const week2Categories = [
      { category_id: 'groceries', category_name: 'Groceries', total: 8000 },
      { category_id: 'food', category_name: 'Food', total: 3000 },
    ]
    const { chartData: week1Data } = buildInsightsChartData(
      week1Categories,
      categoryColors,
      palette
    )
    const { chartData: week2Data } = buildInsightsChartData(
      week2Categories,
      categoryColors,
      palette
    )
    const groceriesWeek1 = week1Data.find((d) => d.category_id === 'groceries')
    const groceriesWeek2 = week2Data.find((d) => d.category_id === 'groceries')
    expect(groceriesWeek1?.fill).toBe('#ff0000')
    expect(groceriesWeek1?.stroke).toBe('#ff0000')
    expect(groceriesWeek2?.fill).toBe('#ff0000')
    expect(groceriesWeek2?.stroke).toBe('#ff0000')
  })
})
