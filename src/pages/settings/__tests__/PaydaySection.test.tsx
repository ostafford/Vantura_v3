import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'

vi.mock('@/db', () => ({
  getAppSetting: () => null,
  setAppSetting: vi.fn(),
}))

import { PaydaySection } from '@/pages/settings/PaydaySection'

function render() {
  return ReactDOMServer.renderToString(<PaydaySection />).replace(
    /<!-- -->/g,
    ''
  )
}

describe('PaydaySection', () => {
  it('labels the Pay amount as take-home, and the label is its accessible name (#203)', () => {
    const html = render()
    const label = html.match(
      /<label[^>]*for="settings-payday-pay-amount"[^>]*>([^<]*)<\/label>/
    )?.[1]
    expect(label?.trim()).toBe('Take-home pay amount ($)')

    const input = html.match(
      /<input[^>]*id="settings-payday-pay-amount"[^>]*>/
    )?.[0]
    expect(input).toBeDefined()
    // No aria-label overriding the visible label.
    expect(input).not.toMatch(/aria-label=/)

    expect(html).toContain(
      'What lands in your account each pay, after tax. Your monthly Income is built from it, and it&#x27;s used for Spendable context and alerts.'
    )
  })
})
