/**
 * Regression test for the v36 migration that removes the bank-statement-import
 * feature (2026-07-14). Builds a minimal fixture reproducing what a real,
 * already-migrated (v35) database looked like — one CREDIT_CARD_IMPORT
 * account with imported transactions, plus an Up-side transaction linked to
 * it via the (now-removed) transfer-override mechanism — then runs the
 * current `runMigrations` against it and asserts everything tied to the
 * feature is gone and nothing else is disturbed.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { runMigrations, SCHEMA_VERSION } from './schema'

let SQL: SqlJsStatic

beforeAll(async () => {
  SQL = await initSqlJs()
})

/** Minimal v35-shaped fixture: only the tables the v36 migration touches. */
function buildLegacyV35Database(): Database {
  const db = new SQL.Database()
  db.run(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )
  db.run(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      balance INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      ownership_type TEXT,
      synced_at TEXT,
      is_closed INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.run(`
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      status TEXT,
      description TEXT,
      amount INTEGER NOT NULL,
      category_id TEXT,
      source TEXT NOT NULL DEFAULT 'up'
    )
  `)
  db.run(`
    CREATE TABLE transaction_user_data (
      transaction_id TEXT PRIMARY KEY,
      user_notes TEXT,
      user_category_override TEXT,
      is_income INTEGER DEFAULT 0,
      user_transfer_account_override TEXT
    )
  `)
  db.run(`
    CREATE TABLE merchant_category_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_text TEXT NOT NULL,
      category_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_matched_at TEXT
    )
  `)
  db.run(`
    CREATE TABLE credit_card_statement_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      opening_balance_cents INTEGER NOT NULL,
      closing_balance_cents INTEGER,
      computed_closing_balance_cents INTEGER NOT NULL,
      row_count INTEGER NOT NULL,
      imported_at TEXT NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE statement_import_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_name_pattern TEXT NOT NULL,
      format TEXT NOT NULL,
      date_field_preference TEXT NOT NULL DEFAULT 'transaction',
      credit_marker TEXT NOT NULL DEFAULT 'CR',
      opening_balance_label TEXT NOT NULL DEFAULT 'Opening Balance',
      closing_balance_label TEXT NOT NULL DEFAULT 'Closing Balance',
      date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      csv_column_map TEXT,
      csv_has_header INTEGER,
      csv_match_signature TEXT
    )
  `)

  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '35')`
  )

  // A live Up-synced account, untouched by the migration.
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, is_closed)
     VALUES ('up-checking', 'Everyday', 'TRANSACTIONAL', 500000, '2026-01-01', '2026-01-01', 0)`
  )
  // The manually-created credit-card-import account, with real imported data.
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, is_closed)
     VALUES ('cc-visa', 'Visa Card', 'CREDIT_CARD_IMPORT', -12000, '2026-01-01', '2026-01-01', 0)`
  )
  // A transaction imported from a statement onto the card.
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, source)
     VALUES ('manual:cc-visa:abc123', 'cc-visa', 'SETTLED', 'Coffee Shop', -500, 'manual')`
  )
  // A real Up transaction, untouched by the migration.
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, source)
     VALUES ('up-tx-1', 'up-checking', 'SETTLED', 'Groceries', -8000, 'up')`
  )
  // The Up-side payoff transaction, linked to the card via the override —
  // also carries a real user note, which must survive the migration.
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, source)
     VALUES ('up-tx-2', 'up-checking', 'SETTLED', 'Visa Payment', -20000, 'up')`
  )
  db.run(
    `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override, user_transfer_account_override)
     VALUES ('up-tx-2', 'Paid off the card', NULL, 'cc-visa')`
  )
  // A second payoff link with no note/category of its own — the common case
  // — must be deleted outright rather than left as an empty husk.
  db.run(
    `INSERT INTO transactions (id, account_id, status, description, amount, source)
     VALUES ('up-tx-3', 'up-checking', 'SETTLED', 'Visa Payment 2', -5000, 'up')`
  )
  db.run(
    `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override, user_transfer_account_override)
     VALUES ('up-tx-3', NULL, NULL, 'cc-visa')`
  )
  // Unrelated user data on the untouched Up transaction — must survive.
  db.run(
    `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override, user_transfer_account_override)
     VALUES ('up-tx-1', 'Weekly shop', NULL, NULL)`
  )

  return db
}

describe('v36 migration: bank-statement-import removal', () => {
  it('deletes the CREDIT_CARD_IMPORT account and everything tied to it, drops the dead tables, preserves everything else', () => {
    const db = buildLegacyV35Database()

    runMigrations(db)

    // Schema version is current.
    const versionRow = db.exec(
      `SELECT value FROM app_settings WHERE key = 'schema_version'`
    )
    expect(versionRow[0].values[0][0]).toBe(String(SCHEMA_VERSION))
    expect(SCHEMA_VERSION).toBe(45)

    // The credit-card-import account is gone.
    const ccAccount = db.exec(`SELECT * FROM accounts WHERE id = 'cc-visa'`)
    expect(ccAccount.length).toBe(0)

    // Its imported transaction is gone.
    const ccTx = db.exec(
      `SELECT * FROM transactions WHERE id = 'manual:cc-visa:abc123'`
    )
    expect(ccTx.length).toBe(0)

    // The Up-side payoff transaction itself is NOT deleted (it's a real Up
    // transaction).
    const payoffTx = db.exec(`SELECT * FROM transactions WHERE id = 'up-tx-2'`)
    expect(payoffTx.length).toBe(1)
    // Its user-data row survives (it carries a real note unrelated to the
    // link) — only the transfer-override column/value is gone, not the row.
    const payoffUserData = db.exec(
      `SELECT user_notes FROM transaction_user_data WHERE transaction_id = 'up-tx-2'`
    )
    expect(payoffUserData[0].values[0][0]).toBe('Paid off the card')

    // A payoff link with no other data of its own (the common case) is
    // deleted outright rather than left as an empty husk.
    const emptyLinkUserData = db.exec(
      `SELECT * FROM transaction_user_data WHERE transaction_id = 'up-tx-3'`
    )
    expect(emptyLinkUserData.length).toBe(0)
    // Its transaction row is untouched (it's a real Up transaction).
    const linkTx = db.exec(`SELECT * FROM transactions WHERE id = 'up-tx-3'`)
    expect(linkTx.length).toBe(1)

    // The live Up account and its transaction/user-data are untouched.
    const upAccount = db.exec(`SELECT * FROM accounts WHERE id = 'up-checking'`)
    expect(upAccount[0].values[0][3]).toBe(500000)
    const upTx = db.exec(`SELECT * FROM transactions WHERE id = 'up-tx-1'`)
    expect(upTx.length).toBe(1)
    const upUserData = db.exec(
      `SELECT user_notes FROM transaction_user_data WHERE transaction_id = 'up-tx-1'`
    )
    expect(upUserData[0].values[0][0]).toBe('Weekly shop')

    // The three feature-only tables are gone.
    for (const table of [
      'credit_card_statement_imports',
      'statement_import_profiles',
      'merchant_category_rules',
    ]) {
      const exists = db.exec(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}'`
      )
      expect(exists.length).toBe(0)
    }

    // The transfer-override column itself is dropped from transaction_user_data
    // (as is user_category_override, later, by v43).
    const cols = db.exec(`PRAGMA table_info(transaction_user_data)`)
    const colNames = cols[0].values.map((r) => String(r[1]))
    expect(colNames).not.toContain('user_transfer_account_override')
    expect(colNames).not.toContain('user_category_override')
    expect(colNames).toEqual(
      expect.arrayContaining(['transaction_id', 'user_notes'])
    )

    db.close()
  })

  it('is a no-op on an already-current database (idempotent)', () => {
    const db = buildLegacyV35Database()
    runMigrations(db)
    // Running again against the now-migrated database should not throw.
    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })

  it('does nothing when there is no CREDIT_CARD_IMPORT account at all', () => {
    const db = buildLegacyV35Database()
    db.run(`DELETE FROM transaction_user_data WHERE transaction_id = 'up-tx-2'`)
    db.run(`DELETE FROM transactions WHERE id = 'manual:cc-visa:abc123'`)
    db.run(`DELETE FROM accounts WHERE id = 'cc-visa'`)

    expect(() => runMigrations(db)).not.toThrow()

    const upAccount = db.exec(`SELECT * FROM accounts WHERE id = 'up-checking'`)
    expect(upAccount.length).toBe(1)
    const upTx = db.exec(`SELECT * FROM transactions WHERE id = 'up-tx-1'`)
    expect(upTx.length).toBe(1)

    db.close()
  })
})

/**
 * Minimal v36-shaped fixture: only the tables the v37 migration touches
 * (colour is now fully computed — src/lib/colorSystem.ts — so the stored
 * badge_color/colour columns and the insights_category_colors setting go
 * away).
 */
function buildLegacyV36Database(): Database {
  const db = new SQL.Database()
  db.run(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '36')`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('insights_category_colors', '{"groceries":"#f48fb1"}')`
  )
  db.run(`
    CREATE TABLE trackers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      budget_amount INTEGER NOT NULL,
      reset_frequency TEXT NOT NULL,
      reset_day INTEGER,
      start_date TEXT NOT NULL,
      last_reset_date TEXT NOT NULL,
      next_reset_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      badge_color TEXT,
      bucket_id INTEGER
    )
  `)
  db.run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at, badge_color, bucket_id)
     VALUES ('Groceries', 20000, 'WEEKLY', NULL, '2026-01-01', '2026-01-01', '2026-01-08', 1, '2026-01-01', '#f48fb1', NULL)`
  )
  db.run(`
    CREATE TABLE budget_buckets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      colour TEXT NOT NULL DEFAULT 'sky',
      icon TEXT NOT NULL DEFAULT 'mdi-wallet',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `)
  db.run(
    `INSERT INTO budget_buckets (name, colour, icon, sort_order, created_at)
     VALUES ('Bills', 'mint', 'mdi-home', 0, '2026-01-01')`
  )
  return db
}

describe('v37 migration: computed colour system', () => {
  it('drops badge_color and colour columns, deletes the stored category-colour setting, preserves everything else', () => {
    const db = buildLegacyV36Database()

    runMigrations(db)

    const versionRow = db.exec(
      `SELECT value FROM app_settings WHERE key = 'schema_version'`
    )
    expect(versionRow[0].values[0][0]).toBe(String(SCHEMA_VERSION))

    const trackerCols = db.exec(`PRAGMA table_info(trackers)`)
    const trackerColNames = trackerCols[0].values.map((r) => String(r[1]))
    expect(trackerColNames).not.toContain('badge_color')
    expect(trackerColNames).toEqual(
      expect.arrayContaining(['id', 'name', 'reset_frequency', 'bucket_id'])
    )

    const bucketCols = db.exec(`PRAGMA table_info(budget_buckets)`)
    const bucketColNames = bucketCols[0].values.map((r) => String(r[1]))
    expect(bucketColNames).not.toContain('colour')
    expect(bucketColNames).toEqual(
      expect.arrayContaining(['id', 'name', 'icon', 'sort_order'])
    )

    const storedColourSetting = db.exec(
      `SELECT 1 FROM app_settings WHERE key = 'insights_category_colors'`
    )
    expect(storedColourSetting.length).toBe(0)

    // Existing tracker/bucket rows survive the column drop, other columns intact.
    const tracker = db.exec(`SELECT name, reset_frequency FROM trackers`)
    expect(tracker[0].values[0]).toEqual(['Groceries', 'WEEKLY'])
    const bucket = db.exec(`SELECT name, icon FROM budget_buckets`)
    expect(bucket[0].values[0]).toEqual(['Bills', 'mdi-home'])

    db.close()
  })

  it('is a no-op on an already-current database (idempotent)', () => {
    const db = buildLegacyV36Database()
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })
})

/**
 * Minimal v37-shaped fixture for the v38 migration, which touches only
 * `app_settings`: it collapses the two-floor Spendable alert (a dollar amount
 * plus a % of pay, reconciled with max()) to a single mode by zeroing whichever
 * floor was NOT the effective (higher) one at migration time.
 */
function buildLegacyV37Database(settings: Record<string, string>): Database {
  const db = new SQL.Database()
  db.run(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '37')`
  )
  for (const [key, value] of Object.entries(settings)) {
    db.run(`INSERT INTO app_settings (key, value) VALUES (?, ?)`, [key, value])
  }
  return db
}

function readSetting(db: Database, key: string): string | null {
  const res = db.exec(`SELECT value FROM app_settings WHERE key = ?`, [key])
  const v = res[0]?.values?.[0]?.[0]
  return v != null ? String(v) : null
}

describe('v38 migration: collapse the Spendable alert to a single floor', () => {
  it('zeros the dollar floor when the % of pay floor was the higher (effective) one', () => {
    // pay 5000.00, 50% => 2500.00 pct floor > 1000.00 dollar floor
    const db = buildLegacyV37Database({
      pay_amount_cents: '500000',
      spendable_alert_below_cents: '100000',
      spendable_alert_below_pct_pay: '50',
    })

    runMigrations(db)

    expect(readSetting(db, 'schema_version')).toBe(String(SCHEMA_VERSION))
    expect(readSetting(db, 'spendable_alert_below_cents')).toBe('0')
    expect(readSetting(db, 'spendable_alert_below_pct_pay')).toBe('50')

    db.close()
  })

  it('zeros the % of pay floor when the dollar floor was the higher (effective) one', () => {
    // pay 5000.00, 50% => 2500.00 pct floor < 3000.00 dollar floor
    const db = buildLegacyV37Database({
      pay_amount_cents: '500000',
      spendable_alert_below_cents: '300000',
      spendable_alert_below_pct_pay: '50',
    })

    runMigrations(db)

    expect(readSetting(db, 'spendable_alert_below_cents')).toBe('300000')
    expect(readSetting(db, 'spendable_alert_below_pct_pay')).toBe('0')

    db.close()
  })

  it('keeps the dollar floor on a tie', () => {
    // pay 5000.00, 50% => 2500.00 pct floor == 2500.00 dollar floor
    const db = buildLegacyV37Database({
      pay_amount_cents: '500000',
      spendable_alert_below_cents: '250000',
      spendable_alert_below_pct_pay: '50',
    })

    runMigrations(db)

    expect(readSetting(db, 'spendable_alert_below_cents')).toBe('250000')
    expect(readSetting(db, 'spendable_alert_below_pct_pay')).toBe('0')

    db.close()
  })

  it('keeps the dollar floor when there is no pay amount to evaluate the % floor against', () => {
    const db = buildLegacyV37Database({
      spendable_alert_below_cents: '100000',
      spendable_alert_below_pct_pay: '50',
    })

    runMigrations(db)

    expect(readSetting(db, 'spendable_alert_below_cents')).toBe('100000')
    expect(readSetting(db, 'spendable_alert_below_pct_pay')).toBe('0')

    db.close()
  })

  it('leaves a single configured floor untouched', () => {
    const dollarsOnly = buildLegacyV37Database({
      spendable_alert_below_cents: '150000',
      spendable_alert_below_pct_pay: '0',
    })
    runMigrations(dollarsOnly)
    expect(readSetting(dollarsOnly, 'spendable_alert_below_cents')).toBe(
      '150000'
    )
    expect(readSetting(dollarsOnly, 'spendable_alert_below_pct_pay')).toBe('0')
    dollarsOnly.close()

    const pctOnly = buildLegacyV37Database({
      pay_amount_cents: '500000',
      spendable_alert_below_cents: '0',
      spendable_alert_below_pct_pay: '25',
    })
    runMigrations(pctOnly)
    expect(readSetting(pctOnly, 'spendable_alert_below_cents')).toBe('0')
    expect(readSetting(pctOnly, 'spendable_alert_below_pct_pay')).toBe('25')
    pctOnly.close()
  })

  it('is a no-op (beyond the version bump) when no alert is configured, and is idempotent', () => {
    const db = buildLegacyV37Database({})
    expect(() => runMigrations(db)).not.toThrow()
    expect(readSetting(db, 'schema_version')).toBe(String(SCHEMA_VERSION))
    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })
})

/**
 * Minimal v38-shaped fixture for the v39 migration, which drops the dead
 * `upcoming_charges.is_subscription` column (nothing ever read it; both CRUD
 * paths hardcoded 0). Only the one table the migration touches is created.
 */
function buildLegacyV38Database(): Database {
  const db = new SQL.Database()
  db.run(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '38')`
  )
  db.run(`
    CREATE TABLE upcoming_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      frequency TEXT NOT NULL,
      next_charge_date TEXT NOT NULL,
      category_id TEXT,
      is_reserved INTEGER DEFAULT 1,
      reminder_days_before INTEGER,
      is_subscription INTEGER DEFAULT 0,
      cancel_by_date TEXT,
      created_at TEXT NOT NULL,
      bucket_id INTEGER,
      charge_type TEXT NOT NULL DEFAULT 'EXPENSE',
      linked_manual_account_id INTEGER,
      match_raw_text TEXT
    )
  `)
  db.run(
    `INSERT INTO upcoming_charges
       (name, amount, frequency, next_charge_date, is_reserved, reminder_days_before, is_subscription, created_at, charge_type)
     VALUES ('Netflix', 1999, 'MONTHLY', '2026-02-01', 1, 3, 1, '2026-01-01', 'EXPENSE')`
  )
  return db
}

describe('v39 migration: drop dead is_subscription column', () => {
  it('drops the column and preserves every other value on existing rows', () => {
    const db = buildLegacyV38Database()

    runMigrations(db)

    expect(readSetting(db, 'schema_version')).toBe(String(SCHEMA_VERSION))

    const cols = db.exec(`PRAGMA table_info(upcoming_charges)`)
    const colNames = cols[0].values.map((r) => String(r[1]))
    expect(colNames).not.toContain('is_subscription')
    expect(colNames).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'amount',
        'frequency',
        'next_charge_date',
        'reminder_days_before',
        'cancel_by_date',
        'charge_type',
        'match_raw_text',
      ])
    )

    const row = db.exec(
      `SELECT name, amount, frequency, next_charge_date, is_reserved, reminder_days_before, charge_type FROM upcoming_charges`
    )
    expect(row[0].values[0]).toEqual([
      'Netflix',
      1999,
      'MONTHLY',
      '2026-02-01',
      1,
      3,
      'EXPENSE',
    ])

    db.close()
  })

  it('is a no-op when the column is already gone, and is idempotent', () => {
    const db = buildLegacyV38Database()
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })
})

/**
 * Minimal v39-shaped fixture for the v40 migration (#16 tracker config-history).
 * The migration creates two tables and backfills one genesis config row per
 * tracker, anchored at its current period start and holding its current budget
 * and categories.
 */
function buildLegacyV39Database(): Database {
  const db = new SQL.Database()
  db.run(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '39')`
  )
  db.run(`
    CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT)
  `)
  db.run(`INSERT INTO categories (id, name) VALUES ('groceries', 'Groceries')`)
  db.run(`INSERT INTO categories (id, name) VALUES ('dining', 'Dining')`)
  db.run(`
    CREATE TABLE trackers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      budget_amount INTEGER NOT NULL,
      reset_frequency TEXT NOT NULL,
      reset_day INTEGER,
      start_date TEXT NOT NULL,
      last_reset_date TEXT NOT NULL,
      next_reset_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      bucket_id INTEGER
    )
  `)
  db.run(`
    CREATE TABLE tracker_categories (
      tracker_id INTEGER NOT NULL,
      category_id TEXT NOT NULL,
      PRIMARY KEY (tracker_id, category_id)
    )
  `)
  db.run(
    `INSERT INTO trackers (name, budget_amount, reset_frequency, reset_day, start_date, last_reset_date, next_reset_date, is_active, created_at)
     VALUES ('Food', 30000, 'WEEKLY', 1, '2026-01-05', '2026-02-02', '2026-02-09', 1, '2026-01-05')`
  )
  db.run(
    `INSERT INTO tracker_categories (tracker_id, category_id) VALUES (1, 'groceries')`
  )
  db.run(
    `INSERT INTO tracker_categories (tracker_id, category_id) VALUES (1, 'dining')`
  )
  return db
}

describe('v40 migration: tracker config-history', () => {
  it('creates the tables and backfills a genesis config row per tracker', () => {
    const db = buildLegacyV39Database()

    runMigrations(db)

    expect(readSetting(db, 'schema_version')).toBe(String(SCHEMA_VERSION))

    const config = db.exec(
      `SELECT tracker_id, effective_from, budget_amount FROM tracker_config_history`
    )
    expect(config[0].values).toEqual([[1, '2026-02-02', 30000]])

    const configId = Number(
      db.exec(`SELECT id FROM tracker_config_history`)[0].values[0][0]
    )
    const cats = db.exec(
      `SELECT category_id FROM tracker_config_history_categories WHERE config_id = ? ORDER BY category_id`,
      [configId]
    )
    expect(cats[0].values.map((r) => String(r[0]))).toEqual([
      'dining',
      'groceries',
    ])

    db.close()
  })

  it('is idempotent — a second run adds no further genesis rows', () => {
    const db = buildLegacyV39Database()
    runMigrations(db)
    const countAfterFirst = Number(
      db.exec(`SELECT COUNT(*) FROM tracker_config_history`)[0].values[0][0]
    )
    expect(() => runMigrations(db)).not.toThrow()
    const countAfterSecond = Number(
      db.exec(`SELECT COUNT(*) FROM tracker_config_history`)[0].values[0][0]
    )
    expect(countAfterSecond).toBe(countAfterFirst)
    db.close()
  })
})

/**
 * Minimal v40-shaped fixture for the v41 migration, which drops the dead
 * `transaction_user_data.is_income` column (#26 — no "mark as income" UI ever
 * read or wrote it). Carries the soon-to-be-dropped column and one populated row.
 */
function buildLegacyV40Database(): Database {
  const db = new SQL.Database()
  db.run(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '40')`
  )
  db.run(`
    CREATE TABLE transaction_user_data (
      transaction_id TEXT PRIMARY KEY,
      user_notes TEXT,
      user_category_override TEXT,
      is_income INTEGER DEFAULT 0
    )
  `)
  db.run(
    `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override, is_income)
     VALUES ('tx-1', 'note here', 'groceries', 1)`
  )
  return db
}

describe('v41 migration: drop dead transaction_user_data.is_income column', () => {
  it('drops the column and preserves every other value on existing rows', () => {
    const db = buildLegacyV40Database()

    runMigrations(db)

    expect(readSetting(db, 'schema_version')).toBe(String(SCHEMA_VERSION))

    const cols = db.exec(`PRAGMA table_info(transaction_user_data)`)
    const colNames = cols[0].values.map((r) => String(r[1]))
    expect(colNames).not.toContain('is_income')
    // user_category_override is also gone by the time migrations finish (v43).
    expect(colNames).not.toContain('user_category_override')
    expect(colNames).toEqual(
      expect.arrayContaining(['transaction_id', 'user_notes'])
    )

    const row = db.exec(
      `SELECT transaction_id, user_notes FROM transaction_user_data`
    )
    expect(row[0].values[0]).toEqual(['tx-1', 'note here'])

    db.close()
  })

  it('is a no-op when the column is already gone, and is idempotent', () => {
    const db = buildLegacyV40Database()
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })
})

/**
 * Minimal v41-shaped fixture for the v42 migration, which drops the dead
 * `accounts.monthly_deposit_target_cents` column (#28 — read into AccountRow but
 * sync never wrote it and no UI surfaced it). Carries the column and one row.
 */
function buildLegacyV41Database(): Database {
  const db = new SQL.Database()
  db.run(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '41')`
  )
  db.run(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      balance INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_closed INTEGER NOT NULL DEFAULT 0,
      target_amount_cents INTEGER,
      monthly_deposit_target_cents INTEGER
    )
  `)
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, target_amount_cents, monthly_deposit_target_cents)
     VALUES ('sav-1', 'Holiday', 'SAVER', 500000, '2026-01-01', '2026-01-01', 1000000, 20000)`
  )
  return db
}

describe('v42 migration: drop dead accounts.monthly_deposit_target_cents column', () => {
  it('drops the column and preserves every other value on existing rows', () => {
    const db = buildLegacyV41Database()

    runMigrations(db)

    expect(readSetting(db, 'schema_version')).toBe(String(SCHEMA_VERSION))

    const cols = db.exec(`PRAGMA table_info(accounts)`)
    const colNames = cols[0].values.map((r) => String(r[1]))
    expect(colNames).not.toContain('monthly_deposit_target_cents')
    expect(colNames).toContain('target_amount_cents')

    const row = db.exec(
      `SELECT id, display_name, balance, target_amount_cents FROM accounts`
    )
    expect(row[0].values[0]).toEqual(['sav-1', 'Holiday', 500000, 1000000])

    db.close()
  })

  it('is a no-op when the column is already gone, and is idempotent', () => {
    const db = buildLegacyV41Database()
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })
})

/**
 * Minimal v42-shaped fixture for the v43 migration, which drops the dead
 * `transaction_user_data.user_category_override` column (#27 — displayed but
 * never written by the app and never flowed through any category-keyed query).
 * Carries the column plus a note-bearing row and an override-only row.
 */
function buildLegacyV42Database(): Database {
  const db = new SQL.Database()
  db.run(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '42')`
  )
  db.run(`
    CREATE TABLE transaction_user_data (
      transaction_id TEXT PRIMARY KEY,
      user_notes TEXT,
      user_category_override TEXT
    )
  `)
  db.run(
    `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override)
     VALUES ('tx-note', 'keep this note', 'groceries')`
  )
  db.run(
    `INSERT INTO transaction_user_data (transaction_id, user_notes, user_category_override)
     VALUES ('tx-override-only', NULL, 'rent')`
  )
  return db
}

describe('v43 migration: drop dead transaction_user_data.user_category_override column', () => {
  it('drops the column, keeps note-bearing rows, and clears rows that only held an override', () => {
    const db = buildLegacyV42Database()

    runMigrations(db)

    expect(readSetting(db, 'schema_version')).toBe(String(SCHEMA_VERSION))

    const cols = db.exec(`PRAGMA table_info(transaction_user_data)`)
    const colNames = cols[0].values.map((r) => String(r[1]))
    expect(colNames).not.toContain('user_category_override')
    expect(colNames).toEqual(
      expect.arrayContaining(['transaction_id', 'user_notes'])
    )

    // The note row survives with its note intact.
    const kept = db.exec(
      `SELECT transaction_id, user_notes FROM transaction_user_data`
    )
    expect(kept[0].values).toEqual([['tx-note', 'keep this note']])

    db.close()
  })

  it('is a no-op when the column is already gone, and is idempotent', () => {
    const db = buildLegacyV42Database()
    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })
})

/**
 * Minimal v43-shaped fixture for the v44 migration (#29 — saver goal history).
 * Carries an accounts table with target_amount_cents, three savers (one goal
 * already met, one goal not met, one with no goal) and a saver_goal_date_* key.
 */
function buildLegacyV43Database(): Database {
  const db = new SQL.Database()
  db.run(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '43')`
  )
  db.run(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      balance INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_closed INTEGER NOT NULL DEFAULT 0,
      target_amount_cents INTEGER
    )
  `)
  db.run(
    `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at, target_amount_cents) VALUES
      ('sav-met', 'Annual bills', 'SAVER', 500000, '2026-01-01', '2026-01-01', 400000),
      ('sav-open', 'Holiday', 'SAVER', 100000, '2026-01-01', '2026-01-01', 800000),
      ('sav-none', 'Buffer', 'SAVER', 20000, '2026-01-01', '2026-01-01', NULL),
      ('txn-1', 'Everyday', 'TRANSACTIONAL', 300000, '2026-01-01', '2026-01-01', NULL)`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('saver_goal_date_sav-met', '2026-06-01')`
  )
  return db
}

describe('v44 migration: saver goal history', () => {
  it('backfills a genesis row per goal, stamps achieved_at, folds in the goal date, and drops saver_goal_date_*', () => {
    const db = buildLegacyV43Database()

    runMigrations(db)

    expect(readSetting(db, 'schema_version')).toBe(String(SCHEMA_VERSION))

    const rows = db.exec(
      `SELECT saver_id, goal_amount_cents, goal_date, achieved_at, archived_at
       FROM saver_goal_history ORDER BY saver_id`
    )
    // Only the two savers with a goal get a row; the transactional account never does.
    expect(rows[0].values.map((r) => r[0])).toEqual(['sav-met', 'sav-open'])

    const met = rows[0].values[0]
    expect(met[1]).toBe(400000)
    expect(met[2]).toBe('2026-06-01') // goal date folded in
    expect(met[3]).not.toBeNull() // achieved_at stamped — balance 500k >= 400k
    expect(met[4]).toBeNull()

    const open = rows[0].values[1]
    expect(open[1]).toBe(800000)
    expect(open[2]).toBeNull()
    expect(open[3]).toBeNull() // balance 100k < 800k
    expect(open[4]).toBeNull()

    // The retired dynamic key is gone; target_amount_cents stays as the mirror.
    expect(readSetting(db, 'saver_goal_date_sav-met')).toBeNull()
    const acct = db.exec(
      `SELECT target_amount_cents FROM accounts WHERE id = 'sav-met'`
    )
    expect(acct[0].values[0][0]).toBe(400000)

    db.close()
  })

  it('is a no-op when no saver has a goal, and is idempotent', () => {
    const db = new SQL.Database()
    db.run(
      `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
    )
    db.run(
      `INSERT INTO app_settings (key, value) VALUES ('schema_version', '43')`
    )
    db.run(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY, display_name TEXT NOT NULL, account_type TEXT NOT NULL,
        balance INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        is_closed INTEGER NOT NULL DEFAULT 0, target_amount_cents INTEGER
      )
    `)
    db.run(
      `INSERT INTO accounts (id, display_name, account_type, balance, created_at, updated_at)
       VALUES ('sav-none', 'Buffer', 'SAVER', 20000, '2026-01-01', '2026-01-01')`
    )

    runMigrations(db)
    const rows = db.exec(`SELECT COUNT(*) FROM saver_goal_history`)
    expect(rows[0].values[0][0]).toBe(0)
    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })
})

/**
 * Minimal v44-shaped fixture for the v45 migration (#38 — frequency-through-history):
 * `tracker_config_history` without the new `reset_frequency` column, one row.
 */
function buildLegacyV44Database(): Database {
  const db = new SQL.Database()
  db.run(
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  )
  db.run(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', '44')`
  )
  db.run(`
    CREATE TABLE tracker_config_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracker_id INTEGER NOT NULL,
      effective_from TEXT NOT NULL,
      budget_amount INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  db.run(
    `INSERT INTO tracker_config_history (tracker_id, effective_from, budget_amount, created_at)
     VALUES (1, '2026-03-01', 30000, '2026-03-01T00:00:00.000Z')`
  )
  return db
}

describe('v45 migration: tracker_config_history.reset_frequency', () => {
  it('adds the nullable column, leaves existing rows NULL, and is idempotent', () => {
    const db = buildLegacyV44Database()

    runMigrations(db)

    expect(readSetting(db, 'schema_version')).toBe(String(SCHEMA_VERSION))
    const cols = db.exec(`PRAGMA table_info(tracker_config_history)`)
    const colNames = cols[0].values.map((r) => String(r[1]))
    expect(colNames).toContain('reset_frequency')

    const row = db.exec(
      `SELECT budget_amount, reset_frequency FROM tracker_config_history`
    )
    expect(row[0].values[0]).toEqual([30000, null])

    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })
})
