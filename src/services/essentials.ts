/**
 * Essentials Saver nomination (docs/adr/0019-essentials-era-money-model.md).
 * The Up API exposes nothing that distinguishes an Essentials Saver from a
 * growth Saver, so detection is user nomination only, stored as a single
 * nullable app_settings key.
 */

import { getAppSetting, setAppSetting } from '@/db'
import { getAccountById } from './accounts'

const ESSENTIALS_SAVER_ACCOUNT_ID_KEY = 'essentials_saver_account_id'

export function getEssentialsSaverAccountId(): string | null {
  const id = getAppSetting(ESSENTIALS_SAVER_ACCOUNT_ID_KEY)
  return id && id.length > 0 ? id : null
}

export function setEssentialsSaverAccountId(accountId: string | null): void {
  setAppSetting(ESSENTIALS_SAVER_ACCOUNT_ID_KEY, accountId ?? '')
}

/**
 * The stored nomination, resolved against the accounts table. A nominated
 * Saver that Up no longer returns (sync marks it `is_closed`) or that has no
 * row at all is `unavailable`: the setting is kept — nothing changes it
 * without the user — but nothing may treat bills as paid from it.
 */
export type EssentialsNomination =
  | { status: 'none' }
  | { status: 'active'; accountId: string }
  | { status: 'unavailable'; accountId: string }

export function getEssentialsNomination(): EssentialsNomination {
  const accountId = getEssentialsSaverAccountId()
  if (!accountId) return { status: 'none' }
  const account = getAccountById(accountId)
  if (!account || account.is_closed === 1) {
    return { status: 'unavailable', accountId }
  }
  return { status: 'active', accountId }
}

/**
 * The nominated Saver's id only while it's usable. Every funding-source
 * decision (Reserved, coverage) goes through this, so an unavailable Saver
 * falls back to the classic formula — Spendable can only go down, never up.
 */
export function getActiveEssentialsSaverAccountId(): string | null {
  const nomination = getEssentialsNomination()
  return nomination.status === 'active' ? nomination.accountId : null
}

export function isEssentialsUser(): boolean {
  return getActiveEssentialsSaverAccountId() !== null
}
