import { describe, expect, it } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { BalanceCards } from '@/components/dashboard/BalanceCards'

const baseProps = {
  spendableValue: '$1,234.56',
  spendableSubtitle: '$400.00 reserved until 5 Sep',
  spendableTone: 'success' as const,
  spendableTooltip: 'tip',
  spendableAriaLabel:
    'Spendable balance $1,234.56. $400.00 reserved until 5 Sep. Activate to set a low-balance alert.',
  onOpenAlert: () => {},
  availableValue: '$1,634.56',
  availableSubtitle: 'Balance as reported by Up Bank',
  availableTooltip: 'tip',
  forecastValue: '$980.00',
  forecastSubtitle: 'Projected to next payday',
  forecastTone: 'info' as const,
  forecastTooltip: 'tip',
}

describe('BalanceCards', () => {
  it('uses the caller-supplied accessible name on the Spendable hero button', () => {
    const html = ReactDOMServer.renderToString(<BalanceCards {...baseProps} />)

    // The formatted value and reserved line reach the accessible name — the
    // visible value/subtitle nodes on their own would not.
    expect(html).toContain(`aria-label="${baseProps.spendableAriaLabel}"`)
    expect(html).toContain('$1,234.56')
    // The old hardcoded label is gone.
    expect(html).not.toContain('click to set low balance alert')
  })

  it('keeps the deep-link id and tour hook on the hero', () => {
    const html = ReactDOMServer.renderToString(<BalanceCards {...baseProps} />)

    expect(html).toContain('id="dashboard-spendable-card"')
    expect(html).toContain('data-tour="balance-cards"')
    expect(html).toContain('role="button"')
  })
})
