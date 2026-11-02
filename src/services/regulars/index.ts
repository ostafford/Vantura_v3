/**
 * The Regulars module (GLOSSARY: **Regular**; docs/adr/0021). Import from
 * `@/services/regulars` only — never its internal files, and never SELECT
 * `upcoming_charges` elsewhere.
 *
 * Reads are projected here (docs/adr/0004): `regularsByPayday`,
 * `regularOccurrencesInMonth`, `dueSoonRegulars`, `reservedBeforePayday`
 * (+ `totalReserved`), `regularsWithFundingSource`. Two return stored rows by
 * design: `regularById` (the editor's anchor) and `linkedLiabilityRepayments`
 * (payment matching, #19).
 *
 * Internals: `rows.ts` (the one SELECT), `projection.ts`, `reserved.ts`,
 * `funding.ts`.
 *
 * Writes: `createUpcomingCharge` / `updateUpcomingCharge` / `deleteUpcomingCharge`
 * (replaced by the draft → validate → save path in #160) and
 * `unlinkRegularsFromManualAccount`.
 */

import { getDb, getAppSetting, schedulePersist } from '@/db'
import { localDateString } from '@/lib/format'
import { readRegulars, byStoredDate, type Regular } from './rows'
import {
  nthOccurrence,
  nextChargeDateFromAnchor,
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
  type RegularWithFundingSource,
} from './funding'
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

/** The fields a new Regular takes from a picked past transaction (#147). */
export interface RegularDraftFromTransaction {
  name: string
  amountCents: number
  categoryId: string | null
  /** Links the Regular to its payments (docs/adr/0020). */
  matchDescription: string
  /** Next occurrence after today — what the create form shows. */
  nextChargeDate: string
  /** The payment's own date: the anchor to store (#153). */
  anchorDate: string
}

/**
 * Build a new Regular from a picked past debit — the one rule every "pick a
 * transaction" create path uses, so the Dashboard and Budget Plan can't create
 * different Regulars from the same transaction (#147). The description becomes
 * both the name and the payment link; the date is the transaction's date
 * projected to its next occurrence after `today` for `frequency`.
 */
export function regularDraftFromTransaction(
  tx: {
    description: string
    amount: number
    date: string
    category_id: string | null
  },
  frequency: string,
  today: string = localDateString()
): RegularDraftFromTransaction {
  return {
    name: tx.description,
    amountCents: Math.abs(tx.amount),
    categoryId: tx.category_id ?? null,
    matchDescription: tx.description,
    nextChargeDate: nextChargeDateFromAnchor(tx.date, frequency, today),
    anchorDate: tx.date.slice(0, 10),
  }
}

/**
 * The `next_charge_date` to store when creating a Regular from a past payment
 * (#153). The form shows the next occurrence after today; storing that would
 * lose a month-end day (a Jan 31 payment shown as Apr 30 would then fall on
 * the 30th every month). So store the payment's own date as the anchor —
 * unless the user edited the date field (it no longer matches the date derived
 * from the payment), in which case their date is the anchor, the same rule as
 * editing (#146). `ONCE` stores the shown date: a past one-off would otherwise
 * show as Overdue. No payment (`anchorDate` null) stores the shown date.
 */
export function nextChargeDateToStoreOnCreate(create: {
  anchorDate: string | null
  frequency: string
  shownDate: string
  today?: string
}): string {
  if (!create.anchorDate || create.frequency === 'ONCE') return create.shownDate
  const derived = nextChargeDateFromAnchor(
    create.anchorDate,
    create.frequency,
    create.today ?? localDateString()
  )
  return create.shownDate.slice(0, 10) === derived
    ? create.anchorDate.slice(0, 10)
    : create.shownDate
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

export function createUpcomingCharge(
  name: string,
  amountCents: number,
  frequency: string,
  nextChargeDate: string,
  categoryId: string | null,
  isReserved: boolean,
  reminderDaysBefore: number | null = null,
  cancelByDate: string | null = null,
  chargeType: 'EXPENSE' | 'LIABILITY_REPAYMENT' = 'EXPENSE',
  linkedManualAccountId: number | null = null,
  matchDescription: string | null = null
): number {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO upcoming_charges
       (name, amount, frequency, next_charge_date, category_id, is_reserved,
        reminder_days_before, cancel_by_date, created_at,
        charge_type, linked_manual_account_id, match_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      amountCents,
      frequency,
      nextChargeDate,
      categoryId,
      isReserved ? 1 : 0,
      reminderDaysBefore ?? null,
      cancelByDate ?? null,
      now,
      chargeType,
      linkedManualAccountId ?? null,
      matchDescription ?? null,
    ]
  )
  const result = db.exec('SELECT last_insert_rowid()')
  const id = (result[0]?.values?.[0]?.[0] as number) ?? 0
  schedulePersist()
  return id
}

export function updateUpcomingCharge(
  id: number,
  name: string,
  amountCents: number,
  frequency: string,
  nextChargeDate: string,
  categoryId: string | null,
  isReserved: boolean,
  reminderDaysBefore: number | null = null,
  cancelByDate: string | null = null,
  chargeType: 'EXPENSE' | 'LIABILITY_REPAYMENT' = 'EXPENSE',
  linkedManualAccountId: number | null = null,
  matchDescription: string | null = null
): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(
    `UPDATE upcoming_charges SET
       name = ?, amount = ?, frequency = ?, next_charge_date = ?, category_id = ?,
       is_reserved = ?, reminder_days_before = ?, cancel_by_date = ?,
       charge_type = ?, linked_manual_account_id = ?, match_description = ?
     WHERE id = ?`,
    [
      name,
      amountCents,
      frequency,
      nextChargeDate,
      categoryId,
      isReserved ? 1 : 0,
      reminderDaysBefore ?? null,
      cancelByDate ?? null,
      chargeType,
      linkedManualAccountId ?? null,
      matchDescription ?? null,
      id,
    ]
  )
  schedulePersist()
}

/**
 * The `next_charge_date` to store when a Regular is edited (#146).
 *
 * The edit form shows the *projected* next occurrence, not the stored anchor.
 * Writing that back on every save would move the anchor — the stored date must
 * hold whatever the user last entered (docs/adr/0004). So keep `storedDate`
 * unless the user changed the date or the frequency in the form; then the date
 * in the form is the next charge they confirmed, and it becomes the new anchor.
 */
export function nextChargeDateToStoreOnEdit(edit: {
  storedDate: string
  shownDate: string
  shownFrequency: string
  editedDate: string
  editedFrequency: string
}): string {
  const dateChanged =
    edit.editedDate.slice(0, 10) !== edit.shownDate.slice(0, 10)
  const frequencyChanged = edit.editedFrequency !== edit.shownFrequency
  return dateChanged || frequencyChanged ? edit.editedDate : edit.storedDate
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

export function deleteUpcomingCharge(id: number): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM upcoming_charges WHERE id = ?`, [id])
  schedulePersist()
}

/** A single charge by id (raw stored row, no date projection), or null. */
export function regularById(id: number): Regular | null {
  const db = getDb()
  if (!db) return null
  return readRegularsByStoredDate(db).find((c) => c.id === id) ?? null
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
