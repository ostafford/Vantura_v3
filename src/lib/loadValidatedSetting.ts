import { getAppSetting } from '@/db'

/**
 * Read one `app_settings` value, validate it, and fall back on
 * missing / invalid / thrown.
 *
 * The stored string is JSON-parsed when it can be (so JSON-encoded settings
 * like `sidebar_pins` reach `validate` as the decoded value), and handed over
 * as the raw string when it can't (so plain-string settings like `theme_mode`
 * reach `validate` unchanged). `validate` is the single source of truth for
 * what counts as usable; anything it rejects — along with a missing key or any
 * thrown error — yields `fallback`.
 *
 * Consolidates the hand-rolled read → validate → fallback blocks that
 * `themeStore` and `sidebarPinsStore` each carried separately.
 */
export function loadValidatedSetting<T>(
  key: string,
  validate: (value: unknown) => value is T,
  fallback: T
): T {
  try {
    const raw = getAppSetting(key)
    if (raw == null) return fallback

    let candidate: unknown = raw
    try {
      candidate = JSON.parse(raw)
    } catch {
      candidate = raw
    }

    return validate(candidate) ? candidate : fallback
  } catch {
    return fallback
  }
}
