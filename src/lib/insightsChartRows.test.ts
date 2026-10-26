import { describe, it, expect } from 'vitest'
import { buildInsightsChartRows } from './insightsChartRows'
import type { CategoryGroupSection } from '@/services/insights'

function section(
  parentId: string | null,
  parentName: string,
  ids: (string | null)[],
  isOther = false
): CategoryGroupSection {
  return {
    parentId,
    parentName,
    isOther,
    rows: ids.map((id, i) => ({
      category_id: id,
      category_name: id ?? parentName,
      total: (i + 1) * 100,
    })),
  }
}

const kinds = (rows: ReturnType<typeof buildInsightsChartRows>) =>
  rows.map((r) => (r.kind === 'bar' ? r.datum.category_id : r.key))

describe('buildInsightsChartRows', () => {
  it('returns no rows for no sections', () => {
    expect(buildInsightsChartRows([], 'dark')).toEqual([])
  })

  it('puts no gap before the first section or within a section', () => {
    const rows = buildInsightsChartRows(
      [section('home', 'Home', ['groceries', 'rent'])],
      'dark'
    )
    expect(kinds(rows)).toEqual(['groceries', 'rent'])
  })

  it('puts exactly one gap between each pair of sections, never adjacent bars from different sections', () => {
    const rows = buildInsightsChartRows(
      [
        section('home', 'Home', ['groceries']),
        section('transport', 'Transport', ['fuel', 'parking']),
        section(null, 'Uncategorised', [null]),
        section(null, 'Other (3 categories)', [null], true),
      ],
      'dark'
    )
    expect(kinds(rows)).toEqual([
      'groceries',
      'gap:transport',
      'fuel',
      'parking',
      'gap:Uncategorised',
      '__uncategorised__',
      'gap:Other (3 categories)',
      '__other__',
    ])
  })

  it('keeps gap keys unique so each takes its own band slot', () => {
    const rows = buildInsightsChartRows(
      [
        section('home', 'Home', ['a']),
        section('transport', 'Transport', ['b']),
        section(null, 'Uncategorised', [null]),
        section(null, 'Other (2 categories)', [null], true),
      ],
      'light'
    )
    const keys = kinds(rows)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('converts cents to dollars', () => {
    const [row] = buildInsightsChartRows(
      [section('home', 'Home', ['groceries'])],
      'dark'
    )
    expect(row).toMatchObject({ kind: 'bar', datum: { totalDollars: 1 } })
  })
})
