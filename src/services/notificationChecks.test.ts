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
const { checkPaydayLanded, findFirstUnseenCredit } = __test__

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
