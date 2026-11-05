import { describe, expect, it } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { HeadroomCards } from '@/components/dashboard/HeadroomSection'
import { HEADROOM_CAPTION, splitBar } from '@/components/dashboard/headroomBar'
import type { Headroom } from '@/services/headroom'
import type { OnHandAccount } from '@/services/accounts'

const accounts: OnHandAccount[] = [
  {
    id: 'spend',
    display_name: 'Everyday',
    account_type: 'TRANSACTIONAL',
    balance: 200000,
  },
  { id: 'bills', display_name: 'Bills', account_type: 'SAVER', balance: 50000 },
]

function headroom(over: Partial<Headroom> = {}): Headroom {
  return {
    month: '2026-11',
    today: '2026-11-20',
    onHandCents: 250000,
    regularsNotPaidYet: [
      {
        regularId: 1,
        name: 'Rent',
        date: '2026-11-05',
        amountCents: 150000,
        overdue: true,
      },
      {
        regularId: 2,
        name: 'Phone',
        date: '2026-11-28',
        amountCents: 5000,
        overdue: false,
      },
    ],
    regularsNotPaidYetCents: 155000,
    trackersLeft: [
      {
        trackerId: 1,
        name: 'Food',
        plannedCents: 50000,
        actualCents: 20000,
        leftCents: 30000,
      },
      {
        trackerId: 2,
        name: 'Fun',
        plannedCents: 10000,
        actualCents: 15000,
        leftCents: 0,
      },
    ],
    trackersLeftCents: 30000,
    stillToGoOutCents: 185000,
    headroomCents: 65000,
    freeSpendingSoFarCents: 120000,
    ...over,
  }
}

function render(h: Headroom): string {
  return ReactDOMServer.renderToString(
    <StaticRouter location="/">
      <HeadroomCards
        headroom={h}
        accounts={accounts}
        onMarkPaid={() => {}}
        onChooseSavers={() => {}}
      />
    </StaticRouter>
  )
}

/** The HTML of one card, by its test id. */
function card(html: string, testId: string): string {
  const start = html.indexOf(`data-testid="${testId}"`)
  expect(start).toBeGreaterThan(-1)
  const next = html.indexOf('data-testid="headroom-', start + 1)
  return html.slice(start, next === -1 ? undefined : next)
}

describe('HeadroomCards', () => {
  it('renders On hand − Still to go out = Headroom with the read’s figures', () => {
    const html = render(headroom())

    const onHand = card(html, 'headroom-on-hand')
    expect(onHand).toContain('On hand')
    expect(onHand).toContain('$2,500.00')
    expect(onHand).toContain('Everyday')
    expect(onHand).toContain('Bills')
    expect(onHand).toContain('Savers switched off aren’t counted')
    expect(onHand).toContain('>Choose<')

    const toGo = card(html, 'headroom-to-go')
    expect(toGo).toContain('Still to go out · Nov')
    expect(toGo).toContain('$1,850.00')
    expect(toGo).toContain('Regulars not paid yet')
    expect(toGo).toContain('Left in trackers')
    expect(toGo).toContain('28 Nov')

    const hr = card(html, 'headroom-headroom')
    expect(hr).toContain('headroom-card--ok')
    expect(hr).toContain('$650.00')
    expect(hr).toContain('74% of on hand is still going out')
    expect(hr).toContain(HEADROOM_CAPTION)
    expect(hr).toContain('Free spending so far')
    expect(hr).toContain('$1,200.00')
    expect(hr).toContain('href="/analytics/budget"')
  })

  it('offers Mark paid on overdue occurrences only, in red', () => {
    const toGo = card(render(headroom()), 'headroom-to-go')
    expect(toGo.match(/overdue · Mark paid/g)).toHaveLength(1)
    expect(toGo).toContain('headroom-pill--overdue')
    expect(toGo).toContain('aria-label="Rent, due 5 Nov, overdue. Mark paid"')
  })

  it('dims a Tracker at $0 left but still lists it', () => {
    const toGo = card(render(headroom()), 'headroom-to-go')
    expect(toGo).toMatch(/headroom-line headroom-line--dim[^]*Fun/)
    expect(toGo.match(/headroom-line--dim/g)).toHaveLength(1)
  })

  it('renders a negative Headroom red with an all-amber bar and its caption', () => {
    const hr = card(
      render(headroom({ headroomCents: -40000, stillToGoOutCents: 290000 })),
      'headroom-headroom'
    )
    expect(hr).toContain('headroom-card--bad')
    expect(hr).toContain('−$400.00')
    expect(hr).toContain('Still to go out is more than on hand')
    expect(hr).toContain('flex-basis:100%')
    expect(hr).not.toContain('headroom-bar__left')
  })

  it('shows a red Free spending so far when it’s negative', () => {
    const hr = card(
      render(headroom({ freeSpendingSoFarCents: -1500 })),
      'headroom-headroom'
    )
    expect(hr).toMatch(/headroom-fig--bad[^>]*>−\$15\.00/)
  })

  it('prompts "Set your pay" when Income isn’t set', () => {
    const hr = card(
      render(headroom({ freeSpendingSoFarCents: null })),
      'headroom-headroom'
    )
    expect(hr).toContain('Set your pay')
    expect(hr).toContain('href="/settings"')
    expect(hr).not.toContain('href="/analytics/budget"')
  })

  it('shows no figure when the read declines', () => {
    const html = render(
      headroom({
        trackersLeftCents: null,
        stillToGoOutCents: null,
        headroomCents: null,
      })
    )
    expect(card(html, 'headroom-to-go')).toContain('headroom-card__total">—<')
    const hr = card(html, 'headroom-headroom')
    expect(hr).toContain('headroom-card--none')
    expect(hr).toContain('headroom-card__total">—<')
    expect(hr).not.toContain('headroom-bar')
  })
})

describe('splitBar', () => {
  it('is the share of On hand still going out', () => {
    expect(splitBar(100000, 25000, 75000)).toEqual({
      toGoPct: 25,
      caption: '25% of on hand is still going out',
    })
  })

  it('never reads 0% with something still going out, or 100% with some left', () => {
    expect(splitBar(1000000, 10, 999990).caption).toBe(
      '1% of on hand is still going out'
    )
    expect(splitBar(1000000, 999990, 10).caption).toBe(
      '99% of on hand is still going out'
    )
    expect(splitBar(100000, 100000, 0).caption).toBe(
      '100% of on hand is still going out'
    )
  })

  it('is all amber when Headroom is negative', () => {
    expect(splitBar(100000, 150000, -50000)).toEqual({
      toGoPct: 100,
      caption: 'Still to go out is more than on hand',
    })
  })

  it('is empty with nothing on hand and nothing to go out', () => {
    expect(splitBar(0, 0, 0).toGoPct).toBe(0)
  })
})
