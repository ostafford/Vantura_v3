/**
 * Each Regular's **funding source** (GLOSSARY; docs/adr/0019, 0020): the
 * account of its most recent linked payment. Null means unknown, which every
 * caller treats as transactional, never as Essentials.
 *
 * Resolving it costs a transactions lookup per Regular, so only the queries
 * that need it pay for it.
 */

import type { Database } from 'sql.js'
import { getDb } from '@/db'
import { localDateString } from '@/lib/format'
import { getFundingSourceAccountId } from '../fundingSource'
import { firstOccurrenceOnOrAfter } from './projection'
import { readRegulars, type Regular } from './rows'

export interface RegularWithFundingSource {
  /** As stored: `next_charge_date` is the anchor, not projected. */
  regular: Regular
  /** Account id of the most recent linked payment; null = unknown. */
  fundingAccountId: string | null
  /** Next occurrence on or after today; null = never falls due again. */
  nextOccurrence: string | null
}

/** Pairs each Regular with its funding source, keeping order. */
export function withFundingSource<T extends Regular>(
  db: Database,
  regulars: T[]
): Array<{ regular: T; fundingAccountId: string | null }> {
  return regulars.map((regular) => ({
    regular,
    fundingAccountId: getFundingSourceAccountId(db, regular),
  }))
}

/**
 * Every Regular, in id order, with its funding source and next occurrence.
 * Empty when the DB isn't ready.
 */
export function regularsWithFundingSource(): RegularWithFundingSource[] {
  const db = getDb()
  if (!db) return []
  const today = localDateString()
  return withFundingSource(db, readRegulars(db)).map(
    ({ regular, fundingAccountId }) => ({
      regular,
      fundingAccountId,
      nextOccurrence: firstOccurrenceOnOrAfter(
        regular.next_charge_date,
        regular.frequency,
        today,
        regular.cancel_by_date
      ),
    })
  )
}

/**
 * Why an Essentials user's Regular isn't getting the Essentials benefit yet
 * (#97). Funding source needs a linked payment, so:
 * - `unlinked`: no `match_description`, so the user has to link one.
 * - `no_payment`: linked, but no settled payment matches yet (none has
 *   arrived, it's outside the ±20% band, or it also matches another Regular).
 */
export type EssentialsLinkHint = 'unlinked' | 'no_payment'

/**
 * The Essentials link hint for each Regular that has one, keyed by id. A
 * Regular has none when a payment is linked (whichever account paid it:
 * that's an answer, not a linking problem), when it's excluded from Spendable,
 * or when it never falls due again (the same occurrence check as Reserved).
 * Callers gate on an active Essentials nomination.
 */
export function essentialsLinkHints(): Map<number, EssentialsLinkHint> {
  const hints = new Map<number, EssentialsLinkHint>()
  for (const {
    regular,
    fundingAccountId,
    nextOccurrence,
  } of regularsWithFundingSource()) {
    if (regular.is_reserved !== 1 || nextOccurrence === null) continue
    if (!regular.match_description) hints.set(regular.id, 'unlinked')
    else if (fundingAccountId === null) hints.set(regular.id, 'no_payment')
  }
  return hints
}
