/**
 * Statement import commit pipeline: takes parsed rows (from statementParsing.ts),
 * previews them against merchant category rules and existing transactions, then
 * writes them into the shared `transactions` table on commit.
 */

import { getDb, schedulePersist } from '@/db'
import { getAccountById } from '@/services/accounts'
import { writeNetWorthSnapshot } from '@/services/netWorth'
import {
  getMerchantCategoryRules,
  matchCategoryRule,
  touchMerchantCategoryRule,
} from '@/services/merchantCategoryRules'
import type {
  ParsedStatement,
  ParsedStatementRow,
} from '@/services/statementParsing'

export interface PreviewRow {
  id: string
  date: string
  description: string
  amountCents: number
  balanceCents: number | null
  categoryId: string | null
  autoMatchedRuleId: number | null
  alreadyImported: boolean
}

export interface ImportPreview {
  rows: PreviewRow[]
  detectedBankName: string | null
  openingBalanceCents: number | null
  closingBalanceCents: number | null
}

function djb2Hash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(16)
}

function transactionExists(id: string): boolean {
  const db = getDb()
  if (!db) return false
  const res = db.exec(`SELECT 1 FROM transactions WHERE id = ?`, [id])
  return !!res[0]?.values?.length
}

/** Builds preview rows: deterministic IDs (disambiguated within the batch so
 * identical same-day/same-amount/same-merchant rows don't collide), merchant
 * rule auto-match, and a flag for rows already present from a prior import. */
export function buildImportPreview(
  accountId: string,
  parsed: ParsedStatement
): ImportPreview {
  const rules = getMerchantCategoryRules()
  const seenCounts = new Map<string, number>()

  const rows: PreviewRow[] = parsed.rows.map((row: ParsedStatementRow) => {
    const baseKey = `${row.date}|${row.description}|${row.amountCents}`
    const baseId = `manual:${accountId}:${djb2Hash(baseKey)}`
    const occurrence = seenCounts.get(baseKey) ?? 0
    seenCounts.set(baseKey, occurrence + 1)
    const id = occurrence === 0 ? baseId : `${baseId}:${occurrence}`

    const match = matchCategoryRule(row.description, rules)

    return {
      id,
      date: row.date,
      description: row.description,
      amountCents: row.amountCents,
      balanceCents: row.balanceCents,
      categoryId: match?.category_id ?? null,
      autoMatchedRuleId: match?.id ?? null,
      alreadyImported: transactionExists(id),
    }
  })

  return {
    rows,
    detectedBankName: parsed.detectedBankName,
    openingBalanceCents: parsed.openingBalanceCents,
    closingBalanceCents: parsed.closingBalanceCents,
  }
}

export interface CommitRowInput {
  row: PreviewRow
  included: boolean
  /** Category id chosen/edited by the user in the review screen (null = uncategorized). */
  categoryId: string | null
}

export interface CommitResult {
  insertedCount: number
  computedClosingBalanceCents: number
  statedClosingBalanceCents: number | null
  checksumMismatchCents: number | null
}

/** Inserts reviewed rows into `transactions`, updates the account's running
 * balance, and records the import for history. Saving a merchant rule from a
 * row's category choice is a separate, explicit user action in the review UI
 * (see saveMerchantCategoryRule) — not automatic on commit. */
export function commitImport(
  accountId: string,
  fileName: string,
  rows: CommitRowInput[],
  statedClosingBalanceCents: number | null
): CommitResult {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  const account = getAccountById(accountId)
  if (!account) throw new Error('Account not found')

  const now = new Date().toISOString()
  const openingBalanceForThisImport = account.balance
  let insertedCount = 0
  let netCents = 0

  for (const { row, included, categoryId } of rows) {
    if (!included) continue
    if (transactionExists(row.id)) continue

    db.run(
      `INSERT OR IGNORE INTO transactions (
        id, account_id, status, raw_text, description, message, is_categorizable,
        category_id, parent_category_id, amount, currency, foreign_amount, foreign_currency,
        settled_at, created_at,
        is_round_up, round_up_parent_id, round_up_amount, round_up_boost_portion,
        transfer_account_id, transfer_type,
        note, cashback_description, cashback_amount,
        card_purchase_method, card_number_suffix,
        performing_customer, transaction_type, deep_link_url,
        synced_at, source
      ) VALUES (?, ?, 'SETTLED', NULL, ?, NULL, 1, ?, NULL, ?, 'AUD', NULL, NULL,
        ?, ?, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        NULL, 'manual')`,
      [
        row.id,
        accountId,
        row.description,
        categoryId,
        row.amountCents,
        row.date,
        row.date,
      ]
    )
    insertedCount++
    netCents += row.amountCents

    if (row.autoMatchedRuleId != null) {
      touchMerchantCategoryRule(row.autoMatchedRuleId)
    }
  }

  const newBalance = openingBalanceForThisImport + netCents
  db.run(`UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?`, [
    newBalance,
    now,
    accountId,
  ])

  // credit_card_statement_imports stores amounts owed as positive figures
  // (matching the stated closing balance convention), not the accounts.balance
  // sign convention (negative for debt) — negate both before storing.
  const computedOwedCents = -newBalance
  db.run(
    `INSERT INTO credit_card_statement_imports
       (account_id, file_name, opening_balance_cents, closing_balance_cents,
        computed_closing_balance_cents, row_count, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      accountId,
      fileName,
      -openingBalanceForThisImport,
      statedClosingBalanceCents,
      computedOwedCents,
      insertedCount,
      now,
    ]
  )

  schedulePersist()
  // A statement import changes accounts.balance for a CREDIT_CARD_IMPORT
  // account outside the normal Up sync flow, which is the only other place
  // this gets called — without this, the Net Worth trend chart wouldn't
  // reflect the change until the next Up sync.
  writeNetWorthSnapshot()

  const checksumMismatchCents =
    statedClosingBalanceCents != null
      ? computedOwedCents - statedClosingBalanceCents
      : null

  return {
    insertedCount,
    computedClosingBalanceCents: computedOwedCents,
    statedClosingBalanceCents,
    checksumMismatchCents:
      checksumMismatchCents != null && checksumMismatchCents !== 0
        ? checksumMismatchCents
        : null,
  }
}

export interface StatementImportRecord {
  fileName: string
  rowCount: number
  importedAt: string
  computedClosingBalanceCents: number
  statedClosingBalanceCents: number | null
  checksumMismatchCents: number | null
}

/** Most recent import for an account, for a persistent "does the balance
 * match the statement" indicator (the commit-time toast alone disappears). */
export function getLatestStatementImport(
  accountId: string
): StatementImportRecord | null {
  const db = getDb()
  if (!db) return null
  const stmt = db.prepare(
    `SELECT file_name, row_count, imported_at, computed_closing_balance_cents, closing_balance_cents
     FROM credit_card_statement_imports
     WHERE account_id = ?
     ORDER BY imported_at DESC LIMIT 1`
  )
  stmt.bind([accountId])
  if (!stmt.step()) {
    stmt.free()
    return null
  }
  const [fileName, rowCount, importedAt, computedCents, statedCents] =
    stmt.get() as [string, number, string, number, number | null]
  stmt.free()
  const mismatch = statedCents != null ? computedCents - statedCents : null
  return {
    fileName,
    rowCount,
    importedAt,
    computedClosingBalanceCents: computedCents,
    statedClosingBalanceCents: statedCents,
    checksumMismatchCents: mismatch != null && mismatch !== 0 ? mismatch : null,
  }
}
