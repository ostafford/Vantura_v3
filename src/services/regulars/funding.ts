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
