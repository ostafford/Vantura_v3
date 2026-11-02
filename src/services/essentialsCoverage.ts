/**
 * Essentials-era Dashboard bill-coverage block (docs/adr/0019 § Presentation;
 * threshold/copy locked in ticket #95). Classic users get `null` — the block
 * doesn't exist for them, the classic three-card Dashboard zone is untouched.
 */

import { getDb, getAppSetting } from '@/db'
import { localDateString } from '@/lib/format'
import { getEssentialsNomination } from './essentials'
import { getFundingSourceAccountId } from './fundingSource'
import { getAccountById } from './accounts'
import { firstOccurrenceOnOrAfter, reservedBeforePayday } from './regulars'
import { readRegulars } from './regulars/rows'

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
  /**
   * Count of is_reserved Regulars still transactional-funded that will fall
   * due again (any occurrence from today, any cycle — not just before payday).
   * Drives "partial": a bill not yet moved to Essentials stops "All bills
   * covered" even when it isn't due this cycle.
   */
  transactionalCount: number
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

  const charges = readRegulars(db)

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

  // Rounded per Regular, then summed — this block's figures as they've always been.
  const sumReserved = (items: Array<{ reservedAmount: number }>) =>
    items.reduce((sum, item) => sum + item.reservedAmount, 0)
  const totalIfAllTransactionalCents = sumReserved(
    reservedBeforePayday({ excludeEssentialsFunded: false })
  )
  // The nomination is active here, so this excludes exactly the Regulars
  // funded from `essentialsSaverId`.
  const reservedHereCents = sumReserved(
    reservedBeforePayday({ excludeEssentialsFunded: true })
  )
  const essentialsSetAsideCents =
    totalIfAllTransactionalCents - reservedHereCents
  const today = localDateString()
  const transactionalCount = transactionalCharges.filter(
    (c) =>
      firstOccurrenceOnOrAfter(
        c.next_charge_date,
        c.frequency,
        today,
        c.cancel_by_date ?? null
      ) !== null
  ).length

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
