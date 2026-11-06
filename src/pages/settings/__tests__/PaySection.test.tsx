import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'

vi.mock('@/db', () => ({
  getAppSetting: () => null,
  setAppSetting: vi.fn(),
}))

import { PaySection } from '@/pages/settings/PaySection'

function render() {
  return ReactDOMServer.renderToString(<PaySection />).replace(/<!-- -->/g, '')
}

describe('PaySection', () => {
  it('labels the Pay amount as take-home, and the label is its accessible name (#203)', () => {
    const html = render()
    const label = html.match(
      /<label[^>]*for="settings-pay-amount"[^>]*>([^<]*)<\/label>/
    )?.[1]
    expect(label?.trim()).toBe('Take-home pay amount ($)')

    const input = html.match(/<input[^>]*id="settings-pay-amount"[^>]*>/)?.[0]
    expect(input).toBeDefined()
    // No aria-label overriding the visible label.
    expect(input).not.toMatch(/aria-label=/)

    expect(html).toContain(
      'What lands in your account each pay, after tax. Your monthly Income is built from it.'
    )
  })

  it('has the amount and Pay frequency only: no payday day or date (#195)', () => {
    const html = render()
    expect(html).toMatch(/<select[^>]*id="settings-pay-frequency"/)
    const frequencies = [...html.matchAll(/<option value="([A-Z]+)"/g)].map(
      (m) => m[1]
    )
    expect(frequencies).toEqual(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY'])
    expect(html).not.toMatch(/type="date"/)
    expect(html).not.toMatch(/payday-day|next-payday/)
    expect(html.match(/<(input|select)\b/g)).toHaveLength(2)
  })
})
