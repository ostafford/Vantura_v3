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

/** True if version string `a` is strictly greater than `b` (semver-style, e.g. "0.0.4" > "0.0.2"). */
export function versionGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}
