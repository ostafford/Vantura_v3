import { PAY_FREQUENCY_LABELS, isPayFrequency } from '@/lib/payFrequency'

/** One-line "Current → New" summary of a backup's settings for the import preview. */
export function formatSettingsSummary(
  settings: Record<string, string>
): string {
  if (!settings || Object.keys(settings).length === 0) return 'None'
  const parts: string[] = []
  const freq = settings.payday_frequency
  if (freq) {
    const label = isPayFrequency(freq) ? PAY_FREQUENCY_LABELS[freq] : freq
    parts.push(`${label} pay`)
  }
  return parts.length > 0 ? parts.join(', ') : 'Some settings'
}
