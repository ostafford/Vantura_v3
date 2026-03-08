import { useState, useMemo, useRef, useEffect } from 'react'
import { Card, Row, Col, Form, Button, ButtonGroup } from 'react-bootstrap'
import {
  getCategoryBreakdownForDateRange,
  getReportsSankeyData,
} from '@/services/insights'
import { getInsightsCategoryColors } from '@/lib/chartColors'
import { normalizeCategoryIdForColor } from '@/lib/chartColors'
import { ACCENT_PALETTES } from '@/lib/accentPalettes'
import { useStore } from 'zustand'
import { accentStore } from '@/stores/accentStore'
import { InsightsBarChart } from '@/components/charts/InsightsBarChart'
import { SankeyFlowChart } from '@/components/charts/SankeyFlowChart'
import type { InsightsChartDatum } from '@/types/charts'
import { formatMoney } from '@/lib/format'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'

function getDefaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 30)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

const REPORT_PRESETS: { label: string; days?: number; month?: boolean }[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This month', month: true },
  { label: 'Last month', month: true },
]

function getPresetRange(preset: (typeof REPORT_PRESETS)[number]): {
  from: string
  to: string
} {
  const now = new Date()
  if (preset.days) {
    const from = new Date(now)
    from.setDate(from.getDate() - preset.days)
    return {
      from: from.toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
    }
  }
  if (preset.label === 'This month') {
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const from = `${y}-${String(m).padStart(2, '0')}-01`
    return { from, to: now.toISOString().slice(0, 10) }
  }
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const m = now.getMonth() === 0 ? 12 : now.getMonth()
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

export function AnalyticsReports() {
  const [dateFrom, setDateFrom] = useState(() => getDefaultDateRange().from)
  const [dateTo, setDateTo] = useState(() => getDefaultDateRange().to)
  const [showSankey, setShowSankey] = useState(false)
  const [sankeySize, setSankeySize] = useState({ width: 400, height: 240 })
  const sankeyContainerRef = useRef<HTMLDivElement>(null)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const accent = useStore(accentStore, (s) => s.accent)
  const chartPalette = ACCENT_PALETTES[accent].chartPalette
  const categoryColors = getInsightsCategoryColors()

  const breakdown = useMemo(
    () => getCategoryBreakdownForDateRange(dateFrom, dateTo),
    [dateFrom, dateTo]
  )
  const sankeyData = useMemo(
    () => getReportsSankeyData(dateFrom, dateTo),
    [dateFrom, dateTo]
  )
  const sankeyHeight = Math.max(200, sankeyData.categories.length * 28)

  const chartData: InsightsChartDatum[] = useMemo(
    () =>
      breakdown.map((c, index) => {
        const totalDollars = Number.isFinite(c.total / 100) ? c.total / 100 : 0
        const colorKey = normalizeCategoryIdForColor(c.category_id)
        return {
          category_id: c.category_id ?? '',
          name: c.category_name,
          totalDollars,
          fill:
            categoryColors[colorKey] ??
            chartPalette[index % chartPalette.length],
          stroke:
            categoryColors[colorKey] ??
            chartPalette[index % chartPalette.length],
        }
      }),
    [breakdown, categoryColors, chartPalette]
  )
  const maxDomain = useMemo(
    () =>
      Math.max(
        1,
        ...chartData.map((d) => d.totalDollars).filter(Number.isFinite)
      ),
    [chartData]
  )

  const totalSpent = breakdown.reduce((s, c) => s + c.total, 0)

  useEffect(() => {
    if (!showSankey || !sankeyContainerRef.current) return
    const el = sankeyContainerRef.current
    const updateSize = () => {
      if (el) {
        const w = el.offsetWidth || 400
        setSankeySize((prev) =>
          prev.width !== w || prev.height !== sankeyHeight
            ? { width: w, height: sankeyHeight }
            : prev
        )
      }
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(el)
    return () => ro.disconnect()
  }, [showSankey, sankeyHeight])

  return (
    <>
      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">Reports</Card.Title>
          <Card.Text as="div" className="small text-muted mt-1">
            Spending by category over a custom date range. Optionally view
            income-to-spending flow (Sankey).
          </Card.Text>
        </Card.Header>
        <Card.Body>
          <div className="mb-3">
            <ButtonGroup size="sm" className="flex-wrap">
              {REPORT_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline-secondary"
                  onClick={() => {
                    const r = getPresetRange(preset)
                    setDateFrom(r.from)
                    setDateTo(r.to)
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </ButtonGroup>
          </div>
          <Row className="mb-3">
            <Col xs={12} md={6} lg={4}>
              <Form.Group className="mb-2">
                <Form.Label className="small">From</Form.Label>
                <Form.Control
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="Report start date"
                />
              </Form.Group>
            </Col>
            <Col xs={12} md={6} lg={4}>
              <Form.Group className="mb-2">
                <Form.Label className="small">To</Form.Label>
                <Form.Control
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="Report end date"
                />
              </Form.Group>
            </Col>
            <Col xs={12} md={6} lg={4} className="d-flex align-items-end mb-2">
              <Form.Check
                type="switch"
                id="reports-sankey-toggle"
                label="Show Sankey diagram"
                checked={showSankey}
                onChange={(e) => setShowSankey(e.target.checked)}
              />
            </Col>
          </Row>
          <div className="mb-3 small text-muted">
            Income (period): ${formatMoney(sankeyData.moneyIn)} · Spent: $
            {formatMoney(totalSpent)}
          </div>
        </Card.Body>
      </Card>

      <Card className="grid-margin">
        <Card.Header>
          <Card.Title className="mb-0">Spending by category</Card.Title>
          <Card.Text as="div" className="small text-muted mt-1">
            {dateFrom} to {dateTo}
          </Card.Text>
        </Card.Header>
        <Card.Body>
          {chartData.length === 0 ? (
            <p className="text-muted mb-0">
              No spending in this date range. Adjust the dates or make sure
              transactions are synced.
            </p>
          ) : (
            <div
              style={{
                width: '100%',
                height: isMobile ? 280 : 320,
              }}
            >
              <InsightsBarChart
                chartData={chartData}
                maxDomain={maxDomain}
                isMobile={isMobile}
                aria-label={`Spending by category from ${dateFrom} to ${dateTo}`}
              />
            </div>
          )}
        </Card.Body>
      </Card>

      {showSankey && (
        <Card className="grid-margin">
          <Card.Header>
            <Card.Title className="mb-0">Income to spending flow</Card.Title>
            <Card.Text as="div" className="small text-muted mt-1">
              Flow from Income to each spending category. Link width is
              proportional to amount.
            </Card.Text>
          </Card.Header>
          <Card.Body>
            {sankeyData.categories.length === 0 && sankeyData.moneyIn === 0 ? (
              <p className="text-muted mb-0">
                No income or spending in this date range.
              </p>
            ) : (
              <div
                ref={sankeyContainerRef}
                style={{ width: '100%', height: sankeyHeight }}
              >
                <SankeyFlowChart
                  moneyInCents={sankeyData.moneyIn}
                  categories={sankeyData.categories}
                  width={sankeySize.width}
                  height={sankeySize.height}
                  ariaLabel="Income to spending by category"
                />
              </div>
            )}
          </Card.Body>
        </Card>
      )}
    </>
  )
}
