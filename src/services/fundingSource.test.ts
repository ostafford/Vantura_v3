import { describe, expect, it, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  findMatchingSettledDebit,
  hasMatchingSettledDebit,
  getFundingSourceAccountId,
} from './fundingSource'

let SQL: SqlJsStatic
let db: Database

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
     VALUES ('transactional-1', 'Everyday', 'TRANSACTIONAL', 500000, '2026-01-01', '2026-01-01'),
            ('essentials-saver-1', 'Bills', 'SAVER', 200000, '2026-01-01', '2026-01-01')`
  )
})

function insertTx(opts: {
  id: string
  account_id: string
  amount: number
  settled_at?: string | null
  created_at?: string
  raw_text?: string | null
  transfer_account_id?: string | null
}) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, raw_text, description, amount, settled_at, created_at, transfer_account_id)
     VALUES (?, ?, 'SETTLED', ?, 'Payment', ?, ?, ?, ?)`,
    [
      opts.id,
      opts.account_id,
      opts.raw_text ?? null,
      opts.amount,
      opts.settled_at ?? null,
      opts.created_at ?? opts.settled_at ?? '2026-03-01T09:00:00.000Z',
      opts.transfer_account_id ?? null,
    ]
  )
}

describe('findMatchingSettledDebit', () => {
  it('returns null when nothing matches', () => {
    expect(findMatchingSettledDebit(db, 'NETFLIX', '2026-01-01')).toBeNull()
    expect(hasMatchingSettledDebit(db, 'NETFLIX', '2026-01-01')).toBe(false)
    expect(getFundingSourceAccountId(db, 'NETFLIX', '2026-01-01')).toBeNull()
  })

  it('matches a settled non-transfer debit and returns its account', () => {
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1500,
      settled_at: '2026-03-05T09:00:00.000Z',
      raw_text: 'NETFLIX',
    })
    const match = findMatchingSettledDebit(db, 'NETFLIX', '2026-03-01')
    expect(match?.accountId).toBe('essentials-saver-1')
    expect(match?.transactionId).toBe('t1')
    expect(hasMatchingSettledDebit(db, 'NETFLIX', '2026-03-01')).toBe(true)
    expect(getFundingSourceAccountId(db, 'NETFLIX', '2026-03-01')).toBe(
      'essentials-saver-1'
    )
  })

  it('excludes transfers even when raw_text matches', () => {
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1500,
      settled_at: '2026-03-05T09:00:00.000Z',
      raw_text: 'NETFLIX',
      transfer_account_id: 'transactional-1',
    })
    expect(findMatchingSettledDebit(db, 'NETFLIX', '2026-03-01')).toBeNull()
  })

  it('excludes credits (positive amounts)', () => {
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: 1500,
      settled_at: '2026-03-05T09:00:00.000Z',
      raw_text: 'NETFLIX',
    })
    expect(findMatchingSettledDebit(db, 'NETFLIX', '2026-03-01')).toBeNull()
  })

  it('excludes settlements before the window start', () => {
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1500,
      settled_at: '2026-02-20T09:00:00.000Z',
      raw_text: 'NETFLIX',
    })
    expect(findMatchingSettledDebit(db, 'NETFLIX', '2026-03-01')).toBeNull()
  })

  it('falls back to created_at when settled_at is null', () => {
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1500,
      settled_at: null,
      created_at: '2026-03-05T09:00:00.000Z',
      raw_text: 'NETFLIX',
    })
    expect(
      findMatchingSettledDebit(db, 'NETFLIX', '2026-03-01')?.accountId
    ).toBe('essentials-saver-1')
  })

  it('picks the most recent match when more than one settled debit matches', () => {
    insertTx({
      id: 't-old',
      account_id: 'transactional-1',
      amount: -1500,
      settled_at: '2026-03-02T09:00:00.000Z',
      raw_text: 'NETFLIX',
    })
    insertTx({
      id: 't-new',
      account_id: 'essentials-saver-1',
      amount: -1500,
      settled_at: '2026-03-10T09:00:00.000Z',
      raw_text: 'NETFLIX',
    })
    const match = findMatchingSettledDebit(db, 'NETFLIX', '2026-03-01')
    expect(match?.transactionId).toBe('t-new')
    expect(match?.accountId).toBe('essentials-saver-1')
  })

  it('scopes matches to the given raw_text fingerprint', () => {
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1500,
      settled_at: '2026-03-05T09:00:00.000Z',
      raw_text: 'SPOTIFY',
    })
    expect(findMatchingSettledDebit(db, 'NETFLIX', '2026-03-01')).toBeNull()
  })
})
