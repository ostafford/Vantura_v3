import { getPaydayDayLabel } from '@/lib/payday'

/** One-line "Current → New" summary of a backup's settings for the import preview. */
export function formatSettingsSummary(
  settings: Record<string, string>
): string {
  if (!settings || Object.keys(settings).length === 0) return 'None'
  const parts: string[] = []
  const freq = settings.payday_frequency
  if (freq) {
    const label =
      freq === 'WEEKLY'
        ? 'Weekly'
        : freq === 'FORTNIGHTLY'
          ? 'Fortnightly'
          : freq === 'MONTHLY'
            ? 'Monthly'
            : freq
    const dayStr = settings.payday_day
    if (dayStr) {
      const dayNum = parseInt(dayStr, 10)
      const dayLabel = Number.isNaN(dayNum)
        ? dayStr
        : getPaydayDayLabel(freq, dayNum)
      parts.push(`${label} payday (${dayLabel})`)
    } else {
      parts.push(`${label} payday`)
    }
  }
  // Changes Spendable on import, so it's called out (decision 6).
  if (settings.essentials_saver_account_id) {
    parts.push('Essentials Saver nominated')
  }
  return parts.length > 0 ? parts.join(', ') : 'Some settings'
}
