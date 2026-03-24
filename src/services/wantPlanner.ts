/**
 * Need vs Want savings planner: estimates a conservative "save before next payday"
 * amount using upcoming obligations, weekly spending behaviour, and a safety buffer.
 */

import { getAppSetting, setAppSetting } from '@/db'
import {
  getAvailableBalance,
  getPayAmountCents,
  getReservedAmount,
  getSpendableBalance,
} from '@/services/balance'
import { getWeeklyInsights, getWeekRange } from '@/services/insights'
import { getUpcomingChargesGrouped } from '@/services/upcoming'

const SPENDABLE_ALERT_KEY = 'spendable_alert_below_cents'
const SPENDABLE_ALERT_PCT_PAY_KEY = 'spendable_alert_below_pct_pay'
export const WANT_SPLIT_MODE_KEY = 'want_split_mode'

export type WantSplitMode = 'equal' | 'priority' | 'percent'

export function getWantSplitMode(): WantSplitMode {
  const raw = getAppSetting(WANT_SPLIT_MODE_KEY)
  if (raw === 'priority' || raw === 'percent' || raw === 'equal') return raw
  return 'equal'
}

export function setWantSplitMode(mode: WantSplitMode): void {
  setAppSetting(WANT_SPLIT_MODE_KEY, mode)
}

function payPeriodDaysFromFrequency(frequency: string | null): number {
  switch (frequency) {
    case 'WEEKLY':
      return 7
    case 'FORTNIGHTLY':
      return 14
    case 'MONTHLY':
    default:
      return 30
  }
}

export function getEffectiveSpendableThresholdCents(): number | null {
  const payAmountCents = getPayAmountCents()
  const thresholdCentsRaw = getAppSetting(SPENDABLE_ALERT_KEY)
  const thresholdCents =
    thresholdCentsRaw != null && thresholdCentsRaw !== ''
      ? parseInt(thresholdCentsRaw, 10)
      : null
  const pctPayRaw = getAppSetting(SPENDABLE_ALERT_PCT_PAY_KEY)
  const pctPay =
    pctPayRaw != null && pctPayRaw !== '' ? parseInt(pctPayRaw, 10) : 0
  const pctThresholdCents =
    payAmountCents != null && pctPay > 0 && pctPay <= 100
      ? Math.round((payAmountCents * pctPay) / 100)
      : null
  const effective =
    thresholdCents != null && thresholdCents > 0
      ? pctThresholdCents != null
        ? Math.max(thresholdCents, pctThresholdCents)
        : thresholdCents
      : pctThresholdCents
  if (effective == null || effective <= 0) return null
  return effective
}

/** Average Money Out over the last `weeks` complete weeks (including current week as offset 0). */
export function getAverageWeeklyMoneyOutRolling(weeks: number): number {
  if (weeks < 1) return 0
  let total = 0
  let count = 0
  for (let o = 0; o > -weeks; o--) {
    const range = getWeekRange(o)
    total += getWeeklyInsights(range).moneyOut
    count += 1
  }
  return count > 0 ? Math.round(total / count) : 0
}

export interface NeedsSummary {
  reservedCents: number
  countBeforeNextPay: number
  sumBeforeNextPayCents: number
  nextPayday: string | null
}

export function getNeedsSummary(): NeedsSummary {
  const reservedCents = getReservedAmount()
  const { nextPay, nextPayday } = getUpcomingChargesGrouped()
  let sumBeforeNextPayCents = 0
  for (const c of nextPay) {
    sumBeforeNextPayCents += c.amount
  }
  return {
    reservedCents,
    countBeforeNextPay: nextPay.length,
    sumBeforeNextPayCents,
    nextPayday,
  }
}

export interface WantPlannerSnapshot {
  spendableCents: number
  availableCents: number
  reservedCents: number
  weeksUntilNextPayday: number
  upcomingNeedsBeforeNextPayCents: number
  behavioralNeedCents: number
  needEstimateCents: number
  effectiveSpendableFloorCents: number | null
  recommendedBeforeNextPayCents: number
  payAmountCents: number | null
  paydayFrequency: string | null
  nextPayday: string | null
  payPeriodDays: number
  avgWeeklyMoneyOut4Weeks: number
  currentWeekMoneyOut: number
  behavioralMultiplier: number
  /** Conservative cap per pay period toward wants (before split across wants). */
  baseSavingsPerPayPeriodCents: number
  /** Same rate expressed per 30-day month for display. */
  monthlyEquivalentSavingsCents: number
  completeness: {
    hasPayAmount: boolean
    hasNextPayday: boolean
    hasPaydayFrequency: boolean
  }
  assumptionLines: string[]
}

function daysUntilDate(nextDate: string | null): number | null {
  if (nextDate == null || String(nextDate).trim() === '') return null
  const today = new Date()
  const now = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  )
  const target = new Date(String(nextDate).trim() + 'T12:00:00Z')
  const delta = target.getTime() - now.getTime()
  return Math.max(0, Math.ceil(delta / (24 * 60 * 60 * 1000)))
}

export function buildWantPlannerSnapshot(): WantPlannerSnapshot {
  const spendableCents = getSpendableBalance()
  const availableCents = getAvailableBalance()
  const reservedCents = getReservedAmount()

  const payAmountCents = getPayAmountCents()
  const nextPayday = getAppSetting('next_payday')
  const paydayFrequency = getAppSetting('payday_frequency')
  const payPeriodDays = payPeriodDaysFromFrequency(paydayFrequency)
  const { nextPay } = getUpcomingChargesGrouped()
  const upcomingNeedsBeforeNextPayCents = nextPay.reduce(
    (sum, c) => sum + c.amount,
    0
  )

  const avgWeeklyMoneyOut4Weeks = getAverageWeeklyMoneyOutRolling(4)
  const currentWeekMoneyOut = getWeeklyInsights(getWeekRange(0)).moneyOut
  const behavioralMultiplier =
    avgWeeklyMoneyOut4Weeks > 0
      ? Math.max(1, currentWeekMoneyOut / avgWeeklyMoneyOut4Weeks)
      : 1
  const daysUntilNextPay = daysUntilDate(nextPayday)
  const weeksUntilNextPayday =
    daysUntilNextPay != null
      ? Math.max(1, Math.ceil(daysUntilNextPay / 7))
      : Math.max(1, Math.ceil(payPeriodDays / 7))
  const behavioralNeedCents = Math.round(
    currentWeekMoneyOut * weeksUntilNextPayday
  )
  const needEstimateCents = Math.max(
    upcomingNeedsBeforeNextPayCents,
    behavioralNeedCents
  )

  const hasPayAmount = payAmountCents != null && payAmountCents > 0
  const hasNextPayday = nextPayday != null && String(nextPayday).trim() !== ''
  const hasPaydayFrequency =
    paydayFrequency != null && String(paydayFrequency).trim() !== ''

  const effectiveSpendableFloorCents = getEffectiveSpendableThresholdCents()
  const safeBufferCents = effectiveSpendableFloorCents ?? 0

  const baseSavingsPerPayPeriodCents = Math.max(
    0,
    Math.min(
      Math.max(0, availableCents - needEstimateCents - safeBufferCents),
      hasPayAmount && payAmountCents != null
        ? payAmountCents
        : Math.max(0, availableCents - needEstimateCents - safeBufferCents)
    )
  )

  const recommendedBeforeNextPayCents = baseSavingsPerPayPeriodCents
  const monthsPerPay = 30 / payPeriodDays
  const monthlyEquivalentSavingsCents = Math.round(
    baseSavingsPerPayPeriodCents * monthsPerPay
  )

  const assumptionLines: string[] = [
    'Starts from your currently available balance.',
    'Treats near-term needs as the higher of: charges due before payday, or your recent weekly spending trend until payday.',
    'Keeps your low-spendable alert amount as a safety buffer when configured.',
    'Uses your pay amount as a cap when pay settings are available.',
    'Projected timeline can extend when this week is higher than your 4-week spending baseline.',
  ]

  return {
    spendableCents,
    availableCents,
    reservedCents,
    weeksUntilNextPayday,
    upcomingNeedsBeforeNextPayCents,
    behavioralNeedCents,
    needEstimateCents,
    effectiveSpendableFloorCents,
    recommendedBeforeNextPayCents,
    payAmountCents,
    paydayFrequency,
    nextPayday: hasNextPayday ? String(nextPayday).trim() : null,
    payPeriodDays,
    avgWeeklyMoneyOut4Weeks,
    currentWeekMoneyOut,
    behavioralMultiplier,
    baseSavingsPerPayPeriodCents,
    monthlyEquivalentSavingsCents,
    completeness: {
      hasPayAmount,
      hasNextPayday,
      hasPaydayFrequency,
    },
    assumptionLines,
  }
}

export interface WantRowInput {
  id: number
  remainingCents: number
  priorityRank: number | null
  allocationPercent: number | null
}

/**
 * Allocation of base per-pay savings (cents) to each want id based on split mode.
 */
export function allocatePerWantPerPayCents(
  basePerPayCents: number,
  mode: WantSplitMode,
  wants: WantRowInput[]
): Map<number, number> {
  const map = new Map<number, number>()
  const active = wants.filter((w) => w.remainingCents > 0)
  if (active.length === 0 || basePerPayCents <= 0) {
    for (const w of wants) map.set(w.id, 0)
    return map
  }

  if (mode === 'equal') {
    const each = Math.floor(basePerPayCents / active.length)
    const spareCents = basePerPayCents - each * active.length
    for (let i = 0; i < active.length; i++) {
      const extra = i < spareCents ? 1 : 0
      map.set(active[i].id, each + extra)
    }
    for (const w of wants) {
      if (!map.has(w.id)) map.set(w.id, 0)
    }
    return map
  }

  if (mode === 'priority') {
    const sorted = [...active].sort((a, b) => {
      const pa = a.priorityRank ?? 999999
      const pb = b.priorityRank ?? 999999
      if (pa !== pb) return pa - pb
      return a.id - b.id
    })
    let pool = basePerPayCents
    for (const w of wants) map.set(w.id, 0)
    for (const w of sorted) {
      const take = Math.min(w.remainingCents, pool)
      map.set(w.id, take)
      pool -= take
      if (pool <= 0) break
    }
    return map
  }

  // percent
  let sumPct = 0
  for (const w of active) {
    const p = w.allocationPercent != null ? Math.max(0, w.allocationPercent) : 0
    sumPct += p
  }
  if (sumPct <= 0) {
    const each = Math.floor(basePerPayCents / active.length)
    const spareCents = basePerPayCents - each * active.length
    for (let i = 0; i < active.length; i++) {
      const extra = i < spareCents ? 1 : 0
      map.set(active[i].id, each + extra)
    }
    for (const w of wants) {
      if (!map.has(w.id)) map.set(w.id, 0)
    }
    return map
  }

  let assigned = 0
  for (let i = 0; i < active.length; i++) {
    const w = active[i]
    const p = w.allocationPercent != null ? Math.max(0, w.allocationPercent) : 0
    const isLast = i === active.length - 1
    const share = isLast
      ? basePerPayCents - assigned
      : Math.floor((basePerPayCents * p) / sumPct)
    assigned += share
    map.set(w.id, share)
  }
  for (const w of wants) {
    if (!map.has(w.id)) map.set(w.id, 0)
  }
  return map
}

export function estimatePayPeriodsToFund(
  remainingCents: number,
  perPayCents: number,
  behavioralMultiplier: number
): number | null {
  if (remainingCents <= 0) return 0
  if (perPayCents <= 0) return null
  const raw = Math.ceil(remainingCents / perPayCents)
  return Math.max(1, Math.ceil(raw * behavioralMultiplier))
}

export type WantScheduleTone = 'success' | 'warning' | 'danger' | 'secondary'

export type WantScheduleStatus =
  | 'ahead'
  | 'onTrack'
  | 'atRisk'
  | 'offTrack'
  | 'noTargetDate'
  | 'noPace'

export interface WantScheduleHealthInput {
  remainingCents: number
  perPayCents: number
  payPeriodDays: number
  behavioralMultiplier: number
  targetDate: string | null
  warningLateDays?: number
  now?: Date
}

export interface WantScheduleHealth {
  status: WantScheduleStatus
  tone: WantScheduleTone
  projectedPayPeriods: number | null
  projectedCompletionDate: string | null
  daysDeltaToTarget: number | null
}

function toUtcDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

function parseIsoDate(dateLike: string): Date | null {
  const value = String(dateLike).trim()
  if (!value) return null
  const parsed = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function getWantScheduleHealth(
  input: WantScheduleHealthInput
): WantScheduleHealth {
  const warningLateDays = Math.max(0, input.warningLateDays ?? 45)
  const now = toUtcDateOnly(input.now ?? new Date())
  const target = input.targetDate ? parseIsoDate(input.targetDate) : null
  if (!target) {
    return {
      status: 'noTargetDate',
      tone: 'secondary',
      projectedPayPeriods: null,
      projectedCompletionDate: null,
      daysDeltaToTarget: null,
    }
  }

  const projectedPayPeriods = estimatePayPeriodsToFund(
    input.remainingCents,
    input.perPayCents,
    input.behavioralMultiplier
  )
  if (projectedPayPeriods == null) {
    return {
      status: 'noPace',
      tone: 'secondary',
      projectedPayPeriods: null,
      projectedCompletionDate: null,
      daysDeltaToTarget: null,
    }
  }

  const projectedDays = projectedPayPeriods * Math.max(1, input.payPeriodDays)
  const projectedAt = new Date(
    now.getTime() + projectedDays * 24 * 60 * 60 * 1000
  )
  const rawDaysDeltaToTarget = Math.ceil(
    (projectedAt.getTime() - target.getTime()) / (24 * 60 * 60 * 1000)
  )
  const daysDeltaToTarget = Object.is(rawDaysDeltaToTarget, -0)
    ? 0
    : rawDaysDeltaToTarget

  if (daysDeltaToTarget <= 0) {
    return {
      status: daysDeltaToTarget < 0 ? 'ahead' : 'onTrack',
      tone: 'success',
      projectedPayPeriods,
      projectedCompletionDate: projectedAt.toISOString().slice(0, 10),
      daysDeltaToTarget,
    }
  }
  if (daysDeltaToTarget <= warningLateDays) {
    return {
      status: 'atRisk',
      tone: 'warning',
      projectedPayPeriods,
      projectedCompletionDate: projectedAt.toISOString().slice(0, 10),
      daysDeltaToTarget,
    }
  }
  return {
    status: 'offTrack',
    tone: 'danger',
    projectedPayPeriods,
    projectedCompletionDate: projectedAt.toISOString().slice(0, 10),
    daysDeltaToTarget,
  }
}

export function formatMixedDurationFromDays(daysRaw: number): string {
  const days = Math.max(0, Math.abs(Math.round(daysRaw)))
  if (days === 0) return '0 days'
  const years = Math.floor(days / 365)
  const afterYears = days % 365
  const months = Math.floor(afterYears / 30)
  const remDays = afterYears % 30
  const parts: string[] = []
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`)
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`)
  if (remDays > 0) parts.push(`${remDays} day${remDays === 1 ? '' : 's'}`)
  return parts.slice(0, 2).join(' ')
}

export function formatCompactDurationFromDays(daysRaw: number): string {
  const days = Math.max(0, Math.abs(Math.round(daysRaw)))
  if (days === 0) return '0d'
  const years = Math.floor(days / 365)
  const afterYears = days % 365
  const months = Math.floor(afterYears / 30)
  const remDays = afterYears % 30
  const parts: string[] = []
  if (years > 0) parts.push(`${years}y`)
  if (months > 0) parts.push(`${months}mo`)
  if (remDays > 0) parts.push(`${remDays}d`)
  return parts.slice(0, 2).join(' ')
}

export interface WantExpectedPaceInput {
  remainingCents: number
  payPeriodDays: number
  behavioralMultiplier: number
  targetDate: string | null
  now?: Date
}

/**
 * Returns the pace needed per pay period to finish by target date.
 * Null means the required pace cannot be estimated from current inputs.
 */
export function getExpectedPerPayCentsForTarget(
  input: WantExpectedPaceInput
): number | null {
  const now = toUtcDateOnly(input.now ?? new Date())
  const target = input.targetDate ? parseIsoDate(input.targetDate) : null
  if (!target) return null
  if (input.remainingCents <= 0) return 0
  const msPerDay = 24 * 60 * 60 * 1000
  const daysUntilTarget = Math.ceil(
    (target.getTime() - now.getTime()) / msPerDay
  )
  if (daysUntilTarget <= 0) return input.remainingCents
  const rawPeriodsLeft = Math.max(
    1,
    Math.ceil(daysUntilTarget / Math.max(1, input.payPeriodDays))
  )
  const effectivePeriodsLeft = Math.max(
    1,
    Math.floor(rawPeriodsLeft / Math.max(1, input.behavioralMultiplier))
  )
  return Math.ceil(input.remainingCents / effectivePeriodsLeft)
}
