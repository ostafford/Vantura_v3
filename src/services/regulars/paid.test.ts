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

const {
  regularOccurrencesPaidInMonth,
  markOccurrencePaid,
  unmarkOccurrencePaid,
  deleteRegular,
  regularById,
} = await import('@/services/regulars')

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
     VALUES ('spending', 'Spending', 'TRANSACTIONAL', 0, '2026-01-01', '2026-01-01', 'INDIVIDUAL')`
  )
})

afterEach(() => {
  vi.useRealTimers()
})

/** Synthetic Regular; returns its id. */
function addRegular(r: {
  frequency: string
  date: string
  amount?: number
  description?: string | null
  cancelBy?: string | null
}): number {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, cancel_by_date, created_at, match_description)
     VALUES ('Synthetic bill', ?, ?, ?, ?, '2026-01-01', ?)`,
    [
      r.amount ?? 5000,
      r.frequency,
      r.date,
      r.cancelBy ?? null,
      r.description === undefined ? 'SYNTHETIC CO' : r.description,
    ]
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

let nextTxnId = 1
/** A debit dated `day` (local midday, so the Display date is `day` in any test TZ). */
function pay(
  day: string,
  opts: {
    amount?: number
    status?: 'HELD' | 'SETTLED'
    description?: string
  } = {}
): string {
  const id = `txn-${nextTxnId++}`
  const at = `${day}T12:00:00+11:00`
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, created_at, settled_at, source)
     VALUES (?, 'spending', ?, ?, ?, ?, ?, 'up')`,
    [
      id,
      opts.status ?? 'SETTLED',
      opts.description ?? 'SYNTHETIC CO',
      -(opts.amount ?? 5000),
      at,
      opts.status === 'HELD' ? null : at,
    ]
  )
  return id
}

/** `date → paid` for one Regular's occurrences in `month`. */
function paidIn(month: string, regularId: number): Record<string, boolean> {
  return Object.fromEntries(
    regularOccurrencesPaidInMonth(month)
      .filter((o) => o.regular.id === regularId)
      .map((o) => [o.date, o.paid])
  )
}

function occurrence(month: string, regularId: number, date: string) {
  const o = regularOccurrencesPaidInMonth(month).find(
    (x) => x.regular.id === regularId && x.date === date
  )
  if (!o) throw new Error(`no occurrence ${regularId} on ${date}`)
  return o
}

describe('regularOccurrencesPaidInMonth: the paid rule (#214)', () => {
  it('a payment late into next month pays this month’s occurrence, not next month’s', () => {
    // Mar 28 → Apr 28 is 31 days, so Mar 28's window runs to Apr 12.
    const id = addRegular({ frequency: 'MONTHLY', date: '2026-01-28' })
    const txn = pay('2026-04-03')

    expect(paidIn('2026-03', id)).toEqual({ '2026-03-28': true })
    expect(
      occurrence('2026-03', id, '2026-03-28').payments.map(
        (p) => p.transactionId
      )
    ).toEqual([txn])
    expect(paidIn('2026-04', id)).toEqual({ '2026-04-28': false })
  })

  it('an early payment pays the coming occurrence, not the one before', () => {
    const id = addRegular({ frequency: 'MONTHLY', date: '2026-01-28' })
    pay('2026-03-26')

    expect(paidIn('2026-03', id)).toEqual({ '2026-03-28': true })
    expect(paidIn('2026-02', id)).toEqual({ '2026-02-28': false })
  })

  it('a payment at the exact midpoint pays the earlier occurrence', () => {
    // Fortnightly Mar 2, 16, 30: Mar 9 is exactly halfway between 2 and 16.
    const id = addRegular({ frequency: 'FORTNIGHTLY', date: '2026-03-02' })
    pay('2026-03-09')

    expect(paidIn('2026-03', id)).toEqual({
      '2026-03-02': true,
      '2026-03-16': false,
      '2026-03-30': false,
    })
  })

  it('a second payment in the same window leaves that occurrence paid and pays no other', () => {
    const id = addRegular({ frequency: 'MONTHLY', date: '2026-01-10' })
    const a = pay('2026-03-09')
    const b = pay('2026-03-12')

    expect(paidIn('2026-03', id)).toEqual({ '2026-03-10': true })
    expect(
      occurrence('2026-03', id, '2026-03-10').payments.map(
        (p) => p.transactionId
      )
    ).toEqual([a, b])
    expect(paidIn('2026-02', id)).toEqual({ '2026-02-10': false })
    expect(paidIn('2026-04', id)).toEqual({ '2026-04-10': false })
  })

  it('weekly: several occurrences in a month, each paid by its nearest payment', () => {
    // Mar 2, 9, 16, 23, 30. Mar 20 is 4 days after 16 and 3 before 23.
    const id = addRegular({ frequency: 'WEEKLY', date: '2026-03-02' })
    pay('2026-03-03')
    pay('2026-03-17')
    pay('2026-03-20')

    expect(paidIn('2026-03', id)).toEqual({
      '2026-03-02': true,
      '2026-03-09': false,
      '2026-03-16': true,
      '2026-03-23': true,
      '2026-03-30': false,
    })
  })

  it('fortnightly: several occurrences in a month, a late payment pays the earlier one', () => {
    const id = addRegular({ frequency: 'FORTNIGHTLY', date: '2026-02-16' })
    // Mar 2, 16, 30. Mar 21 is 5 days after 16; Mar 29 is 1 day before 30.
    pay('2026-03-21')
    pay('2026-03-29')

    expect(paidIn('2026-03', id)).toEqual({
      '2026-03-02': false,
      '2026-03-16': true,
      '2026-03-30': true,
    })
  })

  describe('before the first occurrence', () => {
    it('inside its window (half the gap to the second occurrence) pays it', () => {
      // Mar 10 → Apr 10 is 31 days: the window reaches back 15.5 days.
      const id = addRegular({ frequency: 'MONTHLY', date: '2026-03-10' })
      pay('2026-02-23') // 15 days before
      expect(paidIn('2026-03', id)).toEqual({ '2026-03-10': true })
    })

    it('outside its window pays nothing', () => {
      const id = addRegular({ frequency: 'MONTHLY', date: '2026-03-10' })
      pay('2026-02-22') // 16 days before
      expect(paidIn('2026-03', id)).toEqual({ '2026-03-10': false })
    })

    it('exactly on the boundary pays nothing; a day later pays it', () => {
      // Fortnightly from Mar 16: the boundary is exactly 7 days back, Mar 9.
      const id = addRegular({ frequency: 'FORTNIGHTLY', date: '2026-03-16' })
      pay('2026-03-09')
      expect(paidIn('2026-03', id)['2026-03-16']).toBe(false)

      pay('2026-03-10')
      expect(paidIn('2026-03', id)['2026-03-16']).toBe(true)
    })
  })

  describe('after the last occurrence (cancel-by date)', () => {
    it('pays it within half a step towards the cancelled next occurrence', () => {
      // Last occurrence Mar 10; the cancelled one would be Apr 10 (31 days).
      const id = addRegular({
        frequency: 'MONTHLY',
        date: '2026-01-10',
        cancelBy: '2026-03-15',
      })
      pay('2026-03-25') // 15 days after
      expect(paidIn('2026-03', id)).toEqual({ '2026-03-10': true })
    })

    it('pays nothing nearer the cancelled occurrence', () => {
      const id = addRegular({
        frequency: 'MONTHLY',
        date: '2026-01-10',
        cancelBy: '2026-03-15',
      })
      pay('2026-03-26') // 16 days after, 15 before Apr 10
      expect(paidIn('2026-03', id)).toEqual({ '2026-03-10': false })
    })
  })

  it('a HELD Linked payment pays the occurrence', () => {
    const id = addRegular({ frequency: 'MONTHLY', date: '2026-01-10' })
    pay('2026-03-10', { status: 'HELD' })
    expect(occurrence('2026-03', id, '2026-03-10').payments[0].status).toBe(
      'HELD'
    )
    expect(paidIn('2026-03', id)).toEqual({ '2026-03-10': true })
  })

  it('an ambiguous payment (inside two Regulars’ bands) pays neither', () => {
    const a = addRegular({
      frequency: 'MONTHLY',
      date: '2026-01-10',
      amount: 5000,
    })
    const b = addRegular({
      frequency: 'MONTHLY',
      date: '2026-01-12',
      amount: 5200,
    })
    pay('2026-03-11', { amount: 5100 })

    expect(paidIn('2026-03', a)).toEqual({ '2026-03-10': false })
    expect(paidIn('2026-03', b)).toEqual({ '2026-03-12': false })
  })

  it('a payment outside the ±20% band or with another description pays nothing', () => {
    const id = addRegular({
      frequency: 'MONTHLY',
      date: '2026-01-10',
      amount: 5000,
    })
    pay('2026-03-10', { amount: 6001 })
    pay('2026-03-10', { description: 'OTHER CO' })
    expect(paidIn('2026-03', id)).toEqual({ '2026-03-10': false })
  })

  describe('ONCE', () => {
    it('is paid by a Linked payment in its own month, even before its date', () => {
      const id = addRegular({ frequency: 'ONCE', date: '2026-03-20' })
      pay('2026-03-02')
      expect(paidIn('2026-03', id)).toEqual({ '2026-03-20': true })
    })

    it('is paid by a Linked payment in a later month', () => {
      const id = addRegular({ frequency: 'ONCE', date: '2026-03-20' })
      pay('2026-04-02')
      expect(paidIn('2026-03', id)).toEqual({ '2026-03-20': true })
    })

    it('is not paid by a Linked payment before its month', () => {
      const id = addRegular({ frequency: 'ONCE', date: '2026-03-20' })
      pay('2026-02-28')
      expect(paidIn('2026-03', id)).toEqual({ '2026-03-20': false })
    })
  })

  it('a Regular with no description is unpaid until marked', () => {
    const id = addRegular({
      frequency: 'MONTHLY',
      date: '2026-01-10',
      description: null,
    })
    pay('2026-03-10')
    expect(paidIn('2026-03', id)).toEqual({ '2026-03-10': false })
  })

  it('lists every Regular’s occurrences in the month by date, then id', () => {
    const late = addRegular({ frequency: 'MONTHLY', date: '2026-01-20' })
    const early = addRegular({
      frequency: 'MONTHLY',
      date: '2026-01-05',
      description: 'X',
    })
    addRegular({ frequency: 'MONTHLY', date: '2026-05-05' }) // starts later
    expect(
      regularOccurrencesPaidInMonth('2026-03').map((o) => [
        o.regular.id,
        o.date,
      ])
    ).toEqual([
      [early, '2026-03-05'],
      [late, '2026-03-20'],
    ])
  })
})

describe('Mark paid (#214)', () => {
  it('marks and unmarks an occurrence', () => {
    const id = addRegular({ frequency: 'MONTHLY', date: '2026-01-10' })

    expect(markOccurrencePaid(id, '2026-03-10')).toBe(true)
    const marked = occurrence('2026-03', id, '2026-03-10')
    expect(marked.paid).toBe(true)
    expect(marked.markedAt).toBe('2026-03-15T12:00:00.000Z')
    expect(marked.payments).toEqual([])
    // Only that occurrence.
    expect(paidIn('2026-02', id)).toEqual({ '2026-02-10': false })

    unmarkOccurrencePaid(id, '2026-03-10')
    expect(occurrence('2026-03', id, '2026-03-10')).toMatchObject({
      paid: false,
      markedAt: null,
    })
  })

  it('re-marking keeps the original time', () => {
    const id = addRegular({ frequency: 'MONTHLY', date: '2026-01-10' })
    markOccurrencePaid(id, '2026-03-10')
    vi.setSystemTime(new Date('2026-03-16T12:00:00Z'))
    markOccurrencePaid(id, '2026-03-10')
    expect(occurrence('2026-03', id, '2026-03-10').markedAt).toBe(
      '2026-03-15T12:00:00.000Z'
    )
  })

  it('refuses a date that isn’t one of the Regular’s occurrences, or a missing Regular', () => {
    const id = addRegular({ frequency: 'MONTHLY', date: '2026-01-10' })
    expect(markOccurrencePaid(id, '2026-03-11')).toBe(false)
    expect(markOccurrencePaid(id, '2025-12-10')).toBe(false) // before the anchor
    expect(markOccurrencePaid(9999, '2026-03-10')).toBe(false)
    expect(
      db.exec(`SELECT COUNT(*) FROM regular_paid_marks`)[0].values[0][0]
    ).toBe(0)
  })

  it('ignores a stale mark after a date edit, and never applies it to another occurrence', () => {
    const id = addRegular({ frequency: 'MONTHLY', date: '2026-01-10' })
    markOccurrencePaid(id, '2026-03-10')

    db.run(
      `UPDATE upcoming_charges SET next_charge_date = '2026-01-12' WHERE id = ?`,
      [id]
    )

    expect(paidIn('2026-03', id)).toEqual({ '2026-03-12': false })
    expect(occurrence('2026-03', id, '2026-03-12').markedAt).toBeNull()
  })

  it('deleting a Regular deletes its marks', () => {
    const id = addRegular({ frequency: 'MONTHLY', date: '2026-01-10' })
    const other = addRegular({ frequency: 'MONTHLY', date: '2026-01-11' })
    markOccurrencePaid(id, '2026-03-10')
    markOccurrencePaid(other, '2026-03-11')

    deleteRegular(id)

    expect(
      db.exec(`SELECT regular_id FROM regular_paid_marks`)[0].values
    ).toEqual([[other]])
  })

  it('marking a ONCE paid keeps the Regular, unchanged', () => {
    const id = addRegular({ frequency: 'ONCE', date: '2026-03-05' })
    const before = regularById(id)

    expect(markOccurrencePaid(id, '2026-03-05')).toBe(true)

    expect(regularById(id)).toEqual(before)
    expect(paidIn('2026-03', id)).toEqual({ '2026-03-05': true })
  })
})
