import { describe, it, expect, vi, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  getTransactionUserData,
  setTransactionUserNote,
  setTransactionUserCategoryOverride,
} from './transactionUserData'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
  schedulePersist: vi.fn(),
}))

/**
 * #6 — real-DB coverage for the setters, whose four-way branch
 * (clear-one-keep-sibling / delete-when-both-empty / update / insert) is now
 * shared through the private `upsertUserDataField` helper. These assert both
 * exports still behave identically after the extraction.
 */
describe('transactionUserData setters', () => {
  let SQL: SqlJsStatic
  let realDb: Database

  beforeEach(async () => {
    SQL = await initSqlJs()
    const { runSchema } = await import('@/db/schema')
    realDb = new SQL.Database()
    runSchema(realDb)

    const db = await import('@/db')
    vi.mocked(db.getDb).mockReturnValue(realDb as never)
    vi.mocked(db.schedulePersist).mockImplementation(() => {})
  })

  function rawRow(transactionId: string): {
    user_notes: string | null
    user_category_override: string | null
  } | null {
    const stmt = realDb.prepare(
      `SELECT user_notes, user_category_override FROM transaction_user_data WHERE transaction_id = ?`
    )
    stmt.bind([transactionId])
    if (!stmt.step()) {
      stmt.free()
      return null
    }
    const r = stmt.get() as [string | null, string | null]
    stmt.free()
    return { user_notes: r[0], user_category_override: r[1] }
  }

  // ── setTransactionUserNote ─────────────────────────────────────────────

  it('inserts a row when setting a note on an untouched transaction', () => {
    setTransactionUserNote('tx-1', 'remember this')
    expect(rawRow('tx-1')).toEqual({
      user_notes: 'remember this',
      user_category_override: null,
    })
  })

  it('trims the note and treats whitespace-only as a clear', () => {
    setTransactionUserNote('tx-1', '  padded  ')
    expect(rawRow('tx-1')?.user_notes).toBe('padded')

    setTransactionUserNote('tx-1', '   ')
    expect(rawRow('tx-1')).toBeNull()
  })

  it('updates an existing row when the note changes', () => {
    setTransactionUserNote('tx-1', 'first')
    setTransactionUserNote('tx-1', 'second')
    expect(rawRow('tx-1')).toEqual({
      user_notes: 'second',
      user_category_override: null,
    })
  })

  it('clearing the note keeps the row when a category override is still set', () => {
    setTransactionUserCategoryOverride('tx-1', 'cat-groceries')
    setTransactionUserNote('tx-1', 'temp note')
    setTransactionUserNote('tx-1', null)
    expect(rawRow('tx-1')).toEqual({
      user_notes: null,
      user_category_override: 'cat-groceries',
    })
  })

  it('clearing the note deletes the row when nothing else is set', () => {
    setTransactionUserNote('tx-1', 'temp note')
    setTransactionUserNote('tx-1', null)
    expect(rawRow('tx-1')).toBeNull()
  })

  it('clearing the note on an untouched transaction is a no-op', () => {
    setTransactionUserNote('tx-1', null)
    expect(rawRow('tx-1')).toBeNull()
  })

  // ── setTransactionUserCategoryOverride ────────────────────────────────

  it('inserts a row when setting a category override on an untouched transaction', () => {
    setTransactionUserCategoryOverride('tx-2', 'cat-rent')
    expect(rawRow('tx-2')).toEqual({
      user_notes: null,
      user_category_override: 'cat-rent',
    })
  })

  it('does not trim the category id', () => {
    setTransactionUserCategoryOverride('tx-2', ' cat-with-space ')
    expect(rawRow('tx-2')?.user_category_override).toBe(' cat-with-space ')
  })

  it('updates an existing row when the category override changes', () => {
    setTransactionUserCategoryOverride('tx-2', 'cat-a')
    setTransactionUserCategoryOverride('tx-2', 'cat-b')
    expect(rawRow('tx-2')).toEqual({
      user_notes: null,
      user_category_override: 'cat-b',
    })
  })

  it('clearing the category override keeps the row when a note is still set', () => {
    setTransactionUserNote('tx-2', 'keep me')
    setTransactionUserCategoryOverride('tx-2', 'cat-temp')
    setTransactionUserCategoryOverride('tx-2', '')
    expect(rawRow('tx-2')).toEqual({
      user_notes: 'keep me',
      user_category_override: null,
    })
  })

  it('clearing the category override deletes the row when nothing else is set', () => {
    setTransactionUserCategoryOverride('tx-2', 'cat-temp')
    setTransactionUserCategoryOverride('tx-2', null)
    expect(rawRow('tx-2')).toBeNull()
  })

  it('treats null and empty-string category ids identically as a clear', () => {
    setTransactionUserCategoryOverride('tx-a', 'x')
    setTransactionUserCategoryOverride('tx-a', null)
    setTransactionUserCategoryOverride('tx-b', 'x')
    setTransactionUserCategoryOverride('tx-b', '')
    expect(rawRow('tx-a')).toBeNull()
    expect(rawRow('tx-b')).toBeNull()
  })

  // ── both fields together ─────────────────────────────────────────────

  it('keeps note and category override independent on one row', () => {
    setTransactionUserNote('tx-3', 'a note')
    setTransactionUserCategoryOverride('tx-3', 'cat-x')
    expect(getTransactionUserData('tx-3')).toEqual({
      transaction_id: 'tx-3',
      user_notes: 'a note',
      user_category_override: 'cat-x',
    })

    setTransactionUserNote('tx-3', null)
    setTransactionUserCategoryOverride('tx-3', null)
    expect(rawRow('tx-3')).toBeNull()
  })

  it('throws when the database is not ready', async () => {
    const db = await import('@/db')
    vi.mocked(db.getDb).mockReturnValue(null as never)
    expect(() => setTransactionUserNote('tx-1', 'x')).toThrow(
      'Database not ready'
    )
    expect(() => setTransactionUserCategoryOverride('tx-1', 'x')).toThrow(
      'Database not ready'
    )
  })
})
