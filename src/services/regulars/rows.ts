/**
 * The one reader of `upcoming_charges` rows inside the Regulars module
 * (docs/adr/0021). Every query in the module starts here; nothing outside the
 * module should SELECT Regulars itself.
 *
 * Rows come back exactly as stored — `next_charge_date` is the anchor the user
 * entered, never projected (docs/adr/0004). Projection is the caller's job,
 * inside this module.
 */

import type { Database } from 'sql.js'

/** A Regular as stored. GLOSSARY: **Regular**. Table: `upcoming_charges`. */
export interface Regular {
  id: number
  name: string
  amount: number
  frequency: string
  /** The stored anchor date — never advanced (docs/adr/0004). */
  next_charge_date: string
  category_id: string | null
  is_reserved: number
  /** Remind me this many days before next charge (null = no reminder). */
  reminder_days_before: number | null
  /** Optional date by which to cancel (for subscriptions). */
  cancel_by_date: string | null
  /** Up `description` of the Regular's linked payments (docs/adr/0020). */
  match_description: string | null
  /**
   * Budget Plan bucket (`null` = not in a bucket). Membership only — it never
   * decides where money counts.
   */
  bucket_id: number | null
}

type RegularTuple = [
  number,
  string,
  number,
  string,
  string,
  string | null,
  number,
  number | null,
  string | null,
  string | null,
  number | null,
]

/** Every Regular, in id order. */
export function readRegulars(db: Database): Regular[] {
  const stmt = db.prepare(
    `SELECT id, name, amount, frequency, next_charge_date, category_id, is_reserved,
      reminder_days_before, cancel_by_date, match_description, bucket_id
     FROM upcoming_charges ORDER BY id`
  )
  const rows: Regular[] = []
  while (stmt.step()) {
    const r = stmt.get() as RegularTuple
    rows.push({
      id: r[0],
      name: r[1],
      amount: r[2],
      frequency: r[3],
      next_charge_date: r[4],
      category_id: r[5] ?? null,
      is_reserved: r[6],
      reminder_days_before: r[7] ?? null,
      cancel_by_date: r[8] ?? null,
      match_description: r[9] ?? null,
      bucket_id: r[10] ?? null,
    })
  }
  stmt.free()
  return rows
}

/** One Regular as stored, or null. */
export function readRegularById(db: Database, id: number): Regular | null {
  return readRegulars(db).find((r) => r.id === id) ?? null
}

/**
 * Stored-date order, ties broken by id: the order the list views have always
 * shown Regulars in.
 */
export function byStoredDate(a: Regular, b: Regular): number {
  return a.next_charge_date.localeCompare(b.next_charge_date) || a.id - b.id
}
