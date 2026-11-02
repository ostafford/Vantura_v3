/**
 * The Regulars module (GLOSSARY: **Regular**; docs/adr/0021). Import from
 * `@/services/regulars` only — never its internal files, and never SELECT
 * `upcoming_charges` elsewhere.
 *
 * Reads are projected here (docs/adr/0004): `regularsByPayday`,
 * `regularOccurrencesInMonth`, `dueSoonRegulars`, `reservedBeforePayday`
 * (+ `totalReserved`), `regularsWithFundingSource`, `essentialsLinkHints`.
 * Two return stored rows by
 * design: `regularById` (the editor's anchor) and `linkedLiabilityRepayments`
 * (payment matching, #19).
 *
 * Internals: `rows.ts` (the one SELECT), `projection.ts`, `reserved.ts`,
 * `funding.ts`, `draft.ts`.
 *
 * Writes (#160): a draft (`blankDraft` / `draftFromRegular` /
 * `draftFromTransaction` / `draftFromSuggestion`) → `validateRegularDraft` →
 * `saveRegular`, which applies the stored-date rule and writes the bucket in
 * the same write; `deleteRegular`; and `unlinkRegularsFromManualAccount`.
 */

import { getDb, getAppSetting } from '@/db'
import { localDateString } from '@/lib/format'
import {
  readRegulars,
  readRegularById,
  byStoredDate,
  type Regular,
} from './rows'
import {
  nthOccurrence,
  firstOccurrenceOnOrAfter,
  getProjectedOccurrencesInRange,
} from './projection'

export type { Regular } from './rows'
export {
  reservedBeforePayday,
  totalReserved,
  type ReservedItem,
} from './reserved'
export {
  regularsWithFundingSource,
  essentialsLinkHints,
  type RegularWithFundingSource,
  type EssentialsLinkHint,
} from './funding'
export {
  blankDraft,
  draftFromRegular,
  draftFromTransaction,
  draftFromSuggestion,
  validateRegularDraft,
  saveRegular,
  deleteRegular,
  type RegularDraft,
  type RegularDraftErrors,
  type RegularDraftField,
  type RegularChargeType,
  type DraftSourceTransaction,
  type DraftSourceSuggestion,
} from './draft'
export {
  nextChargeDateFromAnchor,
  firstOccurrenceOnOrAfter,
} from './projection'

export interface RegularsByPayday {
  /**
   * `ONCE` charges whose date has passed with no future occurrence (`#18`). They
   * need an explicit "was this paid?" resolution — they are kept out of `nextPay`
   * so a past one-off doesn't inflate the "before next payday" total.
   */
  overdue: Regular[]
  nextPay: Regular[]
  later: Regular[]
  nextPayday: string | null
}

export const __test__ = {
  nthOccurrence,
  firstOccurrenceOnOrAfter,
  getProjectedOccurrencesInRange,
}

/** Every Regular in stored-date order (ties by id), the order the list views use. */
function readRegularsByStoredDate(
  db: NonNullable<ReturnType<typeof getDb>>
): Regular[] {
  return readRegulars(db).sort(byStoredDate)
}

export function regularsByPayday(): RegularsByPayday {
  const db = getDb()
  if (!db) return { overdue: [], nextPay: [], later: [], nextPayday: null }
  const nextPayday = getAppSetting('next_payday')
  const overdue: Regular[] = []
  const nextPay: Regular[] = []
  const later: Regular[] = []
  const today = localDateString()
  const rows = readRegularsByStoredDate(db)
  for (const row of rows) {
    const nextOccurrence = firstOccurrenceOnOrAfter(
      row.next_charge_date,
      row.frequency,
      today,
      row.cancel_by_date
    )
    if (!nextOccurrence) {
      // A recurring charge with an exhausted / cancelled cycle is silently
      // dropped. A past ONCE charge has nowhere to roll to — surface it as
      // overdue (at its stored past date) for an explicit "was this paid?"
      // resolution (#18), separate from the payday-relative groups.
      if (row.frequency === 'ONCE') overdue.push({ ...row })
      continue
    }
    const projected = { ...row, next_charge_date: nextOccurrence }
    if (nextPayday && projected.next_charge_date < nextPayday) {
      nextPay.push(projected)
    } else {
      later.push(projected)
    }
  }
  overdue.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
  nextPay.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
  later.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
  return { overdue, nextPay, later, nextPayday }
}

/**
 * Unlinks every Regular tied to a manual account that's being deleted: a
 * linked liability repayment becomes a plain `EXPENSE` with no linked account
 * (foreign keys aren't enforced in sql.js). The caller persists.
 */
export function unlinkRegularsFromManualAccount(manualAccountId: number): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(
    `UPDATE upcoming_charges SET charge_type = 'EXPENSE', linked_manual_account_id = NULL WHERE linked_manual_account_id = ?`,
    [manualAccountId]
  )
}

/** A single charge by id (raw stored row, no date projection), or null. */
export function regularById(id: number): Regular | null {
  const db = getDb()
  if (!db) return null
  return readRegularById(db, id)
}

/**
 * LIABILITY_REPAYMENT charges that are BOTH linked to a manual account AND carry
 * a payment link (`match_description`, docs/adr/0020) — the only charges the #19
 * verify-and-prompt flow (`checkLiabilityRepayments`) acts on. Raw stored rows.
 */
export function linkedLiabilityRepayments(): Regular[] {
  const db = getDb()
  if (!db) return []
  return readRegularsByStoredDate(db).filter(
    (c) =>
      c.charge_type === 'LIABILITY_REPAYMENT' &&
      c.linked_manual_account_id != null &&
      c.match_description != null &&
      c.match_description !== ''
  )
}

/**
 * Charges whose next_charge_date falls in the given month (for calendar view).
 * month is 1-12, year is full year.
 */
export function regularOccurrencesInMonth(
  year: number,
  month: number
): Regular[] {
  const db = getDb()
  if (!db) return []
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const list: Regular[] = []
  const rows = readRegularsByStoredDate(db)
  for (const row of rows) {
    list.push(...getProjectedOccurrencesInRange(row, start, end))
  }
  list.sort((a, b) => {
    const byDate = a.next_charge_date.localeCompare(b.next_charge_date)
    if (byDate !== 0) return byDate
    return a.id - b.id
  })
  return list
}

/** Days until next charge; negative if past. Used for "Due in N days" reminder. */
export function daysUntilCharge(nextChargeDate: string): number {
  const today = localDateString()
  const a = new Date(today + 'T12:00:00Z').getTime()
  const b = new Date(nextChargeDate.slice(0, 10) + 'T12:00:00Z').getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

/**
 * Charges that are within their reminder window (due_days <= reminder_days_before).
 * Sorted by next_charge_date ascending (soonest first).
 */
export function dueSoonRegulars(): Regular[] {
  const db = getDb()
  if (!db) return []
  const today = localDateString()
  const candidates = readRegularsByStoredDate(db).filter(
    (c) => c.reminder_days_before != null && c.charge_type === 'EXPENSE'
  )
  const list: Regular[] = []
  for (const charge of candidates) {
    const nextOccurrence = firstOccurrenceOnOrAfter(
      charge.next_charge_date,
      charge.frequency,
      today,
      charge.cancel_by_date
    )
    if (!nextOccurrence) continue
    const projected = { ...charge, next_charge_date: nextOccurrence }
    const days = daysUntilCharge(projected.next_charge_date)
    if (
      days >= 0 &&
      projected.reminder_days_before != null &&
      days <= projected.reminder_days_before
    ) {
      list.push(projected)
    }
  }
  list.sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
  return list
}
