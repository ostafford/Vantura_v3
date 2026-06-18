export const APP_VERSION: string = __APP_VERSION__

const STORAGE_KEY = 'vantura_last_seen_version'

export function getLastSeenVersion(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function markVersionSeen(): void {
  localStorage.setItem(STORAGE_KEY, APP_VERSION)
}

/** True when a prior version was recorded and it differs from the current build. */
export function hasNewVersion(): boolean {
  const last = getLastSeenVersion()
  return last !== null && last !== APP_VERSION
}
