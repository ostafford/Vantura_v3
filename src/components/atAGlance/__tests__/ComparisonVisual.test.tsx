import { beforeAll, describe, expect, it, vi } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { ComparisonVisual } from '@/components/atAGlance/ComparisonVisual'
import type { MonthComparisonData, MonthDelta } from '@/services/insights'

function delta(current: number, previous: number): MonthDelta {
  const d = current - previous
  return {
    current,
    previous,
    delta: d,
    direction: d > 0 ? 'up' : d < 0 ? 'down' : 'flat',
  }
}

function render(over: Partial<MonthComparisonData>): string {
  const comparison = {
    // No previous income: the Income bar stays hidden, so any % is under test.
    moneyIn: delta(100000, 0),
    moneyOut: delta(50000, 50000),
    netDelta: delta(50000, 50000),
    biggestCategoryMover: undefined,
    ...over,
  } as MonthComparisonData
  return ReactDOMServer.renderToString(
    <ComparisonVisual
      comparison={comparison}
      currentLabel="Nov"
      priorLabel="Oct"
    />
  )
}

describe('ComparisonVisual with negative spending', () => {
  // The bar's tooltip mounts into document.body; server rendering has no DOM.
  beforeAll(() => vi.stubGlobal('document', { body: null }))

  it('shows no percentage on the Spending bar when this month nets negative', () => {
    const html = render({ moneyOut: delta(-34700, 51050) })
    expect(html).not.toMatch(/>[−-]?\d+%</)
  })

  it('still shows the Spending bar percentage for two positive months', () => {
    const html = render({ moneyOut: delta(25000, 50000) })
    expect(html).toContain('>50%<')
  })

  it('gives a category tile the previous figure, not a bare arrow, when it has no percentage', () => {
    const html = render({
      biggestCategoryMover: {
        category_name: 'Health & Fitness',
        currentTotal: -50000,
        previousTotal: 0,
        deltaTotal: -50000,
      },
    })
    expect(html).toContain('−$500.00')
    expect(html).toContain('from $0.00')
  })

  it('shows no percentage on a tile whose previous month is negative', () => {
    const html = render({
      biggestCategoryMover: {
        category_name: 'Health & Fitness',
        currentTotal: 30000,
        previousTotal: -20000,
        deltaTotal: 50000,
      },
    })
    // The tile shows the starting figure only in place of a percentage.
    expect(html).toContain('↑ from −$200.00<')
  })
})
