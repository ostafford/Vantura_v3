/**
 * Essentials-era Dashboard bill-coverage block (docs/adr/0019 § Presentation;
 * threshold/copy locked in ticket #95). Classic users get `null` — the block
 * doesn't exist for them, the classic three-card Dashboard zone is untouched.
 */

import type { Database } from 'sql.js'
import { getDb, getAppSetting } from '@/db'
import { getEssentialsNomination } from './essentials'
import {
  getFundingSourceAccountId,
  type LinkableRegular,
} from './fundingSource'
import { getAccountById } from './accounts'
import { calculateReservedBreakdown, type UpcomingChargeRow } from './balance'

export type EssentialsCoverageState =
  | 'hidden'
  | 'saver_unavailable'
  | 'payday_needed'
  | 'covered'
  | 'partial'
  | 'shortfall'

export interface EssentialsCoverage {
  state: EssentialsCoverageState
  /** Transactional-funded reserved amount (cents) — same figure as getReservedAmount(). */
  reservedHereCents: number
  /** Essentials-funded, is_reserved amount due before payday (cents). */
  essentialsSetAsideCents: number
  /** The nominated Saver's live balance (cents). */
  saverBalanceCents: number
  /** max(0, essentialsSetAsideCents - saverBalanceCents). */
  shortfallCents: number
  /** Count of is_reserved, due-before-payday Regulars still transactional-funded. */
  transactionalCount: number
}

interface ChargeRow extends UpcomingChargeRow, LinkableRegular {
  name: string
}

function loadCharges(db: Database): ChargeRow[] {
  const stmt = db.prepare(
    `SELECT name, next_charge_date, frequency, amount, is_reserved, cancel_by_date, id, match_description FROM upcoming_charges`
  )
  const rows: ChargeRow[] = []
  while (stmt.step()) {
    const r = stmt.get() as [
      string,
      string,
      string,
      number,
      number,
      string | null,
      number,
      string | null,
    ]
    rows.push({
      name: r[0],
      next_charge_date: r[1],
      frequency: r[2],
      amount: r[3],
      is_reserved: r[4],
      cancel_by_date: r[5],
      id: r[6],
      match_description: r[7] ?? null,
    })
  }
  stmt.free()
  return rows
}

function emptyCoverage(state: EssentialsCoverageState): EssentialsCoverage {
  return {
    state,
    reservedHereCents: 0,
    essentialsSetAsideCents: 0,
    saverBalanceCents: 0,
    shortfallCents: 0,
    transactionalCount: 0,
  }
}

/**
 * Null for a classic user (no nominated Saver) — the coverage block doesn't
 * exist for them. For an Essentials user, `state: 'hidden'` means no
 * Essentials payment has ever been observed yet (every Regular currently
 * resolves transactional) — the caller should render nothing, same as a
 * classic user, rather than a misleading "$0 set aside" split. See
 * docs/adr/0019 § Presentation.
 *
 * Two states decline to give a coverage result (the figures are all zero):
 * - `saver_unavailable` — the nominated Saver is closed or missing. Reserved
 *   has already fallen back to the classic formula, so the block only asks
 *   the user to choose another; it's shown even if no Essentials payment was
 *   ever observed, because the user did nominate one.
 * - `payday_needed` — no pay cycle is configured, so "due before payday"
 *   can't be evaluated; fails loudly instead of claiming "covered".
 */
export function getEssentialsCoverage(): EssentialsCoverage | null {
  const nomination = getEssentialsNomination()
  if (nomination.status === 'none') return null
  if (nomination.status === 'unavailable') {
    return emptyCoverage('saver_unavailable')
  }
  const essentialsSaverId = nomination.accountId

  const db = getDb()
  if (!db) return null

  const charges = loadCharges(db)

  // Visibility gate: has any Regular's funding source ever resolved to the
  // nominated Saver, regardless of whether it's due this cycle? No window —
  // "has Essentials ever been observed", not "is it due right now".
  const anyEssentialsFunded = charges.some(
    (c) => getFundingSourceAccountId(db, c) === essentialsSaverId
  )
  if (!anyEssentialsFunded) return emptyCoverage('hidden')

  const nextPayday = getAppSetting('next_payday')
  const paydayFrequency = getAppSetting('payday_frequency')
  if (!nextPayday || !paydayFrequency) return emptyCoverage('payday_needed')
  const reservedCharges = charges.filter((c) => c.is_reserved === 1)

  const transactionalCharges = reservedCharges.filter(
    (c) => getFundingSourceAccountId(db, c) !== essentialsSaverId
  )

  const fullBreakdown = calculateReservedBreakdown(
    reservedCharges,
    nextPayday,
    paydayFrequency
  )
  const transactionalBreakdown = calculateReservedBreakdown(
    transactionalCharges,
    nextPayday,
    paydayFrequency
  )

  const totalIfAllTransactionalCents = fullBreakdown.reduce(
    (sum, item) => sum + item.reservedAmount,
    0
  )
  const reservedHereCents = transactionalBreakdown.reduce(
    (sum, item) => sum + item.reservedAmount,
    0
  )
  const essentialsSetAsideCents =
    totalIfAllTransactionalCents - reservedHereCents
  const transactionalCount = transactionalBreakdown.length

  // Present by construction: an active nomination has an open accounts row.
  const saverBalanceCents = getAccountById(essentialsSaverId)?.balance ?? 0
  const shortfallCents = Math.max(
    0,
    essentialsSetAsideCents - saverBalanceCents
  )

  const state: EssentialsCoverageState =
    shortfallCents > 0
      ? 'shortfall'
      : transactionalCount > 0
        ? 'partial'
        : 'covered'

  return {
    state,
    reservedHereCents,
    essentialsSetAsideCents,
    saverBalanceCents,
    shortfallCents,
    transactionalCount,
  }
}
