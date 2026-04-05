/**
 * Sync orchestration: initial sync and subsequent sync with Up Bank API.
 * Upserts accounts, transactions, categories; recalculates trackers.
 */

import { getDb, setAppSetting, getAppSetting, schedulePersist } from '@/db'
import {
  fetchAccounts,
  fetchAllTransactions,
  fetchCategories,
  type UpAccount,
  type UpTransaction,
  type UpCategory,
} from '@/api/upBank'
/** Return today as YYYY-MM-DD for date-only comparison. */
function todayDateString(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

/**
 * If stored next_payday is in the past, advance it using payday_frequency and payday_day.
 * Call on app init and at start of each sync so PAYDAY trackers and reserved amount use current value.
 */
export function advanceNextPaydayIfNeeded(): void {
  const nextPayday = getAppSetting('next_payday')
  const frequency = getAppSetting('payday_frequency')
  const dayStr = getAppSetting('payday_day')
  if (!nextPayday || !frequency) return
  const today = todayDateString()
  if (today < nextPayday) return

  const paydayDay = dayStr ? parseInt(dayStr, 10) : 1
  const current = new Date(nextPayday + 'T12:00:00Z')
  let next: Date
  if (frequency === 'WEEKLY') {
    next = new Date(current)
    next.setUTCDate(next.getUTCDate() + 7)
  } else if (frequency === 'FORTNIGHTLY') {
    next = new Date(current)
    next.setUTCDate(next.getUTCDate() + 14)
  } else if (frequency === 'MONTHLY') {
    next = new Date(current)
    next.setUTCMonth(next.getUTCMonth() + 1)
    if (paydayDay >= 1 && paydayDay <= 28) next.setUTCDate(paydayDay)
  } else {
    return
  }
  const nextStr = next.toISOString().slice(0, 10)
  setAppSetting('next_payday', nextStr)
}

export type SyncProgress = {
  phase: 'accounts' | 'transactions' | 'categories' | 'done'
  fetched?: number
  hasMore?: boolean
}

/** User-visible status line for Settings / toast during full or incremental sync. */
export function formatSyncProgressMessage(p: SyncProgress): string {
  if (p.phase === 'done') return 'Complete.'
  if (p.phase === 'transactions' && p.fetched != null) {
    return `Fetched ${p.fetched} transactions…`
  }
  return `Syncing ${p.phase}…`
}

function run(sql: string, params: (string | number | null)[] = []): void {
  const db = getDb()
  if (!db) throw new Error('Database not ready')
  db.run(sql, params)
  schedulePersist()
}

function upsertAccount(acc: UpAccount): void {
  const a = acc.attributes
  const balance = a.balance?.valueInBaseUnits ?? 0
  const now = new Date().toISOString()
  const ownership = a.ownershipType != null ? String(a.ownershipType) : null
  run(
    `INSERT OR REPLACE INTO accounts (id, display_name, account_type, balance, created_at, updated_at, ownership_type, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      acc.id,
      a.displayName ?? '',
      a.accountType ?? 'TRANSACTIONAL',
      balance,
      a.createdAt ?? now,
      now,
      ownership,
      now,
    ]
  )
}

function upsertTransaction(tx: UpTransaction): void {
  const a = tx.attributes
  const rel = tx.relationships
  const accountId = rel?.account?.data?.id ?? ''
  const categoryId = rel?.category?.data?.id ?? null
  const parentCategoryId = rel?.parentCategory?.data?.id ?? null
  const amount = a.amount?.valueInBaseUnits ?? 0
  const transferAccountId =
    amount < 0 && a.roundUp != null
      ? null
      : (rel?.transferAccount?.data?.id ?? null)
  const isRoundUp = a.roundUp != null ? 1 : 0
  const roundUpParentId: string | null = null
  const roundUpAmount =
    a.roundUp?.amount?.valueInBaseUnits != null
      ? a.roundUp.amount.valueInBaseUnits
      : null
  run(
    `INSERT OR REPLACE INTO transactions (
      id, account_id, status, raw_text, description, message, is_categorizable,
      category_id, parent_category_id, amount, currency, settled_at, created_at,
      is_round_up, round_up_parent_id, transfer_account_id, transfer_type, synced_at,
      round_up_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tx.id,
      accountId,
      a.status ?? 'SETTLED',
      a.rawText ?? null,
      a.description ?? '',
      a.message ?? null,
      a.isCategorizable !== false ? 1 : 0,
      categoryId,
      parentCategoryId,
      amount,
      a.amount?.currencyCode ?? 'AUD',
      a.settledAt ?? null,
      a.createdAt ?? new Date().toISOString(),
      isRoundUp,
      roundUpParentId,
      transferAccountId,
      null,
      new Date().toISOString(),
      roundUpAmount,
    ]
  )
}

function upsertCategory(cat: UpCategory): void {
  const parentData = cat.relationships?.parent?.data
  const parentId =
    parentData && typeof parentData === 'object' && 'id' in parentData
      ? (parentData as { id: string }).id
      : null
  run(
    `INSERT OR REPLACE INTO categories (id, name, parent_id) VALUES (?, ?, ?)`,
    [cat.id, cat.attributes?.name ?? cat.id, parentId]
  )
}

/**
 * Advance tracker reset dates where current time >= next_reset_date.
 * For PAYDAY frequency use app_settings next_payday.
 */
export function recalculateTrackers(): void {
  const db = getDb()
  if (!db) return
  const now = new Date().toISOString()
  const nextPayday = getAppSetting('next_payday')
  const stmt = db.prepare(
    `SELECT id, reset_frequency, next_reset_date FROM trackers WHERE is_active = 1`
  )
  while (stmt.step()) {
    const row = stmt.get()
    const id = row[0]
    const freq = row[1]
    const nextReset = row[2] as string
    if (!nextReset || now < nextReset) continue
    if (freq === 'PAYDAY' && nextPayday) {
      const nextPaydayNorm =
        nextPayday.length > 10 ? nextPayday.slice(0, 10) : nextPayday
      db.run(
        `UPDATE trackers SET last_reset_date = next_reset_date, next_reset_date = ? WHERE id = ?`,
        [nextPaydayNorm, id]
      )
    } else {
      const prev = new Date(nextReset)
      let next: Date
      if (freq === 'WEEKLY')
        next = new Date(prev.getTime() + 7 * 24 * 60 * 60 * 1000)
      else if (freq === 'FORTNIGHTLY')
        next = new Date(prev.getTime() + 14 * 24 * 60 * 60 * 1000)
      else if (freq === 'MONTHLY') {
        next = new Date(prev)
        next.setMonth(next.getMonth() + 1)
      } else {
        next = prev
      }
      const lastNorm =
        nextReset.length >= 10 ? nextReset.slice(0, 10) : nextReset
      const nextNorm = next.toISOString().slice(0, 10)
      db.run(
        `UPDATE trackers SET last_reset_date = ?, next_reset_date = ? WHERE id = ?`,
        [lastNorm, nextNorm, id]
      )
    }
    schedulePersist()
  }
  stmt.free()
}

/**
 * Perform initial sync: accounts, transactions, categories; set last_sync and onboarding_complete.
 * Caller must have already stored encrypted token and salt (onboarding step 3).
 */
export async function performInitialSync(
  apiToken: string,
  progressCallback: (p: SyncProgress) => void
): Promise<void> {
  progressCallback({ phase: 'accounts' })
  const accounts = await fetchAccounts(apiToken)
  for (const a of accounts) upsertAccount(a)
  progressCallback({ phase: 'transactions', fetched: 0, hasMore: true })
  await fetchAllTransactions(apiToken, null, (p) => {
    progressCallback({
      phase: 'transactions',
      fetched: p.fetched,
      hasMore: p.hasMore,
    })
  }).then((txs) => {
    for (const tx of txs) upsertTransaction(tx)
  })
  progressCallback({ phase: 'categories' })
  const categories = await fetchCategories(apiToken)
  for (const c of categories) upsertCategory(c)
  setAppSetting('last_sync', new Date().toISOString())
  setAppSetting('onboarding_complete', '1')
  progressCallback({ phase: 'done' })
}

/**
 * Subsequent sync: fetch accounts, transactions since last_sync, recalculate trackers.
 */
export async function performSync(
  apiToken: string,
  progressCallback: (p: SyncProgress) => void
): Promise<void> {
  advanceNextPaydayIfNeeded()
  progressCallback({ phase: 'accounts' })
  const accounts = await fetchAccounts(apiToken)
  for (const a of accounts) upsertAccount(a)
  const sinceDate = getAppSetting('last_sync')
  progressCallback({ phase: 'transactions', fetched: 0, hasMore: true })
  await fetchAllTransactions(apiToken, sinceDate, (p) => {
    progressCallback({
      phase: 'transactions',
      fetched: p.fetched,
      hasMore: p.hasMore,
    })
  }).then((txs) => {
    for (const tx of txs) upsertTransaction(tx)
  })
  progressCallback({ phase: 'categories' })
  const categories = await fetchCategories(apiToken)
  for (const c of categories) upsertCategory(c)
  setAppSetting('last_sync', new Date().toISOString())
  recalculateTrackers()
  progressCallback({ phase: 'done' })
}

/**
 * Full re-sync: same as performSync but fetches ALL transactions (no filter[since]).
 * Use when category changes or other edits made in Up Bank app need to be reflected.
 * Slower than incremental sync; intended for occasional use via Settings Re-sync.
 */
export async function performFullSync(
  apiToken: string,
  progressCallback: (p: SyncProgress) => void
): Promise<void> {
  advanceNextPaydayIfNeeded()
  progressCallback({ phase: 'accounts' })
  const accounts = await fetchAccounts(apiToken)
  for (const a of accounts) upsertAccount(a)
  progressCallback({ phase: 'transactions', fetched: 0, hasMore: true })
  await fetchAllTransactions(apiToken, null, (p) => {
    progressCallback({
      phase: 'transactions',
      fetched: p.fetched,
      hasMore: p.hasMore,
    })
  }).then((txs) => {
    for (const tx of txs) upsertTransaction(tx)
  })
  progressCallback({ phase: 'categories' })
  const categories = await fetchCategories(apiToken)
  for (const c of categories) upsertCategory(c)
  setAppSetting('last_sync', new Date().toISOString())
  recalculateTrackers()
  progressCallback({ phase: 'done' })
}
