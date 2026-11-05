/**
 * Reserved (GLOSSARY: **Reserved**, docs/adr/0002, 0019): the part of Available
 * held back for `is_reserved` Regulars falling due strictly before the next
 * payday. A charge due *on* payday isn't reserved — that day's pay covers it.
 * Weekly/fortnightly charges count once per occurrence before payday; monthly
 * and rarer count their full amount once, never prorated.
 *
 * `reservedBeforePayday` is the module's interface for it. The pure
 * `calculateReserved*` functions below are an internal seam, exported only
 * for this file's own tests.
 */

import type { Database } from 'sql.js'
import { getDb, getAppSetting } from '@/db'
import { localDateString } from '@/lib/format'
import { getActiveEssentialsSaverAccountId } from '../essentials'
import { firstOccurrenceOnOrAfter } from './projection'
import { readRegulars, type Regular } from './rows'
import { withFundingSource } from './funding'

/** The fields the Reserved calculation reads from a Regular. */
export type ReservedInput = Pick<
  Regular,
  'next_charge_date' | 'frequency' | 'amount' | 'is_reserved'
> & { cancel_by_date?: string | null }

export interface ReservedBreakdownItem {
  name: string
  projectedDate: string
  fullAmount: number
  reservedAmount: number
  occurrenceCount: number
  frequency: string
}

/** One Regular's share of Reserved, with the Regular it came from. */
export interface ReservedItem extends ReservedBreakdownItem {
  regular: Regular
}

interface ChargeReservedResult {
  reservedAmount: number
  occurrenceCount: number
  projectedDate: string
}

/**
 * Calculates the reserved amount for a single charge within the pay window.
 * Returns null if the charge has no qualifying occurrence strictly before nextPayday.
 * Charges due ON the payday itself are excluded — that day's incoming pay covers them,
 * so they don't need to be reserved from the current balance.
 * Single source of truth — used by both calculateReservedAmount and calculateReservedBreakdown.
 */
function calcChargeReserved(
  charge: ReservedInput,
  nextPayday: string,
  today: string
): ChargeReservedResult | null {
  const projectedDate = firstOccurrenceOnOrAfter(
    charge.next_charge_date,
    charge.frequency,
    today,
    charge.cancel_by_date ?? null
  )
  if (!projectedDate || projectedDate >= nextPayday) return null

  switch (charge.frequency) {
    case 'WEEKLY':
    case 'FORTNIGHTLY': {
      // Count every occurrence strictly before payday.
      // A 26-day window can contain 3–4 weekly or 2 fortnightly occurrences.
      const stepDays = charge.frequency === 'WEEKLY' ? 7 : 14
      let occDate = projectedDate
      let total = 0
      let count = 0
      while (occDate < nextPayday) {
        if (charge.cancel_by_date && occDate > charge.cancel_by_date) break
        total += charge.amount
        count++
        const d = new Date(occDate + 'T12:00:00Z')
        d.setUTCDate(d.getUTCDate() + stepDays)
        occDate = d.toISOString().slice(0, 10)
      }
      return { reservedAmount: total, occurrenceCount: count, projectedDate }
    }
    // ONCE / MONTHLY / QUARTERLY / YEARLY: a charge that reaches this point already has
    // its one qualifying occurrence strictly before nextPayday (the guard above only lets
    // charges due within one pay cycle through), so it's always reserved in full — there's
    // no "periods until due" left to prorate across.
    default:
      return {
        reservedAmount: charge.amount,
        occurrenceCount: 1,
        projectedDate,
      }
  }
}

/**
 * Total reserved amount (cents) across all is_reserved charges due before next payday.
 */
export function calculateReservedAmount(
  upcomingCharges: ReservedInput[],
  nextPayday: string | null,
  paydayFrequency: string | null
): number {
  if (!nextPayday || !paydayFrequency) return 0
  const today = localDateString()
  let total = 0
  for (const charge of upcomingCharges.filter((c) => c.is_reserved === 1)) {
    const result = calcChargeReserved(charge, nextPayday, today)
    if (result) total += result.reservedAmount
  }
  return Math.round(total)
}

/** Each reserved charge with a qualifying occurrence before payday, in input order. */
function reservedCharges<T extends ReservedInput>(
  charges: T[],
  nextPayday: string | null,
  paydayFrequency: string | null
): Array<{ charge: T; calc: ChargeReservedResult }> {
  if (!nextPayday || !paydayFrequency) return []
  const today = localDateString()
  const result: Array<{ charge: T; calc: ChargeReservedResult }> = []
  for (const charge of charges.filter((c) => c.is_reserved === 1)) {
    const calc = calcChargeReserved(charge, nextPayday, today)
    if (calc) result.push({ charge, calc })
  }
  return result
}

function toBreakdownItem(
  charge: ReservedInput & { name: string },
  calc: ChargeReservedResult
): ReservedBreakdownItem {
  return {
    name: charge.name,
    projectedDate: calc.projectedDate,
    fullAmount: charge.amount,
    reservedAmount: Math.round(calc.reservedAmount),
    occurrenceCount: calc.occurrenceCount,
    frequency: charge.frequency,
  }
}

/**
 * Same logic as calculateReservedAmount but returns per-charge detail rows.
 * Pure function — accepts charges array directly so it can be unit tested without a DB.
 */
export function calculateReservedBreakdown(
  charges: Array<ReservedInput & { name: string }>,
  nextPayday: string | null,
  paydayFrequency: string | null
): ReservedBreakdownItem[] {
  return reservedCharges(charges, nextPayday, paydayFrequency).map(
    ({ charge, calc }) => toBreakdownItem(charge, calc)
  )
}

/**
 * Essentials-era funding-source filter (docs/adr/0019). Classic users (no
 * nominated Essentials Saver, or one that's closed/missing) pass every charge
 * through untouched — this is
 * the null guard that keeps the classic Reserved formula byte-identical.
 * For an Essentials user, drops any charge whose funding source — the
 * account of its most recent linked payment (docs/adr/0020), no window
 * restriction — is the nominated Saver. A charge with no `match_description`,
 * or with no linked payment yet, is kept (resolves transactional) — never
 * assumed Essentials-funded.
 */
function excludeEssentialsFundedCharges(
  db: Database,
  charges: Regular[]
): Regular[] {
  const essentialsSaverId = getActiveEssentialsSaverAccountId()
  if (!essentialsSaverId) return charges
  return withFundingSource(db, charges)
    .filter((c) => c.fundingAccountId !== essentialsSaverId)
    .map((c) => c.regular)
}

/**
 * Each reserved Regular's share of Reserved for the current pay window, in id
 * order. Empty when no payday is configured (or the DB isn't ready).
 *
 * `excludeEssentialsFunded: true` is Spendable's Reserved: for an Essentials
 * user, Regulars funded from the nominated Saver are left out (they're covered
 * there, not from Available). It costs a transactions lookup per Regular.
 * `false` is every reserved Regular regardless of funding source —
 * Essentials coverage's "if all were transactional" total.
 */
export function reservedBeforePayday(opts: {
  excludeEssentialsFunded: boolean
}): ReservedItem[] {
  const db = getDb()
  if (!db) return []
  const all = readRegulars(db)
  const regulars = opts.excludeEssentialsFunded
    ? excludeEssentialsFundedCharges(db, all)
    : all
  return reservedCharges(
    regulars,
    getAppSetting('next_payday'),
    getAppSetting('payday_frequency')
  ).map(({ charge, calc }) => ({
    ...toBreakdownItem(charge, calc),
    regular: charge,
  }))
}

/**
 * Reserved total (cents) for a set of items: the exact sum, rounded once — the
 * figure Spendable uses (`calculateReservedAmount`'s
 * rounding). It replays `calcChargeReserved`'s own additions — a Regular's
 * unrounded share is its amount added once per occurrence — so it matches
 * bit for bit. Summing each item's already-rounded `reservedAmount` instead
 * differs only for a fractional-cent amount, which only a hand-edited profile
 * import could store; Essentials coverage sums those, as it always has.
 */
export function totalReserved(items: ReservedItem[]): number {
  let total = 0
  for (const item of items) {
    let share = 0
    for (let i = 0; i < item.occurrenceCount; i++) share += item.regular.amount
    total += share
  }
  return Math.round(total)
}
