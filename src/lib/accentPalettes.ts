export type AccentId = 'purple' | 'blue' | 'teal' | 'green' | 'amber' | 'rose'

export const CUSTOM_ACCENT_KEY = 'custom_accent_hex'

function adjustHex(hex: string, amount: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return hex
  const clamp = (v: number) => Math.min(255, Math.max(0, v))
  const r = clamp(parseInt(result[1], 16) + amount)
  const g = clamp(parseInt(result[2], 16) + amount)
  const b = clamp(parseInt(result[3], 16) + amount)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Apply a custom hex as the accent, overriding the data-accent CSS rules. */
export function applyCustomAccentHex(hex: string): void {
  document.documentElement.style.setProperty('--vantura-primary', hex)
  document.documentElement.style.setProperty(
    '--vantura-primary-gradient',
    `linear-gradient(to right, ${adjustHex(hex, 40)}, ${adjustHex(hex, -30)})`
  )
}

/** Remove custom accent overrides, letting the data-accent CSS rules take over. */
export function clearCustomAccentHex(): void {
  document.documentElement.style.removeProperty('--vantura-primary')
  document.documentElement.style.removeProperty('--vantura-primary-gradient')
}

export const ACCENT_PALETTES: Record<
  AccentId,
  {
    primary: string
    gradientStart: string
    gradientEnd: string
    chartPalette: [string, string, string]
    label: string
  }
> = {
  purple: {
    primary: '#b66dff',
    gradientStart: '#da8cff',
    gradientEnd: '#9a55ff',
    chartPalette: ['#da8cff', '#b66dff', '#9a55ff'],
    label: 'Purple',
  },
  blue: {
    primary: '#198ae3',
    gradientStart: '#5eb8ff',
    gradientEnd: '#047edf',
    chartPalette: ['#5eb8ff', '#198ae3', '#047edf'],
    label: 'Blue',
  },
  teal: {
    primary: '#1bcfb4',
    gradientStart: '#84d9d2',
    gradientEnd: '#07cdae',
    chartPalette: ['#84d9d2', '#1bcfb4', '#07cdae'],
    label: 'Teal',
  },
  green: {
    primary: '#46c35f',
    gradientStart: '#7dd97d',
    gradientEnd: '#2a9d3a',
    chartPalette: ['#7dd97d', '#46c35f', '#2a9d3a'],
    label: 'Green',
  },
  amber: {
    primary: '#f2a654',
    gradientStart: '#fed89a',
    gradientEnd: '#e08620',
    chartPalette: ['#fed89a', '#f2a654', '#e08620'],
    label: 'Amber',
  },
  rose: {
    primary: '#fe7c96',
    gradientStart: '#ffa8b8',
    gradientEnd: '#e8456a',
    chartPalette: ['#ffa8b8', '#fe7c96', '#e8456a'],
    label: 'Rose',
  },
}
