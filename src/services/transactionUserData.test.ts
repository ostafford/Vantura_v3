import { describe, it, expect, vi, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  getTransactionUserData,
  setTransactionUserNote,
} from './transactionUserData'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
  schedulePersist: vi.fn(),
}))

/**
 * Real-DB coverage for `setTransactionUserNote`, the only user-owned field on
 * `transaction_user_data` after #27 dropped `user_category_override`. The row is
 * a pure overlay: it exists only while it carries a note.
 */
describe('setTransactionUserNote', () => {
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

  function rawNote(transactionId: string): string | null | undefined {
    const stmt = realDb.prepare(
      `SELECT user_notes FROM transaction_user_data WHERE transaction_id = ?`
    )
    stmt.bind([transactionId])
    if (!stmt.step()) {
      stmt.free()
      return undefined // no row
    }
    const r = stmt.get() as [string | null]
    stmt.free()
    return r[0]
  }

  it('inserts a row when setting a note on an untouched transaction', () => {
    setTransactionUserNote('tx-1', 'remember this')
    expect(getTransactionUserData('tx-1')).toEqual({
      transaction_id: 'tx-1',
      user_notes: 'remember this',
    })
  })

  it('trims the note and treats whitespace-only as a clear', () => {
    setTransactionUserNote('tx-1', '  padded  ')
    expect(rawNote('tx-1')).toBe('padded')

    setTransactionUserNote('tx-1', '   ')
    expect(rawNote('tx-1')).toBeUndefined()
  })

  it('updates an existing row when the note changes', () => {
    setTransactionUserNote('tx-1', 'first')
    setTransactionUserNote('tx-1', 'second')
    expect(rawNote('tx-1')).toBe('second')
  })

  it('clearing the note deletes the row', () => {
    setTransactionUserNote('tx-1', 'temp note')
    setTransactionUserNote('tx-1', null)
    expect(rawNote('tx-1')).toBeUndefined()
  })

  it('clearing the note on an untouched transaction is a no-op', () => {
    setTransactionUserNote('tx-1', null)
    expect(rawNote('tx-1')).toBeUndefined()
  })

  it('throws when the database is not ready', async () => {
    const db = await import('@/db')
    vi.mocked(db.getDb).mockReturnValue(null as never)
    expect(() => setTransactionUserNote('tx-1', 'x')).toThrow(
      'Database not ready'
    )
  })
})
