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
  match_description?: string | null
}) {
  db.run(
    `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, is_reserved, created_at, match_description)
     VALUES (?, ?, 'ONCE', ?, 1, '2025-01-01', ?)`,
    [
      opts.name,
      opts.amount,
      opts.next_charge_date,
      opts.match_description ?? null,
    ]
  )
}

function settleDebit(
  accountId: string,
  description: string,
  settledAt: string,
  amountCents: number
) {
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, settled_at, created_at)
     VALUES (?, ?, 'SETTLED', ?, ?, ?, ?)`,
    [
      `tx-${description}-${settledAt}`,
      accountId,
      description,
      -amountCents,
      settledAt,
      settledAt,
    ]
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
        match_description: 'Netflix',
      })
      settleDebit(ESSENTIALS_SAVER, 'Netflix', '2025-01-25T09:00:00.000Z', 1500)
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
        match_description: 'Netflix',
      })
      settleDebit(ESSENTIALS_SAVER, 'Netflix', '2025-01-25T09:00:00.000Z', 1500)
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
        match_description: 'Netflix',
      })
      settleDebit(ESSENTIALS_SAVER, 'Netflix', '2025-01-25T09:00:00.000Z', 1500)
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
        match_description: 'Netflix',
      })
      settleDebit(ESSENTIALS_SAVER, 'Netflix', '2025-01-25T09:00:00.000Z', 1500)
      addCharge({ name: 'Gym', amount: 2000, next_charge_date: '2025-02-26' })
      setSaverBalance(0) // short by 1500, and Gym is still transactional

      const coverage = getEssentialsCoverage()
      expect(coverage?.state).toBe('shortfall')
      expect(coverage?.transactionalCount).toBe(1)
    })
  })
})

describe('getEssentialsCoverage: states that decline to show a coverage result', () => {
  beforeEach(() => {
    appSettings['essentials_saver_account_id'] = ESSENTIALS_SAVER
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_description: 'Netflix',
    })
    settleDebit(ESSENTIALS_SAVER, 'Netflix', '2025-01-25T09:00:00.000Z', 1500)
    setSaverBalance(5000)
  })

  it('needs a payday when none is configured, rather than claiming "covered"', () => {
    delete appSettings['next_payday']
    delete appSettings['payday_frequency']
    expect(getEssentialsCoverage()?.state).toBe('payday_needed')
  })

  it.each(['next_payday', 'payday_frequency'])(
    'needs a payday when only %s is missing',
    (key) => {
      delete appSettings[key]
      expect(getEssentialsCoverage()?.state).toBe('payday_needed')
    }
  )

  it('reports the Saver unavailable once it is closed', () => {
    db.run(`UPDATE accounts SET is_closed = 1 WHERE id = ?`, [ESSENTIALS_SAVER])
    expect(getEssentialsCoverage()?.state).toBe('saver_unavailable')
  })

  it('reports the Saver unavailable when it is missing, rather than a $0-balance shortfall', () => {
    db.run(`DELETE FROM accounts WHERE id = ?`, [ESSENTIALS_SAVER])
    expect(getEssentialsCoverage()?.state).toBe('saver_unavailable')
  })

  it('reports the Saver unavailable even before any Essentials payment was seen', () => {
    db.run(`DELETE FROM transactions`)
    db.run(`UPDATE accounts SET is_closed = 1 WHERE id = ?`, [ESSENTIALS_SAVER])
    expect(getEssentialsCoverage()?.state).toBe('saver_unavailable')
  })
})

describe('getEssentialsCoverage: partial counts every transactional bill, not just this cycle', () => {
  beforeEach(() => {
    appSettings['essentials_saver_account_id'] = ESSENTIALS_SAVER
    addCharge({
      name: 'Netflix',
      amount: 1500,
      next_charge_date: '2025-02-25',
      match_description: 'Netflix',
    })
    settleDebit(ESSENTIALS_SAVER, 'Netflix', '2025-01-25T09:00:00.000Z', 1500)
    setSaverBalance(5000)
  })

  it('is partial when a transactional bill is due after payday', () => {
    addCharge({ name: 'Gym', amount: 6000, next_charge_date: '2025-03-10' })
    const coverage = getEssentialsCoverage()
    expect(coverage?.state).toBe('partial')
    expect(coverage?.transactionalCount).toBe(1)
    expect(coverage?.reservedHereCents).toBe(0)
  })

  it('ignores a transactional one-off whose date has passed (never reserved again)', () => {
    addCharge({ name: 'Old fee', amount: 900, next_charge_date: '2025-02-20' })
    expect(getEssentialsCoverage()?.state).toBe('covered')
  })

  it('ignores a transactional Regular past its cancel-by date', () => {
    db.run(
      `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, is_reserved, created_at, cancel_by_date)
       VALUES ('Old sub', 1000, 'MONTHLY', '2025-03-05', 1, '2025-01-01', '2025-02-01')`
    )
    expect(getEssentialsCoverage()?.state).toBe('covered')
  })

  it('ignores a transactional Regular that is not included in Spendable', () => {
    db.run(
      `INSERT INTO upcoming_charges (name, amount, frequency, next_charge_date, is_reserved, created_at)
       VALUES ('Excluded', 1000, 'ONCE', '2025-03-10', 0, '2025-01-01')`
    )
    expect(getEssentialsCoverage()?.state).toBe('covered')
  })

  it('exposes the Saver balance behind the set-aside figure', () => {
    expect(getEssentialsCoverage()?.saverBalanceCents).toBe(5000)
  })
})
