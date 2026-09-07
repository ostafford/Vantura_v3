import type { ReactNode } from 'react'
import { OverlayTrigger, Tooltip } from 'react-bootstrap'

/**
 * The Dashboard's balance zone: Spendable as a full-width hero, with Available
 * and Forecast demoted to two supporting mini-tiles beside it (ticket #15).
 * Spendable is the safety-net "source of truth" (docs/PRODUCT.md), so it owns
 * the visual hierarchy here rather than sitting in a row of three equal cards.
 *
 * All values arrive pre-formatted from Dashboard.tsx — this component is
 * presentation only. `tone` drives the semantic colour: Spendable turns
 * `danger` when negative or below the low-balance alert threshold; Forecast
 * turns `danger` when negative.
 */

type HeroTone = 'success' | 'danger'
type TileTone = 'success' | 'info' | 'danger'

interface BalanceCardsProps {
  spendableValue: ReactNode
  spendableSubtitle: ReactNode
  spendableTone: HeroTone
  spendableTooltip: ReactNode
  onOpenAlert: () => void
  availableValue: ReactNode
  availableSubtitle: ReactNode
  availableTooltip: ReactNode
  forecastValue: ReactNode
  forecastSubtitle: ReactNode
  forecastTone: TileTone
  forecastTooltip: ReactNode
}

function InfoTip({ id, tooltip }: { id: string; tooltip: ReactNode }) {
  return (
    <OverlayTrigger
      placement="top"
      trigger={['hover', 'focus', 'click']}
      rootClose
      overlay={
        <Tooltip id={`balance-${id}-tooltip`} className="tooltip-rich">
          {tooltip}
        </Tooltip>
      }
    >
      <span
        className="balance-info"
        role="img"
        aria-label={`How ${id} is calculated`}
        onClick={(e) => e.stopPropagation()}
      >
        <i className="mdi mdi-information-outline" aria-hidden />
      </span>
    </OverlayTrigger>
  )
}

function MiniTile({
  name,
  tone,
  value,
  subtitle,
  tooltip,
}: {
  name: string
  tone: TileTone
  value: ReactNode
  subtitle: ReactNode
  tooltip: ReactNode
}) {
  return (
    <div className={`balance-tile balance-tile--${tone}`}>
      <div className="balance-tile__label">
        <span className="balance-tile__dot" aria-hidden />
        {name}
        <InfoTip id={name.toLowerCase()} tooltip={tooltip} />
      </div>
      <div className="balance-tile__value">{value}</div>
      {subtitle && <div className="balance-tile__subtitle">{subtitle}</div>}
    </div>
  )
}

export function BalanceCards({
  spendableValue,
  spendableSubtitle,
  spendableTone,
  spendableTooltip,
  onOpenAlert,
  availableValue,
  availableSubtitle,
  availableTooltip,
  forecastValue,
  forecastSubtitle,
  forecastTone,
  forecastTooltip,
}: BalanceCardsProps) {
  return (
    <div className="balance-cards mb-4" data-tour="balance-cards">
      <div
        id="dashboard-spendable-card"
        className={`balance-hero balance-hero--${spendableTone}`}
        role="button"
        tabIndex={0}
        onClick={onOpenAlert}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpenAlert()
          }
        }}
        aria-label="Spendable balance; click to set low balance alert"
      >
        <div className="balance-hero__label">
          Spendable
          <InfoTip id="spendable" tooltip={spendableTooltip} />
        </div>
        <div className="balance-hero__value">{spendableValue}</div>
        <div className="balance-hero__subtitle">{spendableSubtitle}</div>
      </div>

      <div className="balance-tiles">
        <MiniTile
          name="Available"
          tone="success"
          value={availableValue}
          subtitle={availableSubtitle}
          tooltip={availableTooltip}
        />
        <MiniTile
          name="Forecast"
          tone={forecastTone}
          value={forecastValue}
          subtitle={forecastSubtitle}
          tooltip={forecastTooltip}
        />
      </div>
    </div>
  )
}
