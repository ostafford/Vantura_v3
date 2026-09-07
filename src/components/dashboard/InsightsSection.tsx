import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from 'zustand'
import {
  Card,
  Row,
  Col,
  OverlayTrigger,
  Tooltip as BSTooltip,
} from 'react-bootstrap'
import {
  getWeekRange,
  getWeeklyInsights,
  getWeeklyCategoryBreakdownGrouped,
  getWeeklyInsightsRawCount,
  getWeeklyInsightsDebugCounts,
} from '@/services/insights'
import {
  formatMoney,
  formatShortDateFromDate,
  formatDollars,
} from '@/lib/format'
import { syncStore } from '@/stores/syncStore'
import { themeStore, resolveTheme } from '@/stores/themeStore'
import { getCategoryColor, getUncategorisedColor } from '@/lib/colorSystem'
import { HelpPopover } from '@/components/HelpPopover'
import { StatCard } from '@/components/StatCard'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'
import { InsightsBarChart } from '@/components/charts/InsightsBarChart'
import type { InsightsChartRow } from '@/types/charts'
import type React from 'react'

/**
 * Weekly Insights card: Money In (income), Money Out (spending), Savers (saver movement),
 * Charges (count of spending), and spending-by-category chart.
 * Definitions and filters are in @/services/insights.ts; see the file-level comment there.
 */
export function InsightsSection({
  dragHandleProps,
}: {
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>
}) {
  const [weekOffset, setWeekOffset] = useState(0)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)

  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const themeMode = useStore(themeStore, (s) => s.mode)
  const mode = resolveTheme(themeMode)
  const weekRange = useMemo(() => getWeekRange(weekOffset), [weekOffset])
  const { startStr, endIso } = weekRange
  const insights = useMemo(
    () => getWeeklyInsights(weekRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekRange, lastSyncCompletedAt]
  )
  const sections = useMemo(
    () => getWeeklyCategoryBreakdownGrouped(weekRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekRange, lastSyncCompletedAt]
  )
  const rawCount = useMemo(
    () => (import.meta.env.DEV ? getWeeklyInsightsRawCount(weekRange) : 0),
    [weekRange]
  )
  const debugCounts = useMemo(
    () =>
      import.meta.env.DEV ? getWeeklyInsightsDebugCounts(weekRange) : null,
    [weekRange]
  )

  // Every section the data layer returns (real parent groups with spend,
  // Uncategorised, Other) gets a header row before its bars — so each group
  // boundary is a real visual divider and the groups that appear stay in the
  // colour system's validated order. Empty parent groups are dropped upstream
  // (#31); see colorSystem.ts and getWeeklyCategoryBreakdownGrouped's doc.
  const rows: InsightsChartRow[] = useMemo(
    () =>
      sections.flatMap((section) => {
        const header: InsightsChartRow = {
          kind: 'header',
          key: `header:${section.parentId ?? section.parentName}`,
          label: section.parentName,
        }
        const bars: InsightsChartRow[] = section.rows.map((r) => {
          const isNeutral = section.isOther || section.parentId === null
          const hex = isNeutral
            ? getUncategorisedColor(mode)
            : getCategoryColor(r.category_id, mode)
          return {
            kind: 'bar',
            datum: {
              category_id:
                r.category_id ??
                (section.isOther ? '__other__' : '__uncategorised__'),
              name: r.category_name,
              totalDollars: r.total / 100,
              fill: hex,
              stroke: hex,
            },
          }
        })
        return [header, ...bars]
      }),
    [sections, mode]
  )
  const barCount = sections.reduce((sum, s) => sum + s.rows.length, 0)
  const otherSection = sections.find((s) => s.isOther)

  const maxDomain = Math.max(
    1,
    ...rows
      .filter(
        (r): r is Extract<InsightsChartRow, { kind: 'bar' }> => r.kind === 'bar'
      )
      .map((r) => r.datum.totalDollars)
      .filter(Number.isFinite)
  )

  const titleBlock = (
    <div className="d-flex align-items-center">
      <span className="page-title-icon" {...dragHandleProps}>
        <i className="mdi mdi-chart-bar" aria-hidden />
      </span>
      <div className="d-flex flex-column">
        <div className="d-flex align-items-center">
          <span>Weekly Insights</span>
          <HelpPopover
            id="insights-help"
            title="Weekly Insights"
            content="Shows money in, money out, saver movement, and transaction count for the selected week. Use the arrows to browse previous weeks. The bar chart breaks spending down by category, grouped by parent category."
            ariaLabel="What is Weekly Insights?"
          />
        </div>
        <span className="small text-muted">
          {formatShortDateFromDate(weekRange.start)} –{' '}
          {formatShortDateFromDate(weekRange.end)}
        </span>
      </div>
    </div>
  )

  const navControls = (
    <>
      <Link
        to="/analytics/reports"
        className="btn-icon"
        aria-label="View insights analytics"
      >
        <i className="mdi mdi-chart-box" aria-hidden />
      </Link>
      <OverlayTrigger
        placement="top"
        overlay={
          <BSTooltip id="insights-prev-tooltip">Previous week</BSTooltip>
        }
      >
        <button
          type="button"
          className="btn-icon"
          onClick={() => setWeekOffset((o) => o - 1)}
          aria-label="Previous week"
        >
          <i className="mdi mdi-chevron-left" aria-hidden />
        </button>
      </OverlayTrigger>
      <OverlayTrigger
        placement="top"
        overlay={
          <BSTooltip id="insights-today-tooltip">
            Go to current period
          </BSTooltip>
        }
      >
        <button
          type="button"
          className="btn-icon"
          onClick={() => setWeekOffset(0)}
          disabled={weekOffset === 0}
          aria-label="Go to current period"
        >
          <i className="mdi mdi-calendar-today" aria-hidden />
        </button>
      </OverlayTrigger>
      <OverlayTrigger
        placement="top"
        overlay={<BSTooltip id="insights-next-tooltip">Next week</BSTooltip>}
      >
        <button
          type="button"
          className="btn-icon"
          onClick={() => setWeekOffset((o) => o + 1)}
          disabled={weekOffset >= 0}
          aria-label="Next week"
        >
          <i className="mdi mdi-chevron-right" aria-hidden />
        </button>
      </OverlayTrigger>
    </>
  )

  return (
    <Card>
      <Card.Header
        className={
          isMobile
            ? 'd-flex flex-column gap-2 section-header'
            : 'd-flex align-items-center justify-content-between flex-wrap gap-2 section-header'
        }
      >
        {titleBlock}
        <div
          className={
            isMobile
              ? 'd-flex justify-content-center gap-2 align-items-center'
              : 'd-flex gap-2 flex-grow-1 justify-content-end align-items-center'
          }
        >
          {navControls}
        </div>
      </Card.Header>
      {import.meta.env.DEV && (
        <Card.Body className="py-1 small text-muted border-bottom">
          <div>
            Range: {startStr} – {endIso} · {rawCount} transactions in range
          </div>
          {debugCounts != null && (
            <div className="mt-1">
              Charges (spending): {debugCounts.charges} · Round-ups:{' '}
              {debugCounts.roundUps} · Transfers: {debugCounts.transfers}
            </div>
          )}
        </Card.Body>
      )}
      <Card.Body>
        {/* Metrics: see src/services/insights.ts for term definitions (Money In = income only, Money Out = spending only, etc.) */}
        <Row className="mb-3 g-2 g-md-3">
          <Col xs={6} md>
            <StatCard
              title="Money In"
              value={insights.moneyIn}
              gradient="success"
              compact
            />
          </Col>
          <Col xs={6} md>
            <StatCard
              title="Money Out"
              value={insights.moneyOut}
              gradient="danger"
              compact
            />
          </Col>
          <Col xs={6} md>
            <StatCard
              title="Savers"
              value={Math.abs(insights.saverChanges)}
              displayValue={
                (insights.saverChanges <= 0 ? '+' : '-') +
                '$' +
                formatMoney(Math.abs(insights.saverChanges))
              }
              gradient="success"
              compact
            />
          </Col>
          <Col xs={6} md>
            <StatCard
              title="Charges"
              value={0}
              displayValue={insights.charges}
              gradient="danger"
              tooltip="Count of spending transactions this week (excludes transfers)."
              compact
            />
          </Col>
        </Row>
        {sections.length > 0 ? (
          <>
            <div
              className="visually-hidden"
              role="region"
              aria-label="Spending by category this week (table)"
            >
              <table className="table table-sm mb-0">
                <caption className="visually-hidden">
                  Spending by category this week, grouped by parent category
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" className="text-end">
                      Spent
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) =>
                    r.kind === 'bar' ? (
                      <tr key={r.datum.category_id}>
                        <td>{r.datum.name}</td>
                        <td className="text-end">
                          ${formatDollars(r.datum.totalDollars)}
                        </td>
                      </tr>
                    ) : (
                      <tr key={r.key}>
                        <th scope="rowgroup" colSpan={2}>
                          {r.label}
                        </th>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
            <div
              style={{
                width: '100%',
                height: isMobile
                  ? Math.max(280, rows.length * 40)
                  : Math.max(200, rows.length * 28),
              }}
            >
              <InsightsBarChart
                rows={rows}
                maxDomain={maxDomain}
                isMobile={isMobile}
                aria-label="Spending by category this week (bar chart)"
              />
            </div>
            {otherSection && (
              <p className="text-muted small mb-0 mt-1 text-end">
                Top {barCount - otherSection.rows.length} categories shown
                individually · {otherSection.rows[0]?.category_name}
              </p>
            )}
          </>
        ) : (
          <p className="text-muted small mb-0">
            No spending by category this week.
          </p>
        )}
      </Card.Body>
    </Card>
  )
}
