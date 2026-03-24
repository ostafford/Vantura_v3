import { describe, expect, it } from 'vitest'
import {
  formatCompactDurationFromDays,
  formatMixedDurationFromDays,
  getExpectedPerPayCentsForTarget,
  getWantScheduleHealth,
} from './wantPlanner'

describe('getWantScheduleHealth', () => {
  const now = new Date('2026-03-24T00:00:00Z')

  it('returns onTrack when projected completion is on target date', () => {
    const result = getWantScheduleHealth({
      remainingCents: 20000,
      perPayCents: 10000,
      payPeriodDays: 14,
      behavioralMultiplier: 1,
      targetDate: '2026-04-21',
      now,
    })
    expect(result.status).toBe('onTrack')
    expect(result.tone).toBe('success')
    expect(result.daysDeltaToTarget).toBe(0)
  })

  it('returns atRisk when projected completion is 1-45 days late', () => {
    const result = getWantScheduleHealth({
      remainingCents: 40000,
      perPayCents: 10000,
      payPeriodDays: 14,
      behavioralMultiplier: 1,
      targetDate: '2026-05-04',
      now,
    })
    expect(result.status).toBe('atRisk')
    expect(result.tone).toBe('warning')
    expect(result.daysDeltaToTarget).toBe(15)
  })

  it('returns offTrack when projected completion is over 45 days late', () => {
    const result = getWantScheduleHealth({
      remainingCents: 50000,
      perPayCents: 10000,
      payPeriodDays: 14,
      behavioralMultiplier: 1,
      targetDate: '2026-04-06',
      now,
    })
    expect(result.status).toBe('offTrack')
    expect(result.tone).toBe('danger')
    expect(result.daysDeltaToTarget).toBe(57)
  })

  it('returns noTargetDate when target date is missing', () => {
    const result = getWantScheduleHealth({
      remainingCents: 20000,
      perPayCents: 10000,
      payPeriodDays: 14,
      behavioralMultiplier: 1,
      targetDate: null,
      now,
    })
    expect(result.status).toBe('noTargetDate')
    expect(result.tone).toBe('secondary')
    expect(result.daysDeltaToTarget).toBeNull()
  })

  it('returns noPace when per-pay pace is zero', () => {
    const result = getWantScheduleHealth({
      remainingCents: 20000,
      perPayCents: 0,
      payPeriodDays: 14,
      behavioralMultiplier: 1,
      targetDate: '2026-05-30',
      now,
    })
    expect(result.status).toBe('noPace')
    expect(result.tone).toBe('secondary')
    expect(result.daysDeltaToTarget).toBeNull()
  })
})

describe('formatMixedDurationFromDays', () => {
  it('formats mixed months and days', () => {
    expect(formatMixedDurationFromDays(449)).toBe('1 year 2 months')
  })

  it('formats short values as days', () => {
    expect(formatMixedDurationFromDays(12)).toBe('12 days')
  })
})

describe('formatCompactDurationFromDays', () => {
  it('formats compact mixed units', () => {
    expect(formatCompactDurationFromDays(449)).toBe('1y 2mo')
  })

  it('formats compact days', () => {
    expect(formatCompactDurationFromDays(12)).toBe('12d')
  })
})

describe('getExpectedPerPayCentsForTarget', () => {
  const now = new Date('2026-03-24T00:00:00Z')

  it('returns required pace to hit target date', () => {
    const result = getExpectedPerPayCentsForTarget({
      remainingCents: 40000,
      payPeriodDays: 14,
      behavioralMultiplier: 1,
      targetDate: '2026-05-05',
      now,
    })
    expect(result).toBe(10000)
  })

  it('returns full remaining when target date already passed', () => {
    const result = getExpectedPerPayCentsForTarget({
      remainingCents: 40000,
      payPeriodDays: 14,
      behavioralMultiplier: 1,
      targetDate: '2026-03-01',
      now,
    })
    expect(result).toBe(40000)
  })
})
