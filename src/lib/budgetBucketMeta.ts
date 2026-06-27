import {
  ACCENT_PALETTES,
  PASTEL_SWATCHES,
  type AccentId,
} from '@/lib/accentPalettes'

export { PASTEL_SWATCHES }

/** Resolve the CSS hex colour for a bucket colour id. */
export function bucketColourHex(colour: string): string {
  return ACCENT_PALETTES[colour as AccentId]?.primary ?? '#ce93d8'
}

export interface BucketIconOption {
  icon: string
  label: string
}

export const BUCKET_ICONS: BucketIconOption[] = [
  { icon: 'mdi-wallet', label: 'Wallet' },
  { icon: 'mdi-home', label: 'Home' },
  { icon: 'mdi-food', label: 'Food' },
  { icon: 'mdi-car', label: 'Transport' },
  { icon: 'mdi-television', label: 'Entertainment' },
  { icon: 'mdi-heart-pulse', label: 'Health' },
  { icon: 'mdi-shopping', label: 'Shopping' },
  { icon: 'mdi-refresh', label: 'Subscriptions' },
  { icon: 'mdi-cash', label: 'Money' },
  { icon: 'mdi-school', label: 'Education' },
  { icon: 'mdi-piggy-bank', label: 'Savings' },
  { icon: 'mdi-briefcase', label: 'Work' },
  { icon: 'mdi-airplane', label: 'Travel' },
  { icon: 'mdi-dog', label: 'Pets' },
  { icon: 'mdi-human-child', label: 'Kids' },
  { icon: 'mdi-dumbbell', label: 'Fitness' },
  { icon: 'mdi-lightning-bolt', label: 'Utilities' },
  { icon: 'mdi-shield-check', label: 'Insurance' },
  { icon: 'mdi-receipt', label: 'Bills' },
  { icon: 'mdi-coffee', label: 'Coffee' },
  { icon: 'mdi-cellphone', label: 'Phone' },
  { icon: 'mdi-music', label: 'Music' },
  { icon: 'mdi-bank', label: 'Bank' },
  { icon: 'mdi-star', label: 'Lifestyle' },
]

export const BUDGET_FREQUENCIES: { value: string; label: string }[] = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'FORTNIGHTLY', label: 'Fortnightly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
]

export const BUDGET_DISPLAY_PERIODS: {
  value: 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  label: string
}[] = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
]
