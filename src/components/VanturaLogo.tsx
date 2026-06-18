import { useId } from 'react'
import { useStore } from 'zustand'
import { accentStore } from '@/stores/accentStore'
import { ACCENT_PALETTES } from '@/lib/accentPalettes'

interface VanturaLogoProps {
  variant?: 'icon' | 'wordmark' | 'text'
  height?: number
}

export function VanturaLogo({
  variant = 'icon',
  height = 64,
}: VanturaLogoProps) {
  const uid = useId()
  const accent = useStore(accentStore, (s) => s.accent)
  const palette = ACCENT_PALETTES[accent]

  const c0 = '#ffffff'
  const c1 = palette.gradientStart
  const c2 = palette.gradientEnd

  if (variant === 'icon') {
    return (
      <svg
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        width={height}
        height={height}
        role="img"
        aria-label="Vantura"
      >
        <defs>
          <linearGradient
            id={`${uid}-g`}
            x1="8"
            y1="8"
            x2="56"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={c0} />
            <stop offset="55%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <g
          fill="none"
          stroke={`url(#${uid}-g)`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 8 8 L 8 56  M 56 8 L 56 56  M 8 8 L 56 56" />
          <path d="M 8 8 L 44 8 A 12 13 0 0 1 44 34 L 8 34" />
        </g>
      </svg>
    )
  }

  if (variant === 'text') {
    const w = Math.round(height * (210 / 64))
    return (
      <svg
        viewBox="0 0 210 64"
        xmlns="http://www.w3.org/2000/svg"
        width={w}
        height={height}
        role="img"
        aria-label="Vantura"
      >
        <defs>
          <linearGradient
            id={`${uid}-tg`}
            x1="0"
            y1="0"
            x2="210"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={c0} />
            <stop offset="55%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <text
          x="0"
          y="32"
          dominantBaseline="middle"
          fontFamily="system-ui, -apple-system, 'Segoe UI', BlinkMacSystemFont, sans-serif"
          fontWeight="800"
          fontSize="36"
          letterSpacing="3"
          fill={`url(#${uid}-tg)`}
        >
          VANTURA
        </text>
      </svg>
    )
  }

  const w = Math.round(height * (287 / 64))
  return (
    <svg
      viewBox="0 0 287 64"
      xmlns="http://www.w3.org/2000/svg"
      width={w}
      height={height}
      role="img"
      aria-label="Vantura"
    >
      <defs>
        <linearGradient
          id={`${uid}-ig`}
          x1="8"
          y1="8"
          x2="56"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={c0} />
          <stop offset="55%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        <linearGradient
          id={`${uid}-tg`}
          x1="83"
          y1="0"
          x2="267"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={c0} />
          <stop offset="55%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke={`url(#${uid}-ig)`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 8 8 L 8 56  M 56 8 L 56 56  M 8 8 L 56 56" />
        <path d="M 8 8 L 44 8 A 12 13 0 0 1 44 34 L 8 34" />
      </g>

      <text
        x="83"
        y="32"
        dominantBaseline="middle"
        fontFamily="system-ui, -apple-system, 'Segoe UI', BlinkMacSystemFont, sans-serif"
        fontWeight="800"
        fontSize="36"
        letterSpacing="3"
        fill={`url(#${uid}-tg)`}
      >
        VANTURA
      </text>
    </svg>
  )
}
