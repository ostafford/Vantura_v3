import type { ReactNode } from 'react'
import { Card, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { formatMoney } from '@/lib/format'

type ColorVariant = 'primary' | 'danger' | 'info' | 'success'
type SubtitleVariant = 'warning' | 'warningChip'

export interface StatCardProps {
  title: string
  value: number
  subtitle?: ReactNode
  subtitleVariant?: SubtitleVariant
  /** When set, shown instead of $formatMoney(value). Use for non-currency values (e.g. counts). */
  displayValue?: ReactNode
  /** Smaller variant: less padding, smaller typography, gradient background. */
  compact?: boolean
  gradient: ColorVariant
  imgAlt?: string
  tooltip?: string
}

export function StatCard({
  title,
  value,
  subtitle,
  subtitleVariant,
  displayValue,
  compact,
  gradient,
  tooltip,
}: StatCardProps) {
  const valueContent =
    displayValue != null ? displayValue : `$${formatMoney(value)}`

  if (compact) {
    const compactTitle = (
      <>
        {title}
        {tooltip && (
          <OverlayTrigger
            placement="top"
            overlay={<Tooltip id={`stat-${title}-tooltip`}>{tooltip}</Tooltip>}
          >
            <span
              className="ms-1"
              style={{ cursor: 'help', fontSize: '0.75rem' }}
              role="img"
              aria-label="Info"
            >
              <i className="mdi mdi-information-outline" aria-hidden />
            </span>
          </OverlayTrigger>
        )}
      </>
    )
    return (
      <Card className={`bg-pastel-${gradient}`}>
        <Card.Body className="py-1 px-2">
          <h6 className="font-weight-normal mb-0 small text-center align-middle">
            {compactTitle}
          </h6>
          <h6 className="mb-0 text-center align-middle fw-bold">
            {valueContent}
          </h6>
          {subtitle && (
            <small className="card-text d-block" style={{ opacity: 0.7 }}>
              {subtitle}
            </small>
          )}
        </Card.Body>
      </Card>
    )
  }

  return (
    <Card className={`stat-card-flat stat-card-flat--${gradient}`}>
      <Card.Body className="stat-card-flat__body">
        {subtitle && (
          <div
            className={`stat-card-flat__subtitle${subtitleVariant ? ` stat-card-flat__subtitle--${subtitleVariant}` : ''}`}
          >
            {subtitle}
          </div>
        )}

        <div className="stat-card-flat__bottom-row">
          <div className="stat-card-flat__header">
            <div className="stat-card-flat__title">
              {title}
              {tooltip && (
                <OverlayTrigger
                  placement="top"
                  overlay={
                    <Tooltip id={`stat-${title}-tooltip`}>{tooltip}</Tooltip>
                  }
                >
                  <span
                    className="ms-1 stat-card-flat__info"
                    role="img"
                    aria-label="Info"
                  >
                    <i className="mdi mdi-information-outline" aria-hidden />
                  </span>
                </OverlayTrigger>
              )}
            </div>
          </div>
          <div className="stat-card-flat__value">{valueContent}</div>
        </div>
      </Card.Body>
    </Card>
  )
}
