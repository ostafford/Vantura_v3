import { describe, expect, it } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { TransactionAmount } from '@/components/TransactionAmount'
import { formatTransactionAmount } from '@/lib/format'

describe('TransactionAmount', () => {
  it('shows a purchase as −$x, uncoloured', () => {
    const html = ReactDOMServer.renderToString(
      <TransactionAmount cents={-4250} />
    )
    expect(html).toContain('−$42.50')
    expect(html).not.toContain('text-success')
  })

  it('shows a refund as a green +$x', () => {
    const html = ReactDOMServer.renderToString(
      <TransactionAmount cents={1200} />
    )
    expect(html).toContain('+$12.00')
    expect(html).toContain('text-success')
  })

  it('formats the same text for chart tooltips', () => {
    expect(formatTransactionAmount(-4250)).toBe('−$42.50')
    expect(formatTransactionAmount(1200)).toBe('+$12.00')
  })
})
