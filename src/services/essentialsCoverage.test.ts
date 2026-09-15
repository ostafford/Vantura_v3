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

const { getEssentialsCoverage } = await import('./essentialsCoverage')

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

  appSettings['next_payday'] = '2025-03-01'
  appSettings['payday_frequency'] = 'MONTHLY'

  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
     VALUES (?, 'Everyday', 'TRANSACTIONAL', 500000, '2025-01-01', '2025-01-01'),
            (?, 'Bills', 'SAVER', 0, '2025-01-01', '2025-01-01')`,
    [TRANSACTIONAL, ESSENTIALS_SAVER]
  )
})

afterEach(() => {
  vi.useRealTimers()
})

function setSaverBalance(cents: number) {
  db.run(`UPDATE accounts SET balance = ? WHERE id = ?`, [
    cents,
    ESSENTIALS_SAVER,
  ])
}

function addCharge(opts: {
  name: string
  amount: number
  next_charge_date: string
  match_raw_text?: string | null
}) {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, is_reserved, created_at, match_raw_text)
     VALUES (?, ?, 'ONCE', ?, 1, '2025-01-01', ?)`,
    [opts.name, opts.amount, opts.next_charge_date, opts.match_raw_text ?? null]
  )
}

function settleDebit(accountId: string, rawText: string, settledAt: string) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, raw_text, description, amount, settled_at, created_at)
     VALUES (?, ?, 'SETTLED', ?, 'Payment', -1000, ?, ?)`,
    [`tx-${rawText}-${settledAt}`, accountId, rawText, settledAt, settledAt]
  )
}

describe('getEssentialsCoverage', () => {
  it('is null for a classic user (no nomination)', () => {
    expect(getEssentialsCoverage()).toBeNull()
  })

  describe('with a nominated Essentials Saver', () => {
    beforeEach(() => {
      appSettings['essentials_saver_account_id'] = ESSENTIALS_SAVER
    })

    it('is hidden when no Regular has ever been observed as Essentials-funded', () => {
      addCharge({ name: 'Gym', amount: 2000, next_charge_date: '2025-02-25' })
      expect(getEssentialsCoverage()?.state).toBe('hidden')
    })

    it('is covered when the only reserved Regular is fully Essentials-funded and the Saver can afford it', () => {
      addCharge({
        name: 'Netflix',
        amount: 1500,
        next_charge_date: '2025-02-25',
        match_raw_text: 'NETFLIX',
      })
      settleDebit(ESSENTIALS_SAVER, 'NETFLIX', '2025-01-25T09:00:00.000Z')
      setSaverBalance(5000)

      const coverage = getEssentialsCoverage()
      expect(coverage?.state).toBe('covered')
      expect(coverage?.reservedHereCents).toBe(0)
      expect(coverage?.essentialsSetAsideCents).toBe(1500)
      expect(coverage?.transactionalCount).toBe(0)
      expect(coverage?.shortfallCents).toBe(0)
    })

    it('is partial when some Regulars are still transactional-funded', () => {
      addCharge({
        name: 'Netflix',
        amount: 1500,
        next_charge_date: '2025-02-25',
        match_raw_text: 'NETFLIX',
      })
      settleDebit(ESSENTIALS_SAVER, 'NETFLIX', '2025-01-25T09:00:00.000Z')
      addCharge({ name: 'Gym', amount: 2000, next_charge_date: '2025-02-26' })
      setSaverBalance(5000)

      const coverage = getEssentialsCoverage()
      expect(coverage?.state).toBe('partial')
      expect(coverage?.reservedHereCents).toBe(2000)
      expect(coverage?.essentialsSetAsideCents).toBe(1500)
      expect(coverage?.transactionalCount).toBe(1)
    })

    it('is shortfall when the Saver balance cannot cover its Essentials-funded Regulars', () => {
      addCharge({
        name: 'Netflix',
        amount: 1500,
        next_charge_date: '2025-02-25',
        match_raw_text: 'NETFLIX',
      })
      settleDebit(ESSENTIALS_SAVER, 'NETFLIX', '2025-01-25T09:00:00.000Z')
      setSaverBalance(500) // short by 1000

      const coverage = getEssentialsCoverage()
      expect(coverage?.state).toBe('shortfall')
      expect(coverage?.shortfallCents).toBe(1000)
    })

    it('shortfall takes priority over partial migration', () => {
      addCharge({
        name: 'Netflix',
        amount: 1500,
        next_charge_date: '2025-02-25',
        match_raw_text: 'NETFLIX',
      })
      settleDebit(ESSENTIALS_SAVER, 'NETFLIX', '2025-01-25T09:00:00.000Z')
      addCharge({ name: 'Gym', amount: 2000, next_charge_date: '2025-02-26' })
      setSaverBalance(0) // short by 1500, and Gym is still transactional

      const coverage = getEssentialsCoverage()
      expect(coverage?.state).toBe('shortfall')
      expect(coverage?.transactionalCount).toBe(1)
    })
  })
})
