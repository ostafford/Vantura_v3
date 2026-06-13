export type AccentId = 'sky' | 'mint' | 'lavender' | 'peach' | 'blush' | 'lemon'

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
  sky: {
    primary: '#7EB8D8',
    gradientStart: '#a8d8f0',
    gradientEnd: '#5090b8',
    chartPalette: ['#a8d8f0', '#7EB8D8', '#5090b8'],
    label: 'Sky',
  },
  mint: {
    primary: '#7EC8C0',
    gradientStart: '#a8e0d8',
    gradientEnd: '#50a098',
    chartPalette: ['#a8e0d8', '#7EC8C0', '#50a098'],
    label: 'Mint',
  },
  lavender: {
    primary: '#B0A8D8',
    gradientStart: '#ccc8ee',
    gradientEnd: '#9088b8',
    chartPalette: ['#ccc8ee', '#B0A8D8', '#9088b8'],
    label: 'Lavender',
  },
  peach: {
    primary: '#E8B888',
    gradientStart: '#f8d0a8',
    gradientEnd: '#c89858',
    chartPalette: ['#f8d0a8', '#E8B888', '#c89858'],
    label: 'Peach',
  },
  blush: {
    primary: '#E8A8C0',
    gradientStart: '#f8c8d8',
    gradientEnd: '#c888a0',
    chartPalette: ['#f8c8d8', '#E8A8C0', '#c888a0'],
    label: 'Blush',
  },
  lemon: {
    primary: '#D8D088',
    gradientStart: '#ece888',
    gradientEnd: '#b8b060',
    chartPalette: ['#ece888', '#D8D088', '#b8b060'],
    label: 'Lemon',
  },
}

/** The 6 user-selectable pastel swatches (excludes reserved Sage/Rose semantic colours). */
export const PASTEL_SWATCHES = (Object.keys(ACCENT_PALETTES) as AccentId[]).map(
  (id) => ({
    id,
    hex: ACCENT_PALETTES[id].primary,
    label: ACCENT_PALETTES[id].label,
  })
)

/** Fixed semantic colours — not user-selectable. */
export const SEMANTIC_COLORS = {
  success: '#8EC5A0',
  danger: '#E89898',
  warning: '#E8B888',
  info: '#7EB8D8',
} as const
