import { describe, expect, it } from 'vitest'
import {
  incomeBarSegments,
  itemBar,
  markPaidDate,
  savedHeadline,
  stateLine,
} from './planFormat'
import type { PlanItem } from '@/services/planVsActual'

const bar = (
  spentOnPlanCents: number,
  spentUnplannedCents: number,
  stillToGoOutCents: number | null,
  ifTheRestGoesToPlanCents: number | null
) => ({
  state: 'in-progress' as const,
  bar: {
    spentOnPlanCents,
    spentUnplannedCents,
    stillToGoOutCents,
    ifTheRestGoesToPlanCents,
  },
})

const finished = (
  spentOnPlanCents: number,
  spentUnplannedCents: number,
  savedCents: number | null
) => ({
  state: 'finished' as const,
  bar: { spentOnPlanCents, spentUnplannedCents, savedCents },
})

const widths = (segments: ReturnType<typeof incomeBarSegments>) =>
  segments!.map((s) => Math.round(s.widthPct * 100) / 100)

describe('incomeBarSegments', () => {
  it('splits Income into the four segments in order', () => {
    const segments = incomeBarSegments(bar(40000, 10000, 30000, 20000), 100000)
    expect(segments!.map((s) => s.key)).toEqual([
      'on-plan',
      'unplanned',
      'to-go',
      'rest',
    ])
    expect(widths(segments)).toEqual([40, 10, 30, 20])
    expect(segments!.every((s) => !s.over)).toBe(true)
  })

  it('stays at Income width when spending passes Income, showing the shortfall as over', () => {
    // Income 1000, spent 900 + 300, 200 still to go: 400 short.
    const segments = incomeBarSegments(bar(90000, 30000, 20000, -40000), 100000)
    expect(widths(segments)).toEqual([90, 10, 0, 0])
    expect(segments!.reduce((sum, s) => sum + s.widthPct, 0)).toBe(100)
    expect(segments![3]).toMatchObject({ cents: -40000, over: true })
  })

  it('gives a negative segment no width but keeps its figure', () => {
    // Net refunds: Spent unplanned is negative.
    const segments = incomeBarSegments(bar(30000, -5000, 20000, 55000), 100000)
    expect(widths(segments)).toEqual([30, 0, 20, 50])
    expect(segments![1].cents).toBe(-5000)
  })

  it('keeps a declined Still to go out and forecast as null with no width', () => {
    const segments = incomeBarSegments(bar(30000, 5000, null, null), 100000)
    expect(widths(segments)).toEqual([30, 5, 0, 0])
    expect(segments!.map((s) => s.cents)).toEqual([30000, 5000, null, null])
  })

  it('is null when Income isn’t set', () => {
    expect(incomeBarSegments(bar(1, 1, 1, null), null)).toBeNull()
  })
})

describe('incomeBarSegments, finished month (#243)', () => {
  it('splits Income into Spent on plan · Spent unplanned · Saved', () => {
    const segments = incomeBarSegments(finished(60000, 10000, 30000), 100000)
    expect(segments!.map((s) => [s.key, s.label])).toEqual([
      ['on-plan', 'Spent on plan'],
      ['unplanned', 'Spent unplanned'],
      ['saved', 'Saved'],
    ])
    expect(widths(segments)).toEqual([60, 10, 30])
    expect(segments![2]).toMatchObject({ shownCents: 30000, over: false })
  })

  it('reads Overspent, as a positive figure in the over colour, with the bar full', () => {
    const segments = incomeBarSegments(finished(90000, 30000, -20000), 100000)
    expect(widths(segments)).toEqual([90, 10, 0])
    expect(segments![2]).toMatchObject({
      label: 'Overspent',
      cents: -20000,
      shownCents: 20000,
      over: true,
    })
  })

  it('is null when the plan has no Income', () => {
    expect(incomeBarSegments(finished(1, 1, null), null)).toBeNull()
  })
})

describe('savedHeadline', () => {
  it('is Saved at or above zero and Overspent below it', () => {
    expect(savedHeadline(0)).toEqual({ label: 'Saved', cents: 0, over: false })
    expect(savedHeadline(-1)).toEqual({
      label: 'Overspent',
      cents: 1,
      over: true,
    })
  })
})

describe('itemBar', () => {
  it('fills up to actual when under planned, with the pace tick', () => {
    expect(itemBar(50000, 20000, 25000)).toEqual({
      fillPct: 40,
      overPct: 0,
      plannedPct: 100,
      pacePct: 50,
    })
  })

  it('runs a red extension past the planned end when over', () => {
    const b = itemBar(40000, 50000)!
    expect(b.plannedPct).toBe(80)
    expect(b.fillPct).toBe(80)
    expect(b.overPct).toBe(20)
  })

  it('draws no fill for a negative actual', () => {
    expect(itemBar(10000, -500)).toMatchObject({ fillPct: 0, overPct: 0 })
  })

  it('is all over when nothing was planned', () => {
    expect(itemBar(0, 4000)).toMatchObject({
      fillPct: 0,
      overPct: 100,
      pacePct: null,
    })
  })

  it('is null with no planned or no actual figure', () => {
    expect(itemBar(null, 100)).toBeNull()
    expect(itemBar(100, null)).toBeNull()
  })
})

describe('stateLine', () => {
  const tracker = (state: PlanItem['state']): PlanItem =>
    ({
      type: 'tracker',
      trackerId: 1,
      name: 'Food',
      plannedCents: 1,
      actualCents: 1,
      paceCents: 1,
      state,
    }) as PlanItem

  it('words each state, colouring over only', () => {
    expect(stateLine(tracker({ kind: 'left', cents: 2000 }))).toEqual({
      text: '$20.00 left',
      tone: 'muted',
    })
    expect(stateLine(tracker({ kind: 'over', cents: 550 }))).toEqual({
      text: '$5.50 over',
      tone: 'over',
    })
    expect(stateLine(tracker({ kind: 'under', cents: 0 })).text).toBe('on plan')
    expect(stateLine(tracker({ kind: 'under', cents: 100 })).text).toBe(
      '$1.00 under'
    )
    expect(stateLine(tracker({ kind: 'overdue' })).tone).toBe('warn')
    expect(stateLine(tracker({ kind: 'no-actual-figure' })).text).toBe(
      'no actual figure'
    )
    expect(stateLine(tracker({ kind: 'not-due' })).text).toBe(
      'not due this month'
    )
    expect(stateLine(tracker({ kind: 'no-payment-found' }))).toMatchObject({
      text: 'No payment found',
      tone: 'warn',
    })
  })
})

describe('markPaidDate', () => {
  const regular = (
    state: PlanItem['state'],
    unpaidDates: string[]
  ): PlanItem => ({
    type: 'regular',
    regularId: 1,
    name: 'Rent',
    plannedCents: 1,
    actualCents: null,
    state,
    unpaidDates,
  })

  it('offers the oldest unpaid occurrence when overdue or with no actual figure', () => {
    expect(
      markPaidDate(regular({ kind: 'overdue' }, ['2026-10-05', '2026-10-19']))
    ).toBe('2026-10-05')
    expect(
      markPaidDate(regular({ kind: 'no-actual-figure' }, ['2026-10-25']))
    ).toBe('2026-10-25')
  })

  it('offers it on a finished month’s no-payment-found Regular', () => {
    expect(
      markPaidDate(regular({ kind: 'no-payment-found' }, ['2026-10-05']))
    ).toBe('2026-10-05')
  })

  it('offers nothing for any other state', () => {
    expect(
      markPaidDate(regular({ kind: 'not-paid-yet' }, ['2026-10-25']))
    ).toBeNull()
    expect(markPaidDate(regular({ kind: 'paid' }, []))).toBeNull()
  })
})
