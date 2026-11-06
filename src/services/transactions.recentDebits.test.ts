/**
 * #210: `searchRecentDebits`, the transaction-picker query behind the Regular
 * form and a bucket's add-Regular modal (moved here from the dropped
 * budgetTransactionAnchors module). Synthetic data only.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic
let db: Database

vi.mock('@/db', () => ({
  getDb: () => db,
  schedulePersist: () => {},
}))

const { searchRecentDebits } = await import('./transactions')

function addTx(
  id: string,
  amount: number,
  description: string,
  createdAt: string,
  opts: { transfer?: string; roundUpParent?: string; rawText?: string } = {}
) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, raw_text, amount,
       created_at, settled_at, transfer_account_id, round_up_parent_id, source)
     VALUES (?, 'acc', 'SETTLED', ?, ?, ?, ?, ?, ?, ?, 'up')`,
    [
      id,
      description,
      opts.rawText ?? null,
      amount,
      createdAt,
      createdAt,
      opts.transfer ?? null,
      opts.roundUpParent ?? null,
    ]
  )
}

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  addTx('old', -1000, 'Synthetic Power', '2026-09-01T10:00:00Z')
  addTx('new', -2500, 'Synthetic Gym', '2026-10-01T10:00:00Z', {
    rawText: 'GYMCO 123',
  })
  addTx('credit', 5000, 'Synthetic Pay', '2026-10-02T10:00:00Z')
  addTx('transfer', -3000, 'To Saver', '2026-10-03T10:00:00Z', {
    transfer: 'saver',
  })
  addTx('roundup', -40, 'Round Up', '2026-10-03T10:00:00Z', {
    roundUpParent: 'new',
  })
})

describe('searchRecentDebits', () => {
  it('lists debits newest first, as positive amounts, leaving out credits, transfers and Round Ups', () => {
    expect(
      searchRecentDebits('').map((r) => [r.id, r.amount, r.description])
    ).toEqual([
      ['new', 2500, 'Synthetic Gym'],
      ['old', 1000, 'Synthetic Power'],
    ])
  })

  it('filters by description or raw text, and honours the limit', () => {
    expect(searchRecentDebits('power').map((r) => r.id)).toEqual(['old'])
    expect(searchRecentDebits('GYMCO').map((r) => r.id)).toEqual(['new'])
    expect(searchRecentDebits('', 1).map((r) => r.id)).toEqual(['new'])
  })
})
