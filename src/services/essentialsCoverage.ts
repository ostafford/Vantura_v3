/**
 * Essentials-era Dashboard bill-coverage block (docs/adr/0019 § Presentation;
 * threshold/copy locked in ticket #95). Classic users get `null` — the block
 * doesn't exist for them, the classic three-card Dashboard zone is untouched.
 */

import type { Database } from 'sql.js'
import { getDb, getAppSetting } from '@/db'
import { getEssentialsSaverAccountId } from './essentials'
import { getFundingSourceAccountId } from './fundingSource'
import { getAccountById } from './accounts'
import { calculateReservedBreakdown, type UpcomingChargeRow } from './balance'

export type EssentialsCoverageState =
  | 'hidden'
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

interface ChargeRow extends UpcomingChargeRow {
  name: string
  match_raw_text: string | null
}

function loadCharges(db: Database): ChargeRow[] {
  const stmt = db.prepare(
    `SELECT name, next_charge_date, frequency, amount, is_reserved, cancel_by_date, match_raw_text FROM upcoming_charges`
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
      string | null,
    ]
    rows.push({
      name: r[0],
      next_charge_date: r[1],
      frequency: r[2],
      amount: r[3],
      is_reserved: r[4],
      cancel_by_date: r[5],
      match_raw_text: r[6] ?? null,
    })
  }
  stmt.free()
  return rows
}

/**
 * Null for a classic user (no nominated Saver) — the coverage block doesn't
 * exist for them. For an Essentials user, `state: 'hidden'` means no
 * Essentials payment has ever been observed yet (every Regular currently
 * resolves transactional) — the caller should render nothing, same as a
 * classic user, rather than a misleading "$0 set aside" split. See
 * docs/adr/0019 § Presentation.
 */
export function getEssentialsCoverage(): EssentialsCoverage | null {
  const essentialsSaverId = getEssentialsSaverAccountId()
  if (!essentialsSaverId) return null

  const db = getDb()
  if (!db) return null

  const charges = loadCharges(db)

  // Visibility gate: has any Regular's funding source ever resolved to the
  // nominated Saver, regardless of whether it's due this cycle? No window —
  // "has Essentials ever been observed", not "is it due right now".
  const anyEssentialsFunded = charges.some(
    (c) =>
      c.match_raw_text &&
      getFundingSourceAccountId(db, c.match_raw_text) === essentialsSaverId
  )
  if (!anyEssentialsFunded) {
    return {
      state: 'hidden',
      reservedHereCents: 0,
      essentialsSetAsideCents: 0,
      saverBalanceCents: 0,
      shortfallCents: 0,
      transactionalCount: 0,
    }
  }

  const nextPayday = getAppSetting('next_payday')
  const paydayFrequency = getAppSetting('payday_frequency')
  const reservedCharges = charges.filter((c) => c.is_reserved === 1)

  const transactionalCharges = reservedCharges.filter((c) => {
    if (!c.match_raw_text) return true
    return getFundingSourceAccountId(db, c.match_raw_text) !== essentialsSaverId
  })

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
