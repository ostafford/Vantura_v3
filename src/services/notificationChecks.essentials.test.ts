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
const appSettings: Record<string, string> = {}

vi.mock('@/db', () => ({
  getDb: () => db,
  getAppSetting: (key: string) => appSettings[key] ?? null,
  setAppSetting: (key: string, value: string) => {
    appSettings[key] = value
  },
  schedulePersist: () => {},
}))

// showNotification touches the browser Notification API, unavailable in this
// suite's node test environment.
vi.mock('@/lib/notifications', async () => {
  const actual = await vi.importActual<typeof import('@/lib/notifications')>(
    '@/lib/notifications'
  )
  return { ...actual, showNotification: vi.fn() }
})

const { __test__ } = await import('./notificationChecks')
const { checkBillsDue, checkBillsSettled } = __test__

const TRANSACTIONAL = 'transactional-1'
const ESSENTIALS_SAVER = 'essentials-saver-1'

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-02-23T12:00:00Z'))

  const { runSchema } = await import('@/db/schema')
  db = new SQL.Database()
  runSchema(db)
  for (const key of Object.keys(appSettings)) delete appSettings[key]

  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
     VALUES (?, 'Everyday', 'TRANSACTIONAL', 500000, '2025-01-01', '2025-01-01'),
            (?, 'Bills', 'SAVER', 200000, '2025-01-01', '2025-01-01')`,
    [TRANSACTIONAL, ESSENTIALS_SAVER]
  )
})

afterEach(() => {
  vi.useRealTimers()
})

function addCharge(opts: { name: string; matchRawText?: string | null }) {
  db.run(
    `INSERT INTO upcoming_charges
       (name, amount, frequency, next_charge_date, is_reserved, reminder_days_before, created_at, match_raw_text)
     VALUES (?, 1999, 'MONTHLY', '2025-02-25', 1, 3, '2025-01-01', ?)`,
    [opts.name, opts.matchRawText ?? null]
  )
}

function settleDebit(accountId: string, rawText: string, settledAt: string) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, raw_text, description, amount, settled_at, created_at)
     VALUES (?, ?, 'SETTLED', ?, 'Payment', -1999, ?, ?)`,
    [`tx-${rawText}-${settledAt}`, accountId, rawText, settledAt, settledAt]
  )
}

function billsDueHistory(): Array<{ title: string; body: string }> {
  const res = db.exec(
    `SELECT title, body FROM notification_history WHERE type = 'bills_due'`
  )
  const rows = res[0]?.values ?? []
  return rows.map((r) => ({ title: String(r[0]), body: String(r[1]) }))
}

describe('bills_due is funding-source-agnostic (#99)', () => {
  it('fires identically for a classic user and an Essentials user with the same charge', () => {
    addCharge({ name: 'Netflix', matchRawText: 'NETFLIX' })
    checkBillsDue()
    const classicHistory = billsDueHistory()
    expect(classicHistory).toHaveLength(1)
    expect(classicHistory[0].body).toBe('Netflix ($19.99) — due in 2d')

    // Same charge, but now the user has nominated an Essentials Saver and
    // this exact Regular's funding source resolves to it. bills_due should
    // not special-case this — it's still a real upcoming debit.
    appSettings['essentials_saver_account_id'] = ESSENTIALS_SAVER
    settleDebit(ESSENTIALS_SAVER, 'NETFLIX', '2025-01-25T09:00:00.000Z')
    // Clear today's guard so the check can run again in this test.
    delete appSettings['notif_last_bills_date']

    checkBillsDue()
    const essentialsHistory = billsDueHistory()
    expect(essentialsHistory).toHaveLength(1)
    expect(essentialsHistory[0].body).toBe(classicHistory[0].body)
    expect(essentialsHistory[0].title).toBe(classicHistory[0].title)
  })
})

describe('checkBillsSettled auto-clear is funding-source-agnostic (#99)', () => {
  it('clears the bills_due notification when the matching debit settles from the nominated Essentials Saver', () => {
    appSettings['essentials_saver_account_id'] = ESSENTIALS_SAVER
    addCharge({ name: 'Netflix', matchRawText: 'NETFLIX' })
    checkBillsDue()
    expect(billsDueHistory()).toHaveLength(1)

    // Settles from the Essentials Saver, not the transactional account —
    // the existing settlement check (#93's account-agnostic boolean) should
    // still clear it, exactly as it would for a transactional settlement.
    settleDebit(ESSENTIALS_SAVER, 'NETFLIX', '2025-02-20T09:00:00.000Z')
    checkBillsSettled()

    expect(billsDueHistory()).toHaveLength(0)
  })

  it('clears identically for a classic user (regression guard)', () => {
    addCharge({ name: 'Netflix', matchRawText: 'NETFLIX' })
    checkBillsDue()
    expect(billsDueHistory()).toHaveLength(1)

    settleDebit(TRANSACTIONAL, 'NETFLIX', '2025-02-20T09:00:00.000Z')
    checkBillsSettled()

    expect(billsDueHistory()).toHaveLength(0)
  })
})
