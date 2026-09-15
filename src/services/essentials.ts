/**
 * Essentials Saver nomination (docs/adr/0019-essentials-era-money-model.md).
 * The Up API exposes nothing that distinguishes an Essentials Saver from a
 * growth Saver, so detection is user nomination only, stored as a single
 * nullable app_settings key.
 */

import { getAppSetting, setAppSetting } from '@/db'

const ESSENTIALS_SAVER_ACCOUNT_ID_KEY = 'essentials_saver_account_id'

export function getEssentialsSaverAccountId(): string | null {
  const id = getAppSetting(ESSENTIALS_SAVER_ACCOUNT_ID_KEY)
  return id && id.length > 0 ? id : null
}

export function setEssentialsSaverAccountId(accountId: string | null): void {
  setAppSetting(ESSENTIALS_SAVER_ACCOUNT_ID_KEY, accountId ?? '')
}

export function isEssentialsUser(): boolean {
  return getEssentialsSaverAccountId() !== null
}
