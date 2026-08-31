import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic
let db: Database
const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
  schedulePersist: () => {},
}))

// showNotification touches the browser Notification API (via `window`), which
// doesn't exist in this suite's node test environment. Stub it out only —
// everything else in @/lib/notifications (guards, history) stays real.
vi.mock('@/lib/notifications', async () => {
  const actual = await vi.importActual<typeof import('@/lib/notifications')>(
    '@/lib/notifications'
  )
  return { ...actual, showNotification: vi.fn() }
})

const { __test__ } = await import('./notificationChecks')
const { checkPaydayLanded, findFirstUnseenCredit, checkLiabilityRepayments } =
  __test__
const { localDateString, formatMoney } = await import('@/lib/format')

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]
  appSettings['notif_payday'] = '1'

  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
     VALUES ('acc1', 'Everyday', 'TRANSACTIONAL', 500000, '2026-01-01', '2026-01-01')`
  )
})

function insertTx(opts: {
  id: string
  amount: number
  settled_at: string
  raw_text?: string | null
  transfer_account_id?: string | null
}) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, raw_text, description, amount, settled_at, created_at, transfer_account_id)
     VALUES (?, 'acc1', 'SETTLED', ?, 'Payment', ?, ?, ?, ?)`,
    [
      opts.id,
      opts.raw_text ?? null,
      opts.amount,
      opts.settled_at,
      opts.settled_at,
      opts.transfer_account_id ?? null,
    ]
  )
}

describe('findFirstUnseenCredit', () => {
  it('returns null when nothing matches the where clause', () => {
    const result = findFirstUnseenCredit(
      db,
      'AND t.amount >= ? AND COALESCE(t.settled_at, t.created_at) >= ?',
      [100000, '2026-01-01T00:00:00.000Z'],
      null
    )
    expect(result).toBeNull()
  })

  it('returns the newest matching credit when nothing has fired yet', () => {
    insertTx({
      id: 't1',
      amount: 200000,
      settled_at: '2026-03-01T09:00:00.000Z',
    })
    insertTx({
      id: 't2',
      amount: 200000,
      settled_at: '2026-03-15T09:00:00.000Z',
    })
    const result = findFirstUnseenCredit(
      db,
      'AND t.amount >= ? AND COALESCE(t.settled_at, t.created_at) >= ?',
      [100000, '2026-01-01T00:00:00.000Z'],
      null
    )
    expect(result?.date).toBe('2026-03-15')
    expect(result?.amount).toBe(200000)
  })

  it('skips candidates on or before lastFiredDate', () => {
    insertTx({
      id: 't1',
      amount: 200000,
      settled_at: '2026-03-01T09:00:00.000Z',
    })
    const result = findFirstUnseenCredit(
      db,
      'AND t.amount >= ? AND COALESCE(t.settled_at, t.created_at) >= ?',
      [100000, '2026-01-01T00:00:00.000Z'],
      '2026-03-01'
    )
    expect(result).toBeNull()
  })

  it('returns a candidate strictly after lastFiredDate', () => {
    insertTx({
      id: 't1',
      amount: 200000,
      settled_at: '2026-03-01T09:00:00.000Z',
    })
    insertTx({
      id: 't2',
      amount: 200000,
      settled_at: '2026-03-15T09:00:00.000Z',
    })
    const result = findFirstUnseenCredit(
      db,
      'AND t.amount >= ? AND COALESCE(t.settled_at, t.created_at) >= ?',
      [100000, '2026-01-01T00:00:00.000Z'],
      '2026-03-01'
    )
    expect(result?.date).toBe('2026-03-15')
  })
})

describe('checkPaydayLanded', () => {
  it('does nothing when the payday notification type is disabled', () => {
    appSettings['notif_payday'] = '0'
    appSettings['payday_raw_text'] = 'SALARY-CO'
    insertTx({
      id: 't1',
      amount: 200000,
      settled_at: new Date().toISOString(),
      raw_text: 'SALARY-CO',
    })
    checkPaydayLanded()
    expect(appSettings['notif_last_payday_date']).toBeUndefined()
  })

  it('raw_text match: allows a transfer to match (no transfer_account_id filter)', () => {
    appSettings['payday_raw_text'] = 'SALARY-CO'
    const today = new Date().toISOString()
    insertTx({
      id: 't1',
      amount: 200000,
      settled_at: today,
      raw_text: 'SALARY-CO',
      transfer_account_id: 'acc2',
    })
    checkPaydayLanded()
    expect(appSettings['notif_last_payday_date']).toBe(today.slice(0, 10))
  })

  it('amount-heuristic fallback: excludes transfers via transfer_account_id filter', () => {
    appSettings['pay_amount_cents'] = '200000'
    const today = new Date().toISOString()
    insertTx({
      id: 't1',
      amount: 200000,
      settled_at: today,
      transfer_account_id: 'acc2',
    })
    checkPaydayLanded()
    expect(appSettings['notif_last_payday_date']).toBeUndefined()
  })

  it('amount-heuristic fallback: matches a non-transfer credit at or above 80% of pay amount', () => {
    appSettings['pay_amount_cents'] = '200000'
    const today = new Date().toISOString()
    insertTx({ id: 't1', amount: 160000, settled_at: today })
    checkPaydayLanded()
    expect(appSettings['notif_last_payday_date']).toBe(today.slice(0, 10))
  })

  it('amount-heuristic fallback: does nothing when pay_amount_cents is not configured', () => {
    insertTx({ id: 't1', amount: 200000, settled_at: new Date().toISOString() })
    checkPaydayLanded()
    expect(appSettings['notif_last_payday_date']).toBeUndefined()
  })
})

describe('checkLiabilityRepayments', () => {
  const RAW = 'MORTGAGE-CBA-12345'

  function insertLiabilityAccount(balanceCents: number, name = 'Home Loan') {
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO manual_accounts
         (name, account_type, kind, balance_cents, sort_order, last_updated_at, created_at)
       VALUES (?, 'MORTGAGE', 'liability', ?, 0, ?, ?)`,
      [name, balanceCents, now, now]
    )
    return db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  }

  function insertLiabilityCharge(opts: {
    amountCents: number
    linkedAccountId: number | null
    matchRawText: string | null
    nextChargeDate?: string
    frequency?: string
  }) {
    db.run(
      `INSERT INTO upcoming_charges
         (name, amount, frequency, next_charge_date, is_reserved, created_at,
          charge_type, linked_manual_account_id, match_raw_text)
       VALUES ('Mortgage repayment', ?, ?, ?, 1, ?, 'LIABILITY_REPAYMENT', ?, ?)`,
      [
        opts.amountCents,
        opts.frequency ?? 'MONTHLY',
        opts.nextChargeDate ?? localDateString(),
        new Date().toISOString(),
        opts.linkedAccountId,
        opts.matchRawText,
      ]
    )
    return db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  }

  function liabilityNotifications() {
    const res = db.exec(
      `SELECT title, body, link_path FROM notification_history WHERE type = 'liability_repayment'`
    )
    return res[0]?.values ?? []
  }

  function accountBalance(id: number) {
    return db.exec(
      `SELECT balance_cents FROM manual_accounts WHERE id = ${id}`
    )[0].values[0][0] as number
  }

  it('first run backfills: seeds the current cycle and does not prompt for an already-settled payment', () => {
    const accId = insertLiabilityAccount(35_000_000)
    const chargeId = insertLiabilityCharge({
      amountCents: 250_000,
      linkedAccountId: accId,
      matchRawText: RAW,
    })
    insertTx({
      id: 'pay1',
      amount: -250_000,
      settled_at: new Date().toISOString(),
      raw_text: RAW,
    })

    checkLiabilityRepayments()

    expect(appSettings['liab_repay_backfilled']).toBe('1')
    expect(appSettings[`liab_repay_${chargeId}_${localDateString()}`]).toBe('1')
    expect(liabilityNotifications()).toHaveLength(0)
    expect(accountBalance(accId)).toBe(35_000_000)
  })

  it('after backfill: a matching payment prompts to reduce the balance, without changing it', () => {
    appSettings['liab_repay_backfilled'] = '1'
    const accId = insertLiabilityAccount(35_000_000)
    const chargeId = insertLiabilityCharge({
      amountCents: 250_000,
      linkedAccountId: accId,
      matchRawText: RAW,
    })
    insertTx({
      id: 'pay1',
      amount: -250_000,
      settled_at: new Date().toISOString(),
      raw_text: RAW,
    })

    checkLiabilityRepayments()

    const notifs = liabilityNotifications()
    expect(notifs).toHaveLength(1)
    const [title, body, linkPath] = notifs[0] as [string, string, string]
    expect(title).toBe('Liability payment detected')
    expect(body).toContain('Home Loan')
    expect(body).toContain(formatMoney(250_000)) // amount deducted
    expect(body).toContain(formatMoney(34_750_000)) // suggested new balance
    expect(linkPath).toBe(`/analytics/net-worth?repay=${chargeId}`)
    // Balance is only a suggestion — nothing written until the user confirms.
    expect(accountBalance(accId)).toBe(35_000_000)
    expect(appSettings[`liab_repay_${chargeId}_${localDateString()}`]).toBe('1')
  })

  it('suggested balance is clamped at zero when the payment exceeds what is owed', () => {
    appSettings['liab_repay_backfilled'] = '1'
    const accId = insertLiabilityAccount(100_000)
    insertLiabilityCharge({
      amountCents: 250_000,
      linkedAccountId: accId,
      matchRawText: RAW,
    })
    insertTx({
      id: 'pay1',
      amount: -250_000,
      settled_at: new Date().toISOString(),
      raw_text: RAW,
    })

    checkLiabilityRepayments()

    const body = (liabilityNotifications()[0] as string[])[1]
    expect(body).toContain(`to $${formatMoney(0)})`)
  })

  it('does nothing for a linked charge with no settlement fingerprint', () => {
    appSettings['liab_repay_backfilled'] = '1'
    const accId = insertLiabilityAccount(35_000_000)
    insertLiabilityCharge({
      amountCents: 250_000,
      linkedAccountId: accId,
      matchRawText: null,
    })
    insertTx({
      id: 'pay1',
      amount: -250_000,
      settled_at: new Date().toISOString(),
      raw_text: RAW,
    })

    checkLiabilityRepayments()

    expect(liabilityNotifications()).toHaveLength(0)
  })

  it('does nothing for a charge with a fingerprint but no linked account', () => {
    appSettings['liab_repay_backfilled'] = '1'
    insertLiabilityCharge({
      amountCents: 250_000,
      linkedAccountId: null,
      matchRawText: RAW,
    })
    insertTx({
      id: 'pay1',
      amount: -250_000,
      settled_at: new Date().toISOString(),
      raw_text: RAW,
    })

    checkLiabilityRepayments()

    expect(liabilityNotifications()).toHaveLength(0)
  })

  it('does not prompt or set a guard when no matching payment has settled', () => {
    appSettings['liab_repay_backfilled'] = '1'
    const accId = insertLiabilityAccount(35_000_000)
    const chargeId = insertLiabilityCharge({
      amountCents: 250_000,
      linkedAccountId: accId,
      matchRawText: RAW,
    })

    checkLiabilityRepayments()

    expect(liabilityNotifications()).toHaveLength(0)
    expect(
      appSettings[`liab_repay_${chargeId}_${localDateString()}`]
    ).toBeUndefined()
  })

  it('fires at most once per cycle', () => {
    appSettings['liab_repay_backfilled'] = '1'
    const accId = insertLiabilityAccount(35_000_000)
    insertLiabilityCharge({
      amountCents: 250_000,
      linkedAccountId: accId,
      matchRawText: RAW,
    })
    insertTx({
      id: 'pay1',
      amount: -250_000,
      settled_at: new Date().toISOString(),
      raw_text: RAW,
    })

    checkLiabilityRepayments()
    checkLiabilityRepayments()

    expect(liabilityNotifications()).toHaveLength(1)
  })

  it('guards a stale link (account deleted) without prompting', () => {
    appSettings['liab_repay_backfilled'] = '1'
    const chargeId = insertLiabilityCharge({
      amountCents: 250_000,
      linkedAccountId: 9999, // no such account
      matchRawText: RAW,
    })
    insertTx({
      id: 'pay1',
      amount: -250_000,
      settled_at: new Date().toISOString(),
      raw_text: RAW,
    })

    checkLiabilityRepayments()

    expect(liabilityNotifications()).toHaveLength(0)
    expect(appSettings[`liab_repay_${chargeId}_${localDateString()}`]).toBe('1')
  })

  it('does nothing when the bills notification type is disabled', () => {
    appSettings['notif_bills'] = '0'
    const accId = insertLiabilityAccount(35_000_000)
    insertLiabilityCharge({
      amountCents: 250_000,
      linkedAccountId: accId,
      matchRawText: RAW,
    })
    insertTx({
      id: 'pay1',
      amount: -250_000,
      settled_at: new Date().toISOString(),
      raw_text: RAW,
    })

    checkLiabilityRepayments()

    expect(liabilityNotifications()).toHaveLength(0)
    expect(appSettings['liab_repay_backfilled']).toBeUndefined()
  })
})
