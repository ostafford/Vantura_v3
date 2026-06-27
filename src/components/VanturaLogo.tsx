interface VanturaLogoProps {
  variant?: 'icon' | 'wordmark' | 'text'
  height?: number
}

export function VanturaLogo({
  variant = 'icon',
  height = 64,
}: VanturaLogoProps) {
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
        <g
          fill="none"
          stroke="var(--vantura-primary)"
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
        <text
          x="0"
          y="32"
          dominantBaseline="middle"
          fontFamily="system-ui, -apple-system, 'Segoe UI', BlinkMacSystemFont, sans-serif"
          fontWeight="800"
          fontSize="36"
          letterSpacing="3"
          fill="var(--vantura-primary)"
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
      <g
        fill="none"
        stroke="var(--vantura-primary)"
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
        fill="var(--vantura-primary)"
      >
        VANTURA
      </text>
    </svg>
  )
}
