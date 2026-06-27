import { useId } from 'react'
import { useStore } from 'zustand'
import { themeStore, resolveTheme } from '@/stores/themeStore'

interface VanturaLogoProps {
  variant?: 'icon' | 'wordmark' | 'text'
  height?: number
}

export function VanturaLogo({
  variant = 'icon',
  height = 64,
}: VanturaLogoProps) {
  const uid = useId()
  const themeMode = useStore(themeStore, (s) => s.mode)
  const isDark = resolveTheme(themeMode) === 'dark'

  // Dark mode: white → light sky → deep sky  (visible on dark bg)
  // Light mode: deep sky → mid sky → light sky (visible on light bg — no white)
  const c0 = isDark ? '#ffffff' : '#5b9fd4'
  const c1 = isDark ? '#c2def8' : '#90caf9'
  const c2 = isDark ? '#5b9fd4' : '#c2def8'

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
