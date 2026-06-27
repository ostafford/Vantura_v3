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
    primary: '#90caf9',
    gradientStart: '#c2def8',
    gradientEnd: '#5b9fd4',
    chartPalette: ['#c2def8', '#90caf9', '#5b9fd4'],
    label: 'Sky',
  },
  mint: {
    primary: '#80cbc4',
    gradientStart: '#b2e0db',
    gradientEnd: '#4da89e',
    chartPalette: ['#b2e0db', '#80cbc4', '#4da89e'],
    label: 'Mint',
  },
  lavender: {
    primary: '#ce93d8',
    gradientStart: '#e2bce8',
    gradientEnd: '#a85db8',
    chartPalette: ['#e2bce8', '#ce93d8', '#a85db8'],
    label: 'Lavender',
  },
  peach: {
    primary: '#ffcc80',
    gradientStart: '#ffe2b2',
    gradientEnd: '#e89e40',
    chartPalette: ['#ffe2b2', '#ffcc80', '#e89e40'],
    label: 'Peach',
  },
  blush: {
    primary: '#f48fb1',
    gradientStart: '#f9bdd0',
    gradientEnd: '#d5628a',
    chartPalette: ['#f9bdd0', '#f48fb1', '#d5628a'],
    label: 'Blush',
  },
  lemon: {
    primary: '#ffe082',
    gradientStart: '#fff3b2',
    gradientEnd: '#e8c040',
    chartPalette: ['#fff3b2', '#ffe082', '#e8c040'],
    label: 'Lemon',
  },
}

/** The 6 user-selectable accent swatches (excludes reserved Sage/Rose semantic colours). */
export const PASTEL_SWATCHES = (Object.keys(ACCENT_PALETTES) as AccentId[]).map(
  (id) => ({
    id,
    hex: ACCENT_PALETTES[id].primary,
    label: ACCENT_PALETTES[id].label,
  })
)

/** Fixed semantic colours — not user-selectable. */
export const SEMANTIC_COLORS = {
  success: '#a5d6a7',
  danger: '#ef9a9a',
  warning: '#ffcc80',
  info: '#90caf9',
} as const
