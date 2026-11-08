/**
 * The one write path for a Regular (docs/adr/0021, #160): build a draft
 * (`blankDraft` / `draftFromRegular` / `draftFromTransaction` /
 * `draftFromSuggestion`), check it with `validateRegularDraft`, store it with
 * `saveRegular`. Every editor goes through here, so the stored-date rule
 * (#146, #153), the payment link (#147) and the bucket are applied the same
 * way however a Regular is created or edited.
 *
 * A draft holds form-shaped values (the amount as typed, `''` for an empty
 * optional field); `saveRegular` normalises them into the stored row.
 */

import type { Database } from 'sql.js'
import { getDb, schedulePersist } from '@/db'
import { parseAmountInput } from '@/lib/amountInput'
import { localDateString } from '@/lib/format'
import { nextChargeDateFromAnchor } from './projection'
import { readRegularById, type Regular } from './rows'

export interface RegularDraft {
  /** The Regular being edited; null for a new one. */
  id: number | null
  name: string
  /** Dollars, as typed (e.g. `'12.50'`). */
  amount: string
  frequency: string
  /** The next charge date in the form: shown, or as the user edited it. */
  nextChargeDate: string
  /** `''` = no category. */
  categoryId: string
  /** Days, as typed; `''` = no reminder. */
  reminderDaysBefore: string
  /** `''` = no cancel-by date. */
  cancelByDate: string
  /** Up `description` of the linked payments (docs/adr/0020); `''` = none. */
  matchDescription: string
  /** Budget Plan bucket, written in the same write as the Regular. */
  bucketId: number | null
  /**
   * Create only: the date of the payment the Regular was made from (#153).
   * Null when typed by hand. While set, changing the frequency re-derives the
   * shown date from it.
   */
  anchorDate: string | null
  /**
   * Edit only: the date and frequency the form opened with. The stored date
   * is kept unless the user changes either (#146).
   */
  shown: { nextChargeDate: string; frequency: string } | null
}

/** A past debit picked as the source of a new Regular. */
export interface DraftSourceTransaction {
  description: string
  /** Cents; the sign is ignored. */
  amount: number
  date: string
  category_id: string | null
}

/** A detected recurring charge (`src/services/recurringChargeDetection.ts`). */
export interface DraftSourceSuggestion {
  name: string
  amountCents: number
  frequency: string
  nextChargeDate: string
  anchorDate: string
  categoryId: string | null
  matchDescription: string
}

/** A new, empty Regular: monthly, due today. */
export function blankDraft(today: string = localDateString()): RegularDraft {
  return {
    id: null,
    name: '',
    amount: '',
    frequency: 'MONTHLY',
    nextChargeDate: today,
    categoryId: '',
    reminderDaysBefore: '',
    cancelByDate: '',
    matchDescription: '',
    bucketId: null,
    anchorDate: null,
    shown: null,
  }
}

/**
 * An existing Regular, for editing. `stored` is the row as stored
 * (`regularById`); `shown` is the row as the list showed it, whose date is
 * the projected next occurrence. The form opens on the shown date. The
 * Regular's bucket is read here, since rows don't carry it.
 */
export function draftFromRegular(
  stored: Regular,
  shown: Pick<Regular, 'next_charge_date' | 'frequency'>
): RegularDraft {
  return {
    id: stored.id,
    name: stored.name,
    amount: String(stored.amount / 100),
    frequency: stored.frequency,
    nextChargeDate: shown.next_charge_date,
    categoryId: stored.category_id ?? '',
    reminderDaysBefore:
      stored.reminder_days_before != null
        ? String(stored.reminder_days_before)
        : '',
    cancelByDate: stored.cancel_by_date ?? '',
    matchDescription: stored.match_description ?? '',
    bucketId: storedBucketId(stored.id),
    anchorDate: null,
    shown: {
      nextChargeDate: shown.next_charge_date,
      frequency: shown.frequency,
    },
  }
}

/**
 * A new Regular from a picked past debit — the one rule every "pick a
 * transaction" path uses, so the Dashboard and Budget Plan can't create
 * different Regulars from the same payment (#147). The description becomes
 * both the name and the payment link; the shown date is the payment's next
 * occurrence on or after `today` for `frequency` (#163), and its own date is
 * kept as the anchor to store (#153).
 */
export function draftFromTransaction(
  tx: DraftSourceTransaction,
  frequency: string,
  today: string = localDateString()
): RegularDraft {
  return {
    ...blankDraft(today),
    name: tx.description,
    amount: (Math.abs(tx.amount) / 100).toFixed(2),
    frequency,
    nextChargeDate: nextChargeDateFromAnchor(tx.date, frequency, today),
    categoryId: tx.category_id ?? '',
    matchDescription: tx.description,
    anchorDate: tx.date.slice(0, 10),
  }
}

/** A new Regular from a detected recurring charge (#20). */
export function draftFromSuggestion(s: DraftSourceSuggestion): RegularDraft {
  return {
    ...blankDraft(),
    name: s.name,
    amount: (s.amountCents / 100).toFixed(2),
    frequency: s.frequency,
    nextChargeDate: s.nextChargeDate,
    categoryId: s.categoryId ?? '',
    matchDescription: s.matchDescription,
    anchorDate: s.anchorDate,
  }
}

export type RegularDraftField =
  | 'name'
  | 'amount'
  | 'nextChargeDate'
  | 'cancelByDate'

export type RegularDraftErrors = Partial<Record<RegularDraftField, string>>

/**
 * Per-field errors; empty when the draft can be saved. The rules are the
 * Dashboard editor's, unchanged (#160):
 * 1. the trimmed name isn't empty;
 * 2. the amount rounds to more than 0 cents;
 * 3. there is a next charge date;
 * 4. a cancel-by date, if set, isn't before the next charge date in the form.
 */
export function validateRegularDraft(draft: RegularDraft): RegularDraftErrors {
  const errors: RegularDraftErrors = {}
  if (!draft.name.trim()) errors.name = 'Enter a name.'
  const cents = amountCents(draft)
  if (cents == null || cents <= 0) errors.amount = 'Enter an amount above $0.'
  if (!draft.nextChargeDate) errors.nextChargeDate = 'Enter a next charge date.'
  const cancelBy = cancelByDate(draft)
  if (cancelBy && cancelBy < draft.nextChargeDate.slice(0, 10)) {
    errors.cancelByDate =
      'Cancel by date is before the next charge date — this charge would never appear.'
  }
  return errors
}

/**
 * Stores the draft, with its bucket, in one write, and returns the Regular's
 * id. Throws on an invalid draft, so validate first to show the errors.
 */
export function saveRegular(draft: RegularDraft): number {
  const errors = validateRegularDraft(draft)
  if (Object.keys(errors).length > 0) {
    throw new Error(
      `Refusing to save an invalid Regular: ${Object.values(errors).join(' ')}`
    )
  }
  const db = getDb()
  if (!db) throw new Error('Database not ready')

  const reminder =
    draft.reminderDaysBefore.trim() === ''
      ? null
      : parseInt(draft.reminderDaysBefore, 10)
  const fields = [
    draft.name.trim(),
    // Validated above: the save refuses to run unless this is a positive amount.
    amountCents(draft) as number,
    draft.frequency,
    nextChargeDateToStore(db, draft),
    draft.categoryId || null,
    reminder != null && !Number.isNaN(reminder) ? reminder : null,
    cancelByDate(draft),
    draft.matchDescription || null,
    draft.bucketId,
  ]

  let id: number
  if (draft.id != null) {
    id = draft.id
    db.run(
      `UPDATE upcoming_charges SET
         name = ?, amount = ?, frequency = ?, next_charge_date = ?, category_id = ?,
         reminder_days_before = ?, cancel_by_date = ?,
         match_description = ?, bucket_id = ?
       WHERE id = ?`,
      [...fields, id]
    )
  } else {
    db.run(
      `INSERT INTO upcoming_charges
         (name, amount, frequency, next_charge_date, category_id,
          reminder_days_before, cancel_by_date, match_description, bucket_id,
          created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...fields, new Date().toISOString()]
    )
    id = Number(db.exec('SELECT last_insert_rowid()')[0]?.values?.[0]?.[0])
  }
  schedulePersist()
  return id
}

export function deleteRegular(id: number): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(`DELETE FROM regular_paid_marks WHERE regular_id = ?`, [id])
  db.run(`DELETE FROM upcoming_charges WHERE id = ?`, [id])
  schedulePersist()
}

/** The draft's amount in cents, or null when blank or not a plain amount. */
function amountCents(draft: RegularDraft): number | null {
  const parsed = parseAmountInput(draft.amount)
  return parsed.ok ? parsed.cents : null
}

function cancelByDate(draft: RegularDraft): string | null {
  return draft.cancelByDate.trim() ? draft.cancelByDate.slice(0, 10) : null
}

function storedBucketId(id: number): number | null {
  const db = getDb()
  if (!db) return null
  const value = db.exec(`SELECT bucket_id FROM upcoming_charges WHERE id = ?`, [
    id,
  ])[0]?.values?.[0]?.[0]
  return value != null ? Number(value) : null
}

/** The `next_charge_date` to store for this draft: the edit or create rule. */
function nextChargeDateToStore(db: Database, draft: RegularDraft): string {
  if (draft.id != null && draft.shown) {
    const stored = readRegularById(db, draft.id)
    return nextChargeDateToStoreOnEdit({
      storedDate: stored?.next_charge_date ?? draft.nextChargeDate,
      shownDate: draft.shown.nextChargeDate,
      shownFrequency: draft.shown.frequency,
      editedDate: draft.nextChargeDate,
      editedFrequency: draft.frequency,
    })
  }
  return nextChargeDateToStoreOnCreate({
    anchorDate: draft.anchorDate,
    frequency: draft.frequency,
    shownDate: draft.nextChargeDate,
  })
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
 * The `next_charge_date` to store when creating a Regular from a past payment
 * (#153). The form shows the next occurrence on or after today; storing that would
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
