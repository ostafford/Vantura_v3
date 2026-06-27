import { OverlayTrigger, Tooltip } from 'react-bootstrap'
import { formatMoney } from '@/lib/format'
import type { MonthComparisonData, MonthDelta } from '@/services/insights'

// ── Sentiment helpers ─────────────────────────────────────────────────────────

type Sentiment = 'positive' | 'negative' | 'neutral'

function getSentiment(
  direction: MonthDelta['direction'],
  invert: boolean
): Sentiment {
  if (direction === 'flat') return 'neutral'
  const isUp = direction === 'up'
  return (invert ? !isUp : isUp) ? 'positive' : 'negative'
}

const SENTIMENT_COLOR: Record<Sentiment, string> = {
  positive: 'var(--vantura-success, #a5d6a7)',
  negative: 'var(--vantura-danger, #ef9a9a)',
  neutral: 'var(--vantura-text-secondary, #8888a0)',
}

const SENTIMENT_BG: Record<Sentiment, string> = {
  positive: 'color-mix(in srgb, var(--vantura-success) 15%, transparent)',
  negative: 'color-mix(in srgb, var(--vantura-danger) 15%, transparent)',
  neutral: 'rgba(255, 255, 255, 0.04)',
}

function fmtAbs(cents: number) {
  return `$${formatMoney(Math.abs(cents))}`
}

function fmtPct(delta: number, base: number): string | null {
  if (Math.abs(base) < 1) return null
  const pct = Math.round((Math.abs(delta) / Math.abs(base)) * 100)
  return pct > 0 ? `${pct}%` : null
}

// ── Change tile ───────────────────────────────────────────────────────────────

function ChangeTile({
  label,
  delta,
  invert = false,
}: {
  label: string
  delta: MonthDelta
  invert?: boolean
}) {
  const sentiment = getSentiment(delta.direction, invert)
  const color = SENTIMENT_COLOR[sentiment]
  const bg = SENTIMENT_BG[sentiment]
  const sign =
    delta.direction === 'up' ? '+' : delta.direction === 'down' ? '−' : ''
  const arrow =
    delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '→'
  const pct = fmtPct(delta.delta, delta.previous)

  return (
    <div
      className="rounded p-3 flex-fill"
      style={{ background: bg, minWidth: 120 }}
    >
      <div
        className="text-muted mb-1"
        style={{
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div className="fw-bold" style={{ fontSize: '1.15rem', color }}>
        {sign}
        {fmtAbs(delta.delta)}
      </div>
      <div style={{ fontSize: '0.72rem', color }}>
        {arrow}
        {pct ? ` ${pct}` : ''}
      </div>
    </div>
  )
}

// ── Progress bar row ──────────────────────────────────────────────────────────

function ProgressBarRow({
  label,
  current,
  previous,
  isGoodWhenUnder,
  currentLabel,
  priorLabel,
}: {
  label: string
  current: number
  previous: number
  /** true for Spending (less is better), false for Income (more is better) */
  isGoodWhenUnder: boolean
  currentLabel: string
  priorLabel: string
}) {
  if (previous <= 0) return null

  const rawPct = (current / previous) * 100
  const barWidth = Math.max(Math.min(rawPct, 100), 0)
  const displayPct = Math.round(rawPct)
  const isOver = rawPct > 100

  let barColor: string
  let striped = false

  if (isGoodWhenUnder) {
    // Spending: under = green, over = red with stripes
    if (isOver) {
      barColor = 'var(--vantura-danger)'
      striped = true
    } else {
      barColor = 'var(--vantura-success)'
    }
  } else {
    // Income: under = red, matched/over = green (over gets stripes)
    if (rawPct < 100) barColor = 'var(--vantura-danger)'
    else {
      barColor = 'var(--vantura-success)'
      if (isOver) striped = true
    }
  }

  const row = (
    <div className="mb-3" style={{ cursor: 'default' }}>
      <div className="mb-1" style={{ fontSize: '0.7rem' }}>
        <div
          className="text-muted fw-semibold"
          style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          height: 14,
          borderRadius: 4,
          background: 'var(--vantura-border)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${barWidth}%`,
            height: '100%',
            borderRadius: 4,
            background: barColor,
            transition: 'width 0.4s ease',
            ...(striped && {
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)',
              backgroundSize: '1rem 1rem',
              animation: 'progress-bar-stripes 1s linear infinite',
            }),
          }}
        />
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.65rem',
            fontWeight: 700,
            color: 'var(--vantura-progress-label)',
            pointerEvents: 'none',
          }}
        >
          {displayPct}%
        </span>
      </div>
    </div>
  )

  // Color each tooltip value: the better one is green, the worse one is red.
  // For income (isGoodWhenUnder=false): higher = better.
  // For spending (isGoodWhenUnder=true): lower = better.
  const currentIsBetter = isGoodWhenUnder
    ? current < previous
    : current > previous
  const currentTooltipColor = currentIsBetter
    ? 'var(--vantura-success)'
    : 'var(--vantura-danger)'
  const previousTooltipColor = currentIsBetter
    ? 'var(--vantura-danger)'
    : 'var(--vantura-success)'

  return (
    <OverlayTrigger
      placement="top"
      container={document.body}
      overlay={
        <Tooltip>
          <div style={{ fontWeight: 600, color: currentTooltipColor }}>
            {currentLabel}: {fmtAbs(current)}
          </div>
          <div style={{ fontWeight: 600, color: previousTooltipColor }}>
            {priorLabel}: {fmtAbs(previous)}
          </div>
        </Tooltip>
      }
    >
      {row}
    </OverlayTrigger>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ComparisonVisual({
  comparison,
  currentLabel,
  priorLabel,
}: {
  comparison: MonthComparisonData
  currentLabel: string
  priorLabel: string
}) {
  const { moneyIn, moneyOut, netDelta, biggestCategoryMover } = comparison

  const incomeChangePct =
    moneyIn.previous > 0
      ? (Math.abs(moneyIn.delta) / Math.abs(moneyIn.previous)) * 100
      : 0
  const showIncomeTile = incomeChangePct >= 5 && Math.abs(moneyIn.delta) >= 500

  const showNetTile = netDelta.direction !== 'flat'
  const showCategoryTile =
    biggestCategoryMover != null &&
    Math.abs(biggestCategoryMover.deltaTotal) >= 200

  const hasTiles = showNetTile || showCategoryTile || showIncomeTile

  return (
    <div className="mt-3 pt-2 border-top">
      {/* Delta tiles */}
      {hasTiles ? (
        <div className="d-flex gap-2 flex-wrap mb-4">
          {showNetTile && (
            <ChangeTile label="Net position" delta={netDelta} invert={false} />
          )}
          {showCategoryTile && biggestCategoryMover && (
            <ChangeTile
              label={biggestCategoryMover.category_name}
              delta={{
                current: biggestCategoryMover.currentTotal,
                previous: biggestCategoryMover.previousTotal,
                delta: biggestCategoryMover.deltaTotal,
                direction:
                  biggestCategoryMover.deltaTotal > 0
                    ? 'up'
                    : biggestCategoryMover.deltaTotal < 0
                      ? 'down'
                      : 'flat',
              }}
              invert={true}
            />
          )}
          {showIncomeTile && (
            <ChangeTile label="Income" delta={moneyIn} invert={false} />
          )}
        </div>
      ) : (
        <div className="d-flex align-items-center gap-1 mb-3">
          <i
            className="mdi mdi-check-circle-outline text-success"
            aria-hidden
            style={{ fontSize: '0.95rem' }}
          />
          <span className="small">On track with {priorLabel}</span>
        </div>
      )}

      {/* Progress bars — hover for exact values */}
      <ProgressBarRow
        label="Income"
        current={moneyIn.current}
        previous={moneyIn.previous}
        isGoodWhenUnder={false}
        currentLabel={currentLabel}
        priorLabel={priorLabel}
      />
      <ProgressBarRow
        label="Spending"
        current={moneyOut.current}
        previous={moneyOut.previous}
        isGoodWhenUnder={true}
        currentLabel={currentLabel}
        priorLabel={priorLabel}
      />
    </div>
  )
}
