/**
 * Spendable balance: available (transactional accounts) minus reserved upcoming charges.
 * Reserved calculation documented in docs/features/payday-spendable/OVERVIEW.md.
 */

import { getDb, getAppSetting } from '@/db'
import type { PaydayFrequency } from '@/lib/payday'
import { reservedBeforePayday, totalReserved } from './regulars'

export type { PaydayFrequency }

/**
 * Pay amount per pay period (cents) from app_settings. Returns null when not set or invalid.
 */
export function getPayAmountCents(): number | null {
  const raw = getAppSetting('pay_amount_cents')
  if (raw == null || raw === '') return null
  const cents = parseInt(raw, 10)
  return Number.isNaN(cents) || cents < 0 ? null : cents
}

export type SpendableAlertMode = 'dollars' | 'pct'

export interface SpendableAlert {
  /** Which floor the user configured — exactly one is ever active (schema v38+). */
  mode: SpendableAlertMode
  /** Value as entered: integer cents for `dollars`, integer percent 1–100 for `pct`. */
  value: number
  /**
   * Resolved dollar floor in cents, or null for a `pct` alert when no pay amount
   * is set — in that state the alert is dormant (card stays neutral, no notification).
   */
  thresholdCents: number | null
}

/**
 * The single active Spendable low-balance alert, or null when none is configured.
 *
 * Since schema v38 (#14) at most one of the two `app_settings` keys is ever
 * non-zero: a `spendable_alert_below_cents` dollar floor OR a
 * `spendable_alert_below_pct_pay` percent-of-pay floor, never both. This is the
 * single source of truth for the Dashboard card's red state and the
 * `spendable_low` notification. If both keys are somehow non-zero (e.g. a
 * profile imported from a pre-v38 export), the dollar floor wins — matching the
 * migration's tie-break.
 */
export function getSpendableAlert(): SpendableAlert | null {
  const dollarsRaw = getAppSetting('spendable_alert_below_cents')
  const dollars =
    dollarsRaw != null && dollarsRaw !== '' ? parseInt(dollarsRaw, 10) : 0
  if (!Number.isNaN(dollars) && dollars > 0) {
    return { mode: 'dollars', value: dollars, thresholdCents: dollars }
  }

  const pctRaw = getAppSetting('spendable_alert_below_pct_pay')
  const pct = pctRaw != null && pctRaw !== '' ? parseInt(pctRaw, 10) : 0
  if (!Number.isNaN(pct) && pct > 0 && pct <= 100) {
    const payCents = getPayAmountCents()
    return {
      mode: 'pct',
      value: pct,
      thresholdCents:
        payCents != null ? Math.round((payCents * pct) / 100) : null,
    }
  }

  return null
}

/**
 * Sum of absolute amounts (cents) of all HELD (authorised but not yet settled) transactions.
 * Informational only — Up Bank's API account balance already nets these out, so they are
 * NOT deducted from Spendable (doing so would double-count them).
 */
export function getHeldTransactionTotal(): number {
  const db = getDb()
  if (!db) return 0
  const stmt = db.prepare(
    `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions WHERE status = 'HELD' AND amount < 0`
  )
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
}

/**
 * Sum of balances (cents) of all transactional accounts.
 */
export function getAvailableBalance(): number {
  const db = getDb()
  if (!db) return 0
  const stmt = db.prepare(
    `SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE account_type = 'TRANSACTIONAL' AND is_closed = 0`
  )
  stmt.step()
  const row = stmt.get()
  stmt.free()
  return row ? Number(row[0]) : 0
}

/**
 * Reserved (cents): every reserved Regular due before next payday, less the
 * Essentials-funded ones (docs/adr/0019). Calculated in the Regulars module.
 */
export function getReservedAmount(): number {
  return totalReserved(reservedBeforePayday({ excludeEssentialsFunded: true }))
}

/**
 * Spendable = Available - Reserved (cents).
 * Up Bank's API account balance is already the net available balance (holds deducted at source),
 * so subtracting HELD transactions here would double-count them.
 */
export function getSpendableBalance(): number {
  const available = getAvailableBalance()
  const reserved = getReservedAmount()
  return available - reserved
}
