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
    expect(SCHEMA_VERSION).toBe(38)

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

    // The transfer-override column itself is dropped from transaction_user_data.
    const cols = db.exec(`PRAGMA table_info(transaction_user_data)`)
    const colNames = cols[0].values.map((r) => String(r[1]))
    expect(colNames).not.toContain('user_transfer_account_override')
    expect(colNames).toEqual(
      expect.arrayContaining([
        'transaction_id',
        'user_notes',
        'user_category_override',
      ])
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
