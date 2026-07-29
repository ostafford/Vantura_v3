import { useMemo } from 'react'
import { useStore } from 'zustand'
import { Link } from 'react-router-dom'
import { Card } from 'react-bootstrap'
import { syncStore } from '@/stores/syncStore'
import { formatMoney } from '@/lib/format'
import { getNetWorthSummary, getNetWorthSnapshots } from '@/services/netWorth'
import { getManualAccounts, isStale } from '@/services/manualAccounts'
import type React from 'react'

export interface NetWorthCardProps {
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>
}

export function NetWorthCard({ dragHandleProps }: NetWorthCardProps) {
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)

  const summary = useMemo(
    () => getNetWorthSummary(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt]
  )

  const snapshots = useMemo(
    () => getNetWorthSnapshots(2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt]
  )

  const staleCount = useMemo(
    () => getManualAccounts().filter(isStale).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt]
  )

  const prevSnapshot =
    snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null
  const deltaVsPrev = prevSnapshot
    ? summary.totalCents - prevSnapshot.total_cents
    : null

  const hasApproximate = staleCount > 0

  return (
    <Card>
      <Card.Header className="d-flex justify-content-between align-items-center section-header">
        <div className="d-flex align-items-center gap-2">
          <span className="page-title-icon" {...dragHandleProps}>
            <i className="mdi mdi-chart-timeline-variant" aria-hidden />
          </span>
          <span>Net Worth</span>
        </div>
        <Link
          to="/analytics/net-worth"
          className="btn-icon"
          aria-label="View net worth details"
        >
          <i className="mdi mdi-arrow-right" aria-hidden />
        </Link>
      </Card.Header>
      <Card.Body>
        <div className="d-flex align-items-baseline gap-2 mb-1">
          <span className="fw-semibold fs-4">
            {hasApproximate ? '≈ ' : ''}
            {summary.totalCents < 0 ? '−' : ''}$
            {formatMoney(Math.abs(summary.totalCents))}
          </span>
          {deltaVsPrev !== null && (
            <span
              className={
                deltaVsPrev >= 0 ? 'text-success small' : 'text-danger small'
              }
            >
              {deltaVsPrev >= 0 ? '↑' : '↓'} {deltaVsPrev >= 0 ? '+' : '−'}$
              {formatMoney(Math.abs(deltaVsPrev))}
            </span>
          )}
        </div>
        <div className="d-flex gap-3 small text-muted">
          <span className="text-success">
            ▲ $
            {formatMoney(summary.upBankAssetsCents + summary.manualAssetsCents)}{' '}
            assets
          </span>
          <span className="text-danger">
            ▼ $
            {formatMoney(
              Math.abs(
                summary.upBankLiabilitiesCents + summary.manualLiabilitiesCents
              )
            )}{' '}
            liabilities
          </span>
        </div>
        {staleCount > 0 && (
          <div className="mt-2 small text-warning d-flex align-items-center gap-1">
            <i className="mdi mdi-alert-outline" aria-hidden />
            {staleCount} account{staleCount > 1 ? 's' : ''} may be out of date
          </div>
        )}
        <div className="mt-2">
          <Link
            to="/analytics/net-worth"
            className="small"
            style={{ color: 'var(--vantura-primary)' }}
          >
            View details <i className="mdi mdi-chevron-right" aria-hidden />
          </Link>
        </div>
      </Card.Body>
    </Card>
  )
}
