import type { ReactNode } from 'react'
import { Card, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { formatMoney } from '@/lib/format'

type ColorVariant = 'primary' | 'danger' | 'info' | 'success'

export interface StatCardProps {
  title: string
  value: number
  subtitle?: ReactNode
  /** When set, shown instead of $formatMoney(value). Use for non-currency values (e.g. counts). */
  displayValue?: ReactNode
  gradient: ColorVariant
  /** Accepts plain strings or formatted JSX for richer multi-line tooltips. */
  tooltip?: ReactNode
}

/**
 * Small pastel stat tile — title, a value, an optional subtitle, and an
 * optional info-icon tooltip. Used for the Weekly Insights metric row.
 */
export function StatCard({
  title,
  value,
  subtitle,
  displayValue,
  gradient,
  tooltip,
}: StatCardProps) {
  const valueContent =
    displayValue != null ? displayValue : `$${formatMoney(value)}`

  const titleContent = (
    <>
      {title}
      {tooltip && (
        <OverlayTrigger
          placement="top"
          trigger={['hover', 'focus', 'click']}
          rootClose
          overlay={
            <Tooltip id={`stat-${title}-tooltip`} className="tooltip-rich">
              {tooltip}
            </Tooltip>
          }
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
          {titleContent}
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
