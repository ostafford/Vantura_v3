import { describe, expect, it } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { EssentialsCoverageBlock } from '@/components/dashboard/EssentialsCoverageBlock'
import type { EssentialsCoverage } from '@/services/essentialsCoverage'

const base: EssentialsCoverage = {
  state: 'covered',
  reservedHereCents: 0,
  essentialsSetAsideCents: 1500,
  saverBalanceCents: 5000,
  shortfallCents: 0,
  transactionalCount: 0,
}

// React SSR interleaves `<!-- -->` comment markers between adjacent
// interpolated text nodes — strip them so assertions can match on plain text.
function render(coverage: EssentialsCoverage) {
  return ReactDOMServer.renderToString(
    <EssentialsCoverageBlock coverage={coverage} />
  ).replace(/<!-- -->/g, '')
}

describe('EssentialsCoverageBlock', () => {
  it('renders nothing when hidden', () => {
    const html = render({ ...base, state: 'hidden' })
    expect(html).toBe('')
  })

  it('collapses to a single covered line with no split', () => {
    const html = render({ ...base, state: 'covered' })
    expect(html).toContain('essentials-coverage--covered')
    expect(html).toContain('All bills covered')
    expect(html).not.toContain('essentials-coverage__split')
    expect(html).not.toContain('Reserved here')
  })

  it('shows the full split with a neutral count for partial migration', () => {
    const html = render({
      ...base,
      state: 'partial',
      reservedHereCents: 2000,
      transactionalCount: 2,
    })
    expect(html).toContain('essentials-coverage--partial')
    expect(html).toContain('2 bills still on your everyday account')
    expect(html).toContain('Reserved here')
    expect(html).toContain('$20.00')
    expect(html).toContain('Set aside in Essentials')
    expect(html).toContain('$15.00')
  })

  it('uses singular "bill" for a count of one', () => {
    const html = render({
      ...base,
      state: 'partial',
      reservedHereCents: 2000,
      transactionalCount: 1,
    })
    expect(html).toContain('1 bill still on your everyday account')
    expect(html).not.toContain('1 bills')
  })

  it('shows the shortfall amount and warning tone with the full split', () => {
    const html = render({
      ...base,
      state: 'shortfall',
      shortfallCents: 750,
    })
    expect(html).toContain('essentials-coverage--shortfall')
    expect(html).toContain(
      'Essentials Saver may be short $7.50 for upcoming bills'
    )
    expect(html).toContain('Reserved here')
    expect(html).toContain('Set aside in Essentials')
  })

  it('shows Reserved here as $0.00 rather than hiding it when empty but not fully covered', () => {
    const html = render({
      ...base,
      state: 'shortfall',
      reservedHereCents: 0,
      shortfallCents: 500,
    })
    expect(html).toContain('Reserved here')
    expect(html).toMatch(/Reserved here<\/span><span>\$0\.00/)
  })
})
