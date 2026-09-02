import { describe, it, expect } from 'vitest'
import type { SaverMonthlyFlowPoint } from '@/services/accounts'
import { computeProjection, deriveMonthlyBalances } from './saverProjection'

/** A flow array whose most-recent *complete* month has the given saving rate. */
function flowAtRate(rateCents: number): SaverMonthlyFlowPoint[] {
  return [
    { monthLabel: "Dec '25", flowCents: -rateCents, txCount: 1 },
    // trailing (in-progress) month — computeProjection drops the last element
    { monthLabel: "Jan '26", flowCents: 0, txCount: 0 },
  ]
}

// Mid-month values so a machine's UTC offset can't flip the month the pre-existing
// local-vs-UTC date parsing in computeProjection lands on.
const NOW = new Date(2026, 0, 15) // 15 Jan 2026, local
const IN_6_MONTHS = '2026-07-15'

/** Local month/year of an ISO date — matches how the card formats projectedReachDate. */
function localYm(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

describe('computeProjection — #30 ahead-of-pace framing', () => {
  it('reports how many months early the goal is reached when ahead of pace', () => {
    const r = computeProjection(
      40_000,
      100_000,
      flowAtRate(20_000),
      IN_6_MONTHS,
      NOW
    )
    // gap 60k / 20k per month = 3 months; target is 6 months out.
    expect(r.onTrack).toBe(true)
    expect(r.monthsRemaining).toBe(6)
    expect(r.monthsToGoal).toBe(3)
    expect(r.monthsEarly).toBe(3)
    expect(localYm(r.projectedReachDate!)).toBe('2026-04') // Jan + 3 months
  })

  it('rounds partial months up (the line is crossed mid-month)', () => {
    const r = computeProjection(
      40_000,
      100_000,
      flowAtRate(25_000),
      IN_6_MONTHS,
      NOW
    )
    // 60k / 25k = 2.4 -> 3 months
    expect(r.monthsToGoal).toBe(3)
    expect(r.monthsEarly).toBe(3)
  })

  it('is on pace (0 months early) when the rate exactly matches the requirement', () => {
    const r = computeProjection(
      40_000,
      100_000,
      flowAtRate(10_000),
      IN_6_MONTHS,
      NOW
    )
    expect(r.onTrack).toBe(true)
    expect(r.monthsToGoal).toBe(6)
    expect(r.monthsEarly).toBe(0)
  })

  it('reports negative monthsEarly and onTrack=false when behind pace', () => {
    const r = computeProjection(
      40_000,
      100_000,
      flowAtRate(5_000),
      IN_6_MONTHS,
      NOW
    )
    expect(r.onTrack).toBe(false)
    expect(r.monthsToGoal).toBe(12)
    expect(r.monthsEarly).toBe(-6)
  })

  it('has no projection when there is no positive saving rate', () => {
    const r = computeProjection(
      40_000,
      100_000,
      flowAtRate(0),
      IN_6_MONTHS,
      NOW
    )
    expect(r.monthsToGoal).toBeNull()
    expect(r.monthsEarly).toBeNull()
    expect(r.projectedReachDate).toBeNull()
  })

  it('treats an already-covered goal as reached now (monthsToGoal 0)', () => {
    const r = computeProjection(
      120_000,
      100_000,
      flowAtRate(5_000),
      IN_6_MONTHS,
      NOW
    )
    expect(r.monthsToGoal).toBe(0)
    expect(r.monthsEarly).toBe(6)
    expect(localYm(r.projectedReachDate!)).toBe('2026-01')
  })
})

describe('deriveMonthlyBalances', () => {
  it('walks the current balance backwards through the monthly flow', () => {
    const flow: SaverMonthlyFlowPoint[] = [
      { monthLabel: "Nov '25", flowCents: -10_000, txCount: 1 },
      { monthLabel: "Dec '25", flowCents: -20_000, txCount: 2 },
    ]
    // b starts at 100k -> unshift {Dec, 100k}; b += Dec.flow (-20k) -> 80k;
    // unshift {Nov, 80k}; b += Nov.flow (-10k) -> 70k (unused).
    const out = deriveMonthlyBalances(flow, 'sav-1', 100_000)
    expect(out).toEqual([
      { saver_id: 'sav-1', snapshot_date: '2025-11-01', balance_cents: 80_000 },
      {
        saver_id: 'sav-1',
        snapshot_date: '2025-12-01',
        balance_cents: 100_000,
      },
    ])
  })

  it('floors reconstructed balances at zero', () => {
    const flow: SaverMonthlyFlowPoint[] = [
      { monthLabel: "Nov '25", flowCents: -5_000, txCount: 1 },
      { monthLabel: "Dec '25", flowCents: -50_000, txCount: 2 },
    ]
    const out = deriveMonthlyBalances(flow, 'sav-1', 10_000)
    expect(out[0].balance_cents).toBe(0) // would be -40k
    expect(out[1].balance_cents).toBe(10_000)
  })
})
