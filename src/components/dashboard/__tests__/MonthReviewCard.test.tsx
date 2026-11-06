import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import type { MonthReview } from '@/services/monthReview'

let review: MonthReview | null = null
vi.mock('@/services/monthReview', () => ({
  getMonthReview: () => review,
  markMonthReviewed: () => {},
}))

const { MonthReviewCard } = await import('../MonthReviewCard')

function render(r: MonthReview | null): string {
  review = r
  return ReactDOMServer.renderToStaticMarkup(
    <StaticRouter location="/">
      <MonthReviewCard />
    </StaticRouter>
  )
}

/** Visible text, tags stripped. */
const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('MonthReviewCard (#244)', () => {
  it('says what the month saved, opening it on the Budget Plan', () => {
    const html = render({ month: '2026-10', kind: 'saved', cents: 38000 })
    expect(text(html)).toContain('October: you saved $380.00')
    expect(text(html)).toContain('Mark reviewed')
    expect(html).toContain('href="/analytics/budget?month=2026-10"')
    expect(html).not.toContain('plan-over')
  })

  it('says what it overspent, coloured as over', () => {
    const html = render({ month: '2026-10', kind: 'overspent', cents: 12345 })
    expect(text(html)).toContain('October: you overspent $123.45')
    expect(html).toContain('plan-over')
    expect(text(html)).toContain('Mark reviewed')
  })

  it('has no figure when the month had no pay, but can still be marked reviewed', () => {
    const html = render({ month: '2026-10', kind: 'no-pay' })
    expect(text(html)).toContain('October is finished · Review')
    expect(text(html)).not.toMatch(/\$/)
    expect(text(html)).toContain('Mark reviewed')
  })

  it('renders nothing when there is no month to review', () => {
    expect(render(null)).toBe('')
  })
})
