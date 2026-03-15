import { getAppSetting, setAppSetting } from '@/db'

export const DASHBOARD_CARD_HEIGHT_MODE_KEY = 'dashboard_card_height_mode'

export type DashboardCardHeightMode = 'fixed' | 'natural'

const DEFAULT_DASHBOARD_CARD_HEIGHT_MODE: DashboardCardHeightMode = 'fixed'

export function getDashboardCardHeightMode(): DashboardCardHeightMode {
  const raw = getAppSetting(DASHBOARD_CARD_HEIGHT_MODE_KEY)
  if (raw === 'natural' || raw === 'fixed') return raw
  return DEFAULT_DASHBOARD_CARD_HEIGHT_MODE
}

export function setDashboardCardHeightMode(
  mode: DashboardCardHeightMode
): void {
  setAppSetting(DASHBOARD_CARD_HEIGHT_MODE_KEY, mode)
}
