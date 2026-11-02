/**
 * Characterisation test for #159 (ADR-0021): records what every reader of
 * `upcoming_charges` returns today, against one fixed set of Regulars, before
 * those readers are folded into the Regulars module.
 *
 * The recorded outputs (the inline snapshots) must not change while #159 lands.
 * Only the calls may change, as the readers are renamed or moved. A snapshot diff
 * here is a behaviour change: stop and decide it explicitly, never `-u` it away.
 *
 * Not covered: a NULL `charge_type`. The column is `NOT NULL DEFAULT 'EXPENSE'`
 * in both the DDL and the migration that adds it, so no DB can hold one.
 */
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

const { getReservedAmount, getReservedBreakdown } = await import('./balance')
const { getEssentialsCoverage } = await import('./essentialsCoverage')
const { getProjectedNetWorth } = await import('./netWorth')
const {
  getUpcomingChargesGrouped,
  getUpcomingChargesForMonth,
  getDueSoonCharges,
  getLinkedLiabilityRepaymentCharges,
  getUpcomingChargeById,
} = await import('./upcoming')

const TRANSACTIONAL = 'transactional-1'
const ESSENTIALS_SAVER = 'essentials-saver-1'

interface Seed {
  name: string
  amount: number
  frequency: string
  next_charge_date: string
  is_reserved?: 0 | 1
  reminder_days_before?: number | null
  cancel_by_date?: string | null
  charge_type?: 'EXPENSE' | 'LIABILITY_REPAYMENT'
  linked_manual_account_id?: number | null
  match_description?: string | null
  category_id?: string | null
  bucket_id?: number | null
}

/**
 * Today is Sun 2025-02-23 (local = UTC under fake timers); next payday Fri
 * 2025-03-07, monthly. Each Regular exists to pin one case.
 */
const SEEDS: Seed[] = [
  // MONTHLY, due in 2 days, within its 5-day reminder, linked to transactional payments.
  {
    name: 'Netflix',
    amount: 1599,
    frequency: 'MONTHLY',
    next_charge_date: '2024-11-25',
    reminder_days_before: 5,
    match_description: 'NETFLIX.COM',
    category_id: 'tv-and-music',
  },
  // WEEKLY: two occurrences before payday (02-24, 03-03) → counted twice in Reserved.
  {
    name: 'Gym',
    amount: 1500,
    frequency: 'WEEKLY',
    next_charge_date: '2025-01-06',
  },
  // FORTNIGHTLY: 02-28 before payday, 03-14 after.
  {
    name: 'Rent',
    amount: 80000,
    frequency: 'FORTNIGHTLY',
    next_charge_date: '2025-01-17',
    reminder_days_before: 7,
  },
  // QUARTERLY: next 2025-04-02 → Later.
  {
    name: 'Water',
    amount: 21000,
    frequency: 'QUARTERLY',
    next_charge_date: '2024-10-02',
    reminder_days_before: 3,
  },
  // YEARLY: next 2025-03-15 → Later, in the March month view.
  {
    name: 'Domain',
    amount: 2500,
    frequency: 'YEARLY',
    next_charge_date: '2024-03-15',
  },
  // Month-end MONTHLY anchor: 02-28, then 03-31 (the anchor's day survives, #145).
  {
    name: 'Phone',
    amount: 4500,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-31',
    reminder_days_before: 10,
  },
  // Overdue ONCE: past date, no future occurrence (#18).
  {
    name: 'Concert',
    amount: 12000,
    frequency: 'ONCE',
    next_charge_date: '2025-02-10',
    reminder_days_before: 2,
  },
  // Future ONCE, after payday → Later.
  {
    name: 'Car rego',
    amount: 85000,
    frequency: 'ONCE',
    next_charge_date: '2025-03-20',
  },
  // Cancel-by before the next occurrence (03-05): cycle exhausted, dropped.
  {
    name: 'Trial',
    amount: 999,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-05',
    cancel_by_date: '2025-03-01',
    reminder_days_before: 30,
  },
  // Cancel-by after a couple of occurrences: 03-10 and 04-10 project, 05-10 doesn't.
  {
    name: 'Streaming',
    amount: 1299,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-10',
    cancel_by_date: '2025-04-15',
  },
  // Essentials-funded: its latest linked payment came from the Essentials Saver.
  {
    name: 'Electricity',
    amount: 18000,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-26',
    reminder_days_before: 5,
    match_description: 'POWERCO',
  },
  // LIABILITY_REPAYMENT linked to a manual liability and to its payments (#19).
  {
    name: 'Car loan',
    amount: 45000,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-28',
    reminder_days_before: 5,
    charge_type: 'LIABILITY_REPAYMENT',
    linked_manual_account_id: 1,
    match_description: 'LOANCO',
  },
  // LIABILITY_REPAYMENT linked to an account but with no payment link: not in the #19 set.
  {
    name: 'Card repayment',
    amount: 20000,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-27',
    charge_type: 'LIABILITY_REPAYMENT',
    linked_manual_account_id: 1,
  },
  // Not reserved: out of Reserved / net worth, still grouped and due-soon.
  {
    name: 'Spotify',
    amount: 1299,
    frequency: 'MONTHLY',
    next_charge_date: '2025-01-24',
    is_reserved: 0,
    reminder_days_before: 1,
    bucket_id: 1,
  },
]

function seedRegular(s: Seed) {
  db.run(
    `INSERT INTO upcoming_charges
       (name, amount, frequency, next_charge_date, category_id, is_reserved,
        reminder_days_before, cancel_by_date, created_at, bucket_id,
        charge_type, linked_manual_account_id, match_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2025-01-01', ?, ?, ?, ?)`,
    [
      s.name,
      s.amount,
      s.frequency,
      s.next_charge_date,
      s.category_id ?? null,
      s.is_reserved ?? 1,
      s.reminder_days_before ?? null,
      s.cancel_by_date ?? null,
      s.bucket_id ?? null,
      s.charge_type ?? 'EXPENSE',
      s.linked_manual_account_id ?? null,
      s.match_description ?? null,
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

  appSettings['next_payday'] = '2025-03-07'
  appSettings['payday_frequency'] = 'MONTHLY'
  appSettings['essentials_saver_account_id'] = ESSENTIALS_SAVER

  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
     VALUES (?, 'Everyday', 'TRANSACTIONAL', 500000, '2025-01-01', '2025-01-01'),
            (?, 'Bills', 'SAVER', 200000, '2025-01-01', '2025-01-01')`,
    [TRANSACTIONAL, ESSENTIALS_SAVER]
  )
  db.run(
    `INSERT INTO manual_accounts (id, name, account_type, kind, balance_cents, last_updated_at, created_at)
     VALUES (1, 'Car loan', 'LOAN', 'LIABILITY', 1500000, '2025-01-01', '2025-01-01')`
  )

  for (const s of SEEDS) seedRegular(s)

  settleDebit(TRANSACTIONAL, 'NETFLIX.COM', '2025-01-25T09:00:00+11:00', 1599)
  settleDebit(ESSENTIALS_SAVER, 'POWERCO', '2025-01-26T09:00:00+11:00', 18000)
  settleDebit(TRANSACTIONAL, 'LOANCO', '2025-01-28T09:00:00+11:00', 45000)
})

afterEach(() => {
  vi.useRealTimers()
})

/** Compact one-line-per-Regular view, so the snapshots stay reviewable. */
function brief(rows: Array<{ name: string; next_charge_date: string }>) {
  return rows.map((r) => `${r.next_charge_date} ${r.name}`)
}

describe('Regulars readers — characterisation (#159)', () => {
  it('Reserved amount (Spendable), Essentials-funded excluded', () => {
    expect(getReservedAmount()).toMatchInlineSnapshot(`154099`)
  })

  it('Reserved breakdown', () => {
    expect(getReservedBreakdown()).toMatchInlineSnapshot(`
      [
        {
          "frequency": "MONTHLY",
          "fullAmount": 1599,
          "name": "Netflix",
          "occurrenceCount": 1,
          "projectedDate": "2025-02-25",
          "reservedAmount": 1599,
        },
        {
          "frequency": "WEEKLY",
          "fullAmount": 1500,
          "name": "Gym",
          "occurrenceCount": 2,
          "projectedDate": "2025-02-24",
          "reservedAmount": 3000,
        },
        {
          "frequency": "FORTNIGHTLY",
          "fullAmount": 80000,
          "name": "Rent",
          "occurrenceCount": 1,
          "projectedDate": "2025-02-28",
          "reservedAmount": 80000,
        },
        {
          "frequency": "MONTHLY",
          "fullAmount": 4500,
          "name": "Phone",
          "occurrenceCount": 1,
          "projectedDate": "2025-02-28",
          "reservedAmount": 4500,
        },
        {
          "frequency": "MONTHLY",
          "fullAmount": 45000,
          "name": "Car loan",
          "occurrenceCount": 1,
          "projectedDate": "2025-02-28",
          "reservedAmount": 45000,
        },
        {
          "frequency": "MONTHLY",
          "fullAmount": 20000,
          "name": "Card repayment",
          "occurrenceCount": 1,
          "projectedDate": "2025-02-27",
          "reservedAmount": 20000,
        },
      ]
    `)
  })

  it('Essentials coverage', () => {
    expect(getEssentialsCoverage()).toMatchInlineSnapshot(`
      {
        "essentialsSetAsideCents": 18000,
        "reservedHereCents": 154099,
        "saverBalanceCents": 200000,
        "shortfallCents": 0,
        "state": "partial",
        "transactionalCount": 10,
      }
    `)
  })

  it('Essentials coverage with no Saver nominated', () => {
    delete appSettings['essentials_saver_account_id']
    expect(getEssentialsCoverage()).toMatchInlineSnapshot(`null`)
    expect(getReservedAmount()).toMatchInlineSnapshot(`172099`)
  })

  it('Projected net worth', () => {
    expect(getProjectedNetWorth(1_000_000)).toMatchInlineSnapshot(`
      {
        "projectedCents": 892901,
        "upcomingExpenseCents": 107099,
      }
    `)
  })

  it('Projected net worth with no payday configured', () => {
    delete appSettings['next_payday']
    expect(getProjectedNetWorth(1_000_000)).toMatchInlineSnapshot(`
      {
        "projectedCents": 1000000,
        "upcomingExpenseCents": 0,
      }
    `)
  })

  it('Overdue / Next pay / Later grouping', () => {
    const g = getUpcomingChargesGrouped()
    expect({
      overdue: brief(g.overdue),
      nextPay: brief(g.nextPay),
      later: brief(g.later),
      nextPayday: g.nextPayday,
    }).toMatchInlineSnapshot(`
      {
        "later": [
          "2025-03-10 Streaming",
          "2025-03-15 Domain",
          "2025-03-20 Car rego",
          "2025-04-02 Water",
        ],
        "nextPay": [
          "2025-02-24 Gym",
          "2025-02-24 Spotify",
          "2025-02-25 Netflix",
          "2025-02-26 Electricity",
          "2025-02-27 Card repayment",
          "2025-02-28 Rent",
          "2025-02-28 Car loan",
          "2025-02-28 Phone",
        ],
        "nextPayday": "2025-03-07",
        "overdue": [
          "2025-02-10 Concert",
        ],
      }
    `)
  })

  it('grouping returns full rows (projected date, all fields)', () => {
    expect(getUpcomingChargesGrouped().nextPay).toMatchInlineSnapshot(`
      [
        {
          "amount": 1500,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "EXPENSE",
          "frequency": "WEEKLY",
          "id": 2,
          "is_reserved": 1,
          "linked_manual_account_id": null,
          "match_description": null,
          "name": "Gym",
          "next_charge_date": "2025-02-24",
          "reminder_days_before": null,
        },
        {
          "amount": 1299,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "EXPENSE",
          "frequency": "MONTHLY",
          "id": 14,
          "is_reserved": 0,
          "linked_manual_account_id": null,
          "match_description": null,
          "name": "Spotify",
          "next_charge_date": "2025-02-24",
          "reminder_days_before": 1,
        },
        {
          "amount": 1599,
          "cancel_by_date": null,
          "category_id": "tv-and-music",
          "charge_type": "EXPENSE",
          "frequency": "MONTHLY",
          "id": 1,
          "is_reserved": 1,
          "linked_manual_account_id": null,
          "match_description": "NETFLIX.COM",
          "name": "Netflix",
          "next_charge_date": "2025-02-25",
          "reminder_days_before": 5,
        },
        {
          "amount": 18000,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "EXPENSE",
          "frequency": "MONTHLY",
          "id": 11,
          "is_reserved": 1,
          "linked_manual_account_id": null,
          "match_description": "POWERCO",
          "name": "Electricity",
          "next_charge_date": "2025-02-26",
          "reminder_days_before": 5,
        },
        {
          "amount": 20000,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "LIABILITY_REPAYMENT",
          "frequency": "MONTHLY",
          "id": 13,
          "is_reserved": 1,
          "linked_manual_account_id": 1,
          "match_description": null,
          "name": "Card repayment",
          "next_charge_date": "2025-02-27",
          "reminder_days_before": null,
        },
        {
          "amount": 80000,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "EXPENSE",
          "frequency": "FORTNIGHTLY",
          "id": 3,
          "is_reserved": 1,
          "linked_manual_account_id": null,
          "match_description": null,
          "name": "Rent",
          "next_charge_date": "2025-02-28",
          "reminder_days_before": 7,
        },
        {
          "amount": 45000,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "LIABILITY_REPAYMENT",
          "frequency": "MONTHLY",
          "id": 12,
          "is_reserved": 1,
          "linked_manual_account_id": 1,
          "match_description": "LOANCO",
          "name": "Car loan",
          "next_charge_date": "2025-02-28",
          "reminder_days_before": 5,
        },
        {
          "amount": 4500,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "EXPENSE",
          "frequency": "MONTHLY",
          "id": 6,
          "is_reserved": 1,
          "linked_manual_account_id": null,
          "match_description": null,
          "name": "Phone",
          "next_charge_date": "2025-02-28",
          "reminder_days_before": 10,
        },
      ]
    `)
  })

  it('grouping with no payday configured', () => {
    delete appSettings['next_payday']
    const g = getUpcomingChargesGrouped()
    expect({
      overdue: brief(g.overdue),
      nextPay: brief(g.nextPay),
      later: brief(g.later),
    }).toMatchInlineSnapshot(`
      {
        "later": [
          "2025-02-24 Gym",
          "2025-02-24 Spotify",
          "2025-02-25 Netflix",
          "2025-02-26 Electricity",
          "2025-02-27 Card repayment",
          "2025-02-28 Rent",
          "2025-02-28 Car loan",
          "2025-02-28 Phone",
          "2025-03-10 Streaming",
          "2025-03-15 Domain",
          "2025-03-20 Car rego",
          "2025-04-02 Water",
        ],
        "nextPay": [],
        "overdue": [
          "2025-02-10 Concert",
        ],
      }
    `)
  })

  it('calendar month view — February, March, April, May 2025', () => {
    expect({
      feb: brief(getUpcomingChargesForMonth(2025, 2)),
      mar: brief(getUpcomingChargesForMonth(2025, 3)),
      apr: brief(getUpcomingChargesForMonth(2025, 4)),
      may: brief(getUpcomingChargesForMonth(2025, 5)),
    }).toMatchInlineSnapshot(`
      {
        "apr": [
          "2025-04-02 Water",
          "2025-04-07 Gym",
          "2025-04-10 Streaming",
          "2025-04-11 Rent",
          "2025-04-14 Gym",
          "2025-04-21 Gym",
          "2025-04-24 Spotify",
          "2025-04-25 Netflix",
          "2025-04-25 Rent",
          "2025-04-26 Electricity",
          "2025-04-27 Card repayment",
          "2025-04-28 Gym",
          "2025-04-28 Car loan",
          "2025-04-30 Phone",
        ],
        "feb": [
          "2025-02-03 Gym",
          "2025-02-05 Trial",
          "2025-02-10 Gym",
          "2025-02-10 Concert",
          "2025-02-10 Streaming",
          "2025-02-14 Rent",
          "2025-02-17 Gym",
          "2025-02-24 Gym",
          "2025-02-24 Spotify",
          "2025-02-25 Netflix",
          "2025-02-26 Electricity",
          "2025-02-27 Card repayment",
          "2025-02-28 Rent",
          "2025-02-28 Phone",
          "2025-02-28 Car loan",
        ],
        "mar": [
          "2025-03-03 Gym",
          "2025-03-10 Gym",
          "2025-03-10 Streaming",
          "2025-03-14 Rent",
          "2025-03-15 Domain",
          "2025-03-17 Gym",
          "2025-03-20 Car rego",
          "2025-03-24 Gym",
          "2025-03-24 Spotify",
          "2025-03-25 Netflix",
          "2025-03-26 Electricity",
          "2025-03-27 Card repayment",
          "2025-03-28 Rent",
          "2025-03-28 Car loan",
          "2025-03-31 Gym",
          "2025-03-31 Phone",
        ],
        "may": [
          "2025-05-05 Gym",
          "2025-05-09 Rent",
          "2025-05-12 Gym",
          "2025-05-19 Gym",
          "2025-05-23 Rent",
          "2025-05-24 Spotify",
          "2025-05-25 Netflix",
          "2025-05-26 Gym",
          "2025-05-26 Electricity",
          "2025-05-27 Card repayment",
          "2025-05-28 Car loan",
          "2025-05-31 Phone",
        ],
      }
    `)
  })

  it('due-soon Regulars', () => {
    expect(getDueSoonCharges()).toMatchInlineSnapshot(`
      [
        {
          "amount": 1299,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "EXPENSE",
          "frequency": "MONTHLY",
          "id": 14,
          "is_reserved": 0,
          "linked_manual_account_id": null,
          "match_description": null,
          "name": "Spotify",
          "next_charge_date": "2025-02-24",
          "reminder_days_before": 1,
        },
        {
          "amount": 1599,
          "cancel_by_date": null,
          "category_id": "tv-and-music",
          "charge_type": "EXPENSE",
          "frequency": "MONTHLY",
          "id": 1,
          "is_reserved": 1,
          "linked_manual_account_id": null,
          "match_description": "NETFLIX.COM",
          "name": "Netflix",
          "next_charge_date": "2025-02-25",
          "reminder_days_before": 5,
        },
        {
          "amount": 18000,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "EXPENSE",
          "frequency": "MONTHLY",
          "id": 11,
          "is_reserved": 1,
          "linked_manual_account_id": null,
          "match_description": "POWERCO",
          "name": "Electricity",
          "next_charge_date": "2025-02-26",
          "reminder_days_before": 5,
        },
        {
          "amount": 80000,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "EXPENSE",
          "frequency": "FORTNIGHTLY",
          "id": 3,
          "is_reserved": 1,
          "linked_manual_account_id": null,
          "match_description": null,
          "name": "Rent",
          "next_charge_date": "2025-02-28",
          "reminder_days_before": 7,
        },
        {
          "amount": 4500,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "EXPENSE",
          "frequency": "MONTHLY",
          "id": 6,
          "is_reserved": 1,
          "linked_manual_account_id": null,
          "match_description": null,
          "name": "Phone",
          "next_charge_date": "2025-02-28",
          "reminder_days_before": 10,
        },
      ]
    `)
  })

  it('linked liability repayments (#19 set, stored rows)', () => {
    expect(getLinkedLiabilityRepaymentCharges()).toMatchInlineSnapshot(`
      [
        {
          "amount": 45000,
          "cancel_by_date": null,
          "category_id": null,
          "charge_type": "LIABILITY_REPAYMENT",
          "frequency": "MONTHLY",
          "id": 12,
          "is_reserved": 1,
          "linked_manual_account_id": 1,
          "match_description": "LOANCO",
          "name": "Car loan",
          "next_charge_date": "2025-01-28",
          "reminder_days_before": 5,
        },
      ]
    `)
  })

  it('by id returns the stored, unprojected date', () => {
    const phone = getUpcomingChargesGrouped().nextPay.find(
      (r) => r.name === 'Phone'
    )!
    expect(getUpcomingChargeById(phone.id)).toMatchInlineSnapshot(`
      {
        "amount": 4500,
        "cancel_by_date": null,
        "category_id": null,
        "charge_type": "EXPENSE",
        "frequency": "MONTHLY",
        "id": 6,
        "is_reserved": 1,
        "linked_manual_account_id": null,
        "match_description": null,
        "name": "Phone",
        "next_charge_date": "2025-01-31",
        "reminder_days_before": 10,
      }
    `)
    expect(getUpcomingChargeById(9999)).toMatchInlineSnapshot(`null`)
  })
})
