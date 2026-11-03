import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic
let db: Database

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: () => null,
  setAppSetting: () => {},
  schedulePersist: () => {},
}))

const { linkedPaymentsInMonth, deleteRegular } =
  await import('@/services/regulars')

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, ownership_type)
     VALUES ('spending', 'Spending', 'TRANSACTIONAL', 0, '2026-01-01', '2026-01-01', 'INDIVIDUAL'),
            ('saver', 'Bills', 'SAVER', 0, '2026-01-01', '2026-01-01', 'INDIVIDUAL'),
            ('joint', 'Shared', 'TRANSACTIONAL', 0, '2026-01-01', '2026-01-01', 'JOINT')`
  )
  db.run(
    `INSERT INTO categories (id, name, parent_id) VALUES ('utilities', 'Utilities', NULL)`
  )
})

afterEach(() => {
  vi.useRealTimers()
})

function addRegular(
  amount: number,
  matchDescription: string | null,
  frequency = 'MONTHLY',
  date = '2026-03-10'
): number {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, created_at, match_description)
     VALUES ('Regular', ?, ?, ?, '2026-01-01', ?)`,
    [amount, frequency, date, matchDescription]
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

let nextTxnId = 1
function addTxn(t: {
  description: string
  amount: number
  status?: 'HELD' | 'SETTLED'
  createdAt: string
  settledAt?: string | null
  accountId?: string
  categoryId?: string | null
  transferAccountId?: string | null
  transactionType?: string | null
  source?: string
}): string {
  const id = `txn-${nextTxnId++}`
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, created_at, settled_at,
       category_id, transfer_account_id, transaction_type, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      t.accountId ?? 'spending',
      t.status ?? 'SETTLED',
      t.description,
      t.amount,
      t.createdAt,
      t.settledAt === undefined ? t.createdAt : t.settledAt,
      t.categoryId ?? null,
      t.transferAccountId ?? null,
      t.transactionType ?? null,
      t.source ?? 'up',
    ]
  )
  return id
}

function forRegular(month: string, id: number) {
  return linkedPaymentsInMonth(month).find((r) => r.regularId === id)
}

function paymentIds(month: string, id: number): string[] {
  const entry = forRegular(month, id)
  if (!entry || !entry.linked) throw new Error('expected a linked Regular')
  return entry.payments.map((p) => p.transactionId)
}

describe('linkedPaymentsInMonth', () => {
  it('links a HELD debit matching the description and amount', () => {
    const power = addRegular(10000, 'POWERCO')
    const held = addTxn({
      description: 'POWERCO',
      amount: -10000,
      status: 'HELD',
      createdAt: '2026-03-10T09:00:00+11:00',
      settledAt: null,
    })

    expect(forRegular('2026-03', power)).toEqual({
      regularId: power,
      linked: true,
      payments: [
        {
          transactionId: held,
          accountId: 'spending',
          amount: -10000,
          displayDate: '2026-03-10',
          status: 'HELD',
        },
      ],
    })
  })

  it('dates a payment by its Display date, not when it settled', () => {
    const power = addRegular(10000, 'POWERCO')
    const lateSettled = addTxn({
      description: 'POWERCO',
      amount: -10000,
      createdAt: '2026-01-31T22:00:00+11:00',
      settledAt: '2026-02-02T09:00:00+11:00',
    })

    expect(paymentIds('2026-01', power)).toEqual([lateSettled])
    expect(paymentIds('2026-02', power)).toEqual([])
  })

  it('uses the local day of the Display date at a month boundary', () => {
    const power = addRegular(10000, 'POWERCO')
    // 00:30 local on 1 April is still 31 March in UTC.
    const firstOfApril = addTxn({
      description: 'POWERCO',
      amount: -10000,
      createdAt: '2026-04-01T00:30:00+11:00',
    })

    expect(paymentIds('2026-03', power)).toEqual([])
    expect(paymentIds('2026-04', power)).toEqual([firstOfApril])
  })

  it("links a payment in two Regulars' bands to neither", () => {
    const policyA = addRegular(10000, 'INSURECO')
    const policyB = addRegular(11000, 'INSURECO')
    addTxn({
      description: 'INSURECO',
      amount: -10500,
      createdAt: '2026-03-05T09:00:00+11:00',
    })
    const onlyB = addTxn({
      description: 'INSURECO',
      amount: -13000,
      createdAt: '2026-03-06T09:00:00+11:00',
    })

    expect(paymentIds('2026-03', policyA)).toEqual([])
    expect(paymentIds('2026-03', policyB)).toEqual([onlyB])
  })

  it('treats the ±20% band as inclusive at both ends', () => {
    const power = addRegular(10000, 'POWERCO')
    const low = addTxn({
      description: 'POWERCO',
      amount: -8000,
      createdAt: '2026-03-02T09:00:00+11:00',
    })
    const high = addTxn({
      description: 'POWERCO',
      amount: -12000,
      createdAt: '2026-03-03T09:00:00+11:00',
    })
    addTxn({
      description: 'POWERCO',
      amount: -7999,
      createdAt: '2026-03-04T09:00:00+11:00',
    })
    addTxn({
      description: 'POWERCO',
      amount: -12001,
      createdAt: '2026-03-05T09:00:00+11:00',
    })

    expect(paymentIds('2026-03', power)).toEqual([low, high])
  })

  it('never links a refund, even with a matching description', () => {
    const power = addRegular(10000, 'POWERCO')
    addTxn({
      description: 'POWERCO',
      amount: 10000,
      categoryId: 'utilities',
      createdAt: '2026-03-10T09:00:00+11:00',
    })

    expect(paymentIds('2026-03', power)).toEqual([])
  })

  it('lists both payments when a Regular is paid twice in the month', () => {
    const streaming = addRegular(1500, 'STREAMCO')
    const first = addTxn({
      description: 'STREAMCO',
      amount: -1500,
      createdAt: '2026-03-01T09:00:00+11:00',
    })
    const second = addTxn({
      description: 'STREAMCO',
      amount: -1500,
      status: 'HELD',
      createdAt: '2026-03-20T09:00:00+11:00',
      settledAt: null,
    })

    expect(paymentIds('2026-03', streaming)).toEqual([first, second])
  })

  it('requires an exact, case-sensitive description', () => {
    const power = addRegular(10000, 'POWERCO')
    addTxn({
      description: 'Powerco',
      amount: -10000,
      createdAt: '2026-03-10T09:00:00+11:00',
    })

    expect(paymentIds('2026-03', power)).toEqual([])
  })

  it('only links Actual spending debits', () => {
    const power = addRegular(10000, 'POWERCO')
    const fromSaver = addTxn({
      description: 'POWERCO',
      amount: -10000,
      accountId: 'saver',
      createdAt: '2026-03-01T09:00:00+11:00',
    })
    addTxn({
      description: 'POWERCO',
      amount: -10000,
      accountId: 'joint',
      createdAt: '2026-03-02T09:00:00+11:00',
    })
    addTxn({
      description: 'POWERCO',
      amount: -10000,
      transferAccountId: 'saver',
      createdAt: '2026-03-03T09:00:00+11:00',
    })
    addTxn({
      description: 'POWERCO',
      amount: -10000,
      transactionType: 'Round Up',
      createdAt: '2026-03-04T09:00:00+11:00',
    })
    addTxn({
      description: 'POWERCO',
      amount: -10000,
      source: 'manual',
      createdAt: '2026-03-05T09:00:00+11:00',
    })

    expect(paymentIds('2026-03', power)).toEqual([fromSaver])
  })

  it('reports a Regular with no match_description as unlinked, not as zero payments', () => {
    const handTyped = addRegular(10000, null)
    const linkedUnpaid = addRegular(10000, 'POWERCO')

    expect(forRegular('2026-03', handTyped)).toEqual({
      regularId: handTyped,
      linked: false,
    })
    expect(forRegular('2026-03', linkedUnpaid)).toEqual({
      regularId: linkedUnpaid,
      linked: true,
      payments: [],
    })
  })

  it('reflects edits on every call, and a deleted Regular has none', () => {
    const power = addRegular(10000, 'POWERCO')
    addTxn({
      description: 'POWERCO',
      amount: -10000,
      createdAt: '2026-03-10T09:00:00+11:00',
    })
    expect(paymentIds('2026-03', power)).toHaveLength(1)

    deleteRegular(power)

    expect(forRegular('2026-03', power)).toBeUndefined()
  })
})
