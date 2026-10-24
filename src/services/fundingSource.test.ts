import { describe, expect, it, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  findLinkedPayment,
  hasLinkedPayment,
  getFundingSourceAccountId,
  getEssentialsLinkHint,
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
  status?: 'HELD' | 'SETTLED'
  description?: string
  source?: string
}) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, raw_text, description, amount, settled_at, created_at, transfer_account_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.id,
      opts.account_id,
      opts.status ?? 'SETTLED',
      opts.raw_text ?? null,
      opts.description ?? 'Payment',
      opts.amount,
      opts.settled_at ?? null,
      opts.created_at ?? opts.settled_at ?? '2026-03-01T09:00:00.000Z',
      opts.transfer_account_id ?? null,
      opts.source ?? 'up',
    ]
  )
}

/** Inserts a Regular linked to `description`; returns it in the shape the matcher takes. */
function insertRegular(description: string | null, amount: number) {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at, match_description)
     VALUES ('Regular', ?, 'MONTHLY', '2026-03-10', '2026-01-01', ?)`,
    [amount, description]
  )
  const id = Number(db.exec(`SELECT last_insert_rowid()`)[0].values[0][0])
  return { id, amount, match_description: description }
}

describe('findLinkedPayment (docs/adr/0020)', () => {
  it('links a settled debit with the same description and an amount within ±20%', () => {
    const regular = insertRegular('Spotify', 1300)
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1299,
      settled_at: '2026-03-05T09:00:00.000Z',
      raw_text: 'SPOTIFY*P475789B2A, 0012345678',
      description: 'Spotify',
    })
    expect(findLinkedPayment(db, regular)).toEqual({
      transactionId: 't1',
      accountId: 'essentials-saver-1',
      settledDate: '2026-03-05',
    })
  })

  it('ignores a HELD debit', () => {
    const regular = insertRegular('Spotify', 1300)
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1299,
      settled_at: null,
      created_at: '2026-03-05T09:00:00.000Z',
      description: 'Spotify',
      status: 'HELD',
    })
    expect(findLinkedPayment(db, regular)).toBeNull()
  })

  it('ignores a transfer even with the same description and amount', () => {
    const regular = insertRegular('Spotify', 1300)
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1299,
      settled_at: '2026-03-05T09:00:00.000Z',
      description: 'Spotify',
      transfer_account_id: 'transactional-1',
    })
    expect(findLinkedPayment(db, regular)).toBeNull()
  })

  it('ignores a debit that did not come from Up', () => {
    const regular = insertRegular('Spotify', 1300)
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1299,
      settled_at: '2026-03-05T09:00:00.000Z',
      description: 'Spotify',
      source: 'manual',
    })
    expect(findLinkedPayment(db, regular)).toBeNull()
  })

  it('links a payment to neither Regular when it falls inside both bands', () => {
    // Two Apple subscriptions billed under one description: $4.99 is within
    // ±20% of both $4.49 and $5.99, so it can't be told apart.
    const icloud = insertRegular('Apple', 449)
    const music = insertRegular('Apple', 599)
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -499,
      settled_at: '2026-03-05T09:00:00.000Z',
      description: 'Apple',
    })
    expect(findLinkedPayment(db, icloud)).toBeNull()
    expect(findLinkedPayment(db, music)).toBeNull()
  })

  it('only considers payments on or after the window start, when one is given', () => {
    const regular = insertRegular('Spotify', 1300)
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1299,
      settled_at: '2026-02-27T09:00:00.000Z',
      description: 'Spotify',
    })
    expect(findLinkedPayment(db, regular, '2026-03-01')).toBeNull()
    expect(findLinkedPayment(db, regular, '2026-02-27')?.transactionId).toBe(
      't1'
    )
  })

  it('treats exactly ±20% as inside the band and anything beyond as outside', () => {
    const regular = insertRegular('Gym', 1000)
    for (const [id, amount] of [
      ['at-low', -800],
      ['at-high', -1200],
      ['below', -799],
      ['above', -1201],
    ] as const) {
      db.run(`DELETE FROM transactions`)
      insertTx({
        id,
        account_id: 'essentials-saver-1',
        amount,
        settled_at: '2026-03-05T09:00:00.000Z',
        description: 'Gym',
      })
      const linked = findLinkedPayment(db, regular) !== null
      expect({ id, linked }).toEqual({
        id,
        linked: id === 'at-low' || id === 'at-high',
      })
    }
  })

  it('compares the description exactly, including case', () => {
    const regular = insertRegular('Spotify', 1300)
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1299,
      settled_at: '2026-03-05T09:00:00.000Z',
      description: 'spotify',
    })
    expect(findLinkedPayment(db, regular)).toBeNull()
  })

  it('keeps linking after the descriptor changes, taking the most recent payment', () => {
    // Repointed from PayPal on the transactional account to the Essentials
    // card: raw_text changes completely, Up's description doesn't (#84).
    const regular = insertRegular('Oura', 1000)
    insertTx({
      id: 'before',
      account_id: 'transactional-1',
      amount: -999,
      settled_at: '2026-02-23T09:00:00.000Z',
      raw_text: 'PAYPAL *OURARING2, 4029357733',
      description: 'Oura',
    })
    insertTx({
      id: 'after',
      account_id: 'essentials-saver-1',
      amount: -999,
      settled_at: '2026-03-23T09:00:00.000Z',
      raw_text: 'OURARING, OULU',
      description: 'Oura',
    })
    expect(findLinkedPayment(db, regular)?.transactionId).toBe('after')
    expect(findLinkedPayment(db, regular)?.accountId).toBe('essentials-saver-1')
  })

  it('never links a credit, even with the same description and amount', () => {
    const regular = insertRegular('Spotify', 1300)
    insertTx({
      id: 'refund',
      account_id: 'essentials-saver-1',
      amount: 1299,
      settled_at: '2026-03-05T09:00:00.000Z',
      description: 'Spotify',
    })
    expect(findLinkedPayment(db, regular)).toBeNull()
    expect(hasLinkedPayment(db, regular)).toBe(false)
  })

  it('dates a settled payment with no settled_at by its created_at', () => {
    const regular = insertRegular('Spotify', 1300)
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1299,
      settled_at: null,
      created_at: '2026-03-05T09:00:00.000Z',
      description: 'Spotify',
    })
    expect(findLinkedPayment(db, regular, '2026-03-05')?.settledDate).toBe(
      '2026-03-05'
    )
    expect(getFundingSourceAccountId(db, regular)).toBe('essentials-saver-1')
  })

  it('has no linked payment, and so no funding source, when the Regular has no link', () => {
    const regular = insertRegular(null, 1300)
    insertTx({
      id: 't1',
      account_id: 'essentials-saver-1',
      amount: -1299,
      settled_at: '2026-03-05T09:00:00.000Z',
      description: 'Spotify',
    })
    expect(hasLinkedPayment(db, regular)).toBe(false)
    expect(getFundingSourceAccountId(db, regular)).toBeNull()
  })
})

describe('getEssentialsLinkHint (#97, decision 5)', () => {
  const TODAY = '2026-03-01'
  function hintFor(
    description: string | null,
    amount: number,
    extra: Partial<{
      is_reserved: number
      frequency: string
      next_charge_date: string
      cancel_by_date: string | null
    }> = {}
  ) {
    const regular = insertRegular(description, amount)
    return getEssentialsLinkHint(
      db,
      {
        ...regular,
        is_reserved: 1,
        frequency: 'MONTHLY',
        next_charge_date: '2026-03-10',
        cancel_by_date: null,
        ...extra,
      },
      TODAY
    )
  }

  it('asks to link a payment when the Regular has no link', () => {
    expect(hintFor(null, 1500)).toBe('unlinked')
  })

  it('says no matching payment yet when linked but nothing matches', () => {
    expect(hintFor('Gym', 6000)).toBe('no_payment')
  })

  it('says no matching payment when the only payment is outside the ±20% band', () => {
    insertTx({
      id: 't-band',
      account_id: 'transactional-1',
      amount: -9000,
      description: 'Gym',
      settled_at: '2026-02-10T09:00:00.000Z',
    })
    expect(hintFor('Gym', 6000)).toBe('no_payment')
  })

  it('says no matching payment when the payment also matches another Regular', () => {
    insertRegular('Apple', 999)
    insertTx({
      id: 't-ambiguous',
      account_id: 'essentials-saver-1',
      amount: -999,
      description: 'Apple',
      settled_at: '2026-02-10T09:00:00.000Z',
    })
    expect(hintFor('Apple', 999)).toBe('no_payment')
  })

  it('shows nothing once a payment is linked, whichever account paid it', () => {
    insertTx({
      id: 't-everyday',
      account_id: 'transactional-1',
      amount: -1500,
      description: 'Netflix',
      settled_at: '2026-02-10T09:00:00.000Z',
    })
    expect(hintFor('Netflix', 1500)).toBeNull()
  })

  it('shows nothing for a Regular excluded from Spendable', () => {
    expect(hintFor(null, 1500, { is_reserved: 0 })).toBeNull()
  })

  it('shows nothing for a Regular that will never fall due again', () => {
    expect(
      hintFor(null, 1500, { frequency: 'ONCE', next_charge_date: '2026-02-01' })
    ).toBeNull()
    expect(hintFor(null, 1500, { cancel_by_date: '2026-02-15' })).toBeNull()
  })
})
