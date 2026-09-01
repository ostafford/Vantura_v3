import { getAppSetting } from '@/db'

/**
 * Read one `app_settings` value and hand it to `parse`, falling back on a
 * missing key, a `null` result, or any thrown error.
 *
 * `parse` owns decoding and validation: it receives the raw stored string and
 * returns the usable value, or `null` to reject it (JSON settings parse and
 * shape-check inside it; plain-string settings just check the string). The
 * helper only supplies the shared scaffold — read the key, treat absent as
 * fallback, and never let a parse/storage error escape.
 *
 * Consolidates the hand-rolled read → validate → fallback blocks that
 * `themeStore` and `sidebarPinsStore` each carried separately.
 */
export function loadValidatedSetting<T>(
  key: string,
  parse: (raw: string) => T | null,
  fallback: T
): T {
  try {
    const raw = getAppSetting(key)
    if (raw == null) return fallback
    const parsed = parse(raw)
    return parsed == null ? fallback : parsed
  } catch {
    return fallback
  }
}
