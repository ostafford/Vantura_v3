import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'

const settings = vi.hoisted(() => new Map<string, string>())

vi.mock('@/db', () => ({
  getAppSetting: (key: string) => settings.get(key) ?? null,
  setAppSetting: vi.fn(),
  getDb: () => null,
  schedulePersist: vi.fn(),
}))

import { NoPlanSummaryCard } from '@/components/budgetPlan/PlanVsActualParts'
import type { PlanVsActualNoPlan } from '@/services/planVsActual'

/** August 2026, a Month without a plan with no Confirmed pay. */
const august: PlanVsActualNoPlan = {
  state: 'no-plan',
  month: '2026-08',
  today: '2027-01-20',
  daysInMonth: 31,
  openingDate: '2026-07-24',
  firstPlannableMonth: '2026-12',
  figures: { incomeCents: null, actualCents: 123_400 },
  spendingByCategory: {
    totalCents: 123_400,
    parents: [],
    uncategorisedCents: 123_400,
  },
  confirmedPay: null,
  savedCents: null,
  noSavedReason: null,
}

function render(plan: PlanVsActualNoPlan) {
  return ReactDOMServer.renderToString(
    <NoPlanSummaryCard plan={plan} nav={null} onPayChanged={() => {}} />
  ).replace(/<!-- -->/g, '')
}

function amountInput(html: string) {
  return html.match(/<input[^>]*inputMode="decimal"[^>]*>/)?.[0] ?? ''
}

describe('NoPlanSummaryCard pay prompt (#282)', () => {
  it('starts empty when Settings → Pay isn’t set', () => {
    settings.clear()
    const html = render(august)
    expect(html).toContain('data-testid="plan-pay-prompt"')
    expect(amountInput(html)).toMatch(/value=""/)
    const selected = html.match(/<option[^>]*selected=""[^>]*>([^<]*)</)?.[1]
    expect(selected).toBe('Choose…')
  })

  it('starts from Settings → Pay when it’s set', () => {
    settings.clear()
    settings.set('payday_frequency', 'WEEKLY')
    settings.set('pay_amount_cents', '123456')
    const html = render(august)
    expect(amountInput(html)).toMatch(/value="1234.56"/)
    expect(html).toMatch(
      /<option[^>]*selected=""[^>]*value="WEEKLY"|<option[^>]*value="WEEKLY"[^>]*selected=""/
    )
    expect(html).not.toContain('Choose…')
  })

  it('offers "Change pay for this month" only with a Confirmed pay', () => {
    settings.clear()
    expect(render(august)).not.toContain('Change pay for this month')
    const october: PlanVsActualNoPlan = {
      ...august,
      month: '2026-10',
      figures: { incomeCents: 450_000, actualCents: 123_400 },
      confirmedPay: { perPay: 450_000, frequency: 'MONTHLY' },
      savedCents: 326_600,
    }
    const html = render(october)
    expect(html).toContain('Change pay for this month')
    expect(html).not.toContain('data-testid="plan-pay-prompt"')
  })
})
