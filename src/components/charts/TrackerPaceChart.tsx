import { useEffect, useRef } from 'react'
import {
  select,
  scaleTime,
  scaleLinear,
  line,
  area,
  axisBottom,
  axisLeft,
  type NumberValue,
} from 'd3'
import type { TrackerTransactionTimelineRow } from '@/services/trackers'
import { formatMoney } from '@/lib/format'
import { estimateLeftAxisValueLabelSpace } from '@/lib/chartLabelSpace'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { positionTooltip, setTooltipContent } from '@/lib/chartTooltip'

const BORDER_COLOR = 'var(--vantura-border, #2c2c3c)'
const PACE_LINE_COLOR = '#aaa'
const BUDGET_CEIL_COLOR = 'var(--vantura-danger)'
const AREA_OPACITY = 0.15
const MARGIN_TOP = 16
const MARGIN_RIGHT = 24

type TrackerPaceChartProps = {
  data: TrackerTransactionTimelineRow[]
  periodStart: string
  periodEnd: string
  budget: number
  isCurrentPeriod: boolean
  today: string
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function TrackerPaceChart({
  data,
  periodStart,
  periodEnd,
  budget,
  isCurrentPeriod,
  today,
  className,
  style,
  'aria-label': ariaLabel,
}: TrackerPaceChartProps) {
  const [containerRef, dimensions] = useChartDimensions()
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const tooltipEl = tooltipRef.current
    if (!container || dimensions.width <= 0 || dimensions.height <= 0) return

    select(container).selectAll('*').remove()

    const toDate = (s: string) => new Date(s.slice(0, 10) + 'T12:00:00Z')

    const startDate = toDate(periodStart)
    const endDate = toDate(periodEnd)
    const todayDate = toDate(today)

    const lastCumulative =
      data.length > 0 ? data[data.length - 1].cumulativeSpent : 0
    const maxVal = Math.max(budget, lastCumulative, 1) * 1.1

    const spendProgress = budget > 0 ? (lastCumulative / budget) * 100 : 0
    const spendColor =
      spendProgress >= 81
        ? 'var(--vantura-danger)'
        : spendProgress > 50
          ? 'var(--vantura-warning)'
          : 'var(--vantura-success)'

    type ChartPoint = {
      date: Date
      cumulativeSpent: number
      row?: TrackerTransactionTimelineRow
    }

    const chartPoints: ChartPoint[] = [{ date: startDate, cumulativeSpent: 0 }]
    for (const row of data) {
      const d = toDate(row.date)
      if (d > startDate && d <= endDate) {
        chartPoints.push({ date: d, cumulativeSpent: row.cumulativeSpent, row })
      }
    }

    // Extend flat line to today (current) or period end (past)
    const extensionDate =
      isCurrentPeriod && todayDate < endDate ? todayDate : endDate
    const lastPt = chartPoints[chartPoints.length - 1]
    if (lastPt.date.getTime() < extensionDate.getTime()) {
      chartPoints.push({ date: extensionDate, cumulativeSpent: lastCumulative })
    }

    const left = estimateLeftAxisValueLabelSpace(maxVal / 100, 11)
    const bottom = 30
    const right = MARGIN_RIGHT
    const innerWidth = dimensions.width - left - right
    const innerHeight = dimensions.height - MARGIN_TOP - bottom

    const xScale = scaleTime()
      .domain([startDate, endDate])
      .range([0, innerWidth])

    const yScale = scaleLinear()
      .domain([0, maxVal])
      .range([innerHeight, 0])
      .nice()

    const svg = select(container)
      .append('svg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)

    const g = svg
      .append('g')
      .attr('transform', `translate(${left},${MARGIN_TOP})`)

    // Budget ceiling — dashed red horizontal
    const budgetY = yScale(Math.min(budget, maxVal))
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', budgetY)
      .attr('y2', budgetY)
      .attr('stroke', BUDGET_CEIL_COLOR)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,4')
      .attr('opacity', 0.65)

    // Budget pace line — dashed gray diagonal from (start,0) to (end,budget)
    g.append('line')
      .attr('x1', xScale(startDate))
      .attr('x2', xScale(endDate))
      .attr('y1', yScale(0))
      .attr('y2', yScale(Math.min(budget, maxVal)))
      .attr('stroke', PACE_LINE_COLOR)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,3')

    // Spending area fill
    const areaGen = area<ChartPoint>()
      .x((d) => xScale(d.date))
      .y0(innerHeight)
      .y1((d) => yScale(Math.min(d.cumulativeSpent, maxVal)))

    g.append('path')
      .datum(chartPoints)
      .attr('fill', spendColor)
      .attr('fill-opacity', AREA_OPACITY)
      .attr('d', areaGen)

    // Spending line
    const lineGen = line<ChartPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(Math.min(d.cumulativeSpent, maxVal)))

    g.append('path')
      .datum(chartPoints)
      .attr('fill', 'none')
      .attr('stroke', spendColor)
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('d', lineGen)

    // Transaction data points
    const txPoints = chartPoints.filter((d) => d.row != null)
    g.selectAll('.point')
      .data(txPoints)
      .join('circle')
      .attr('class', 'point')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(Math.min(d.cumulativeSpent, maxVal)))
      .attr('r', 3)
      .attr('fill', spendColor)
      .style('cursor', 'pointer')
      .on('mouseover', function (event: MouseEvent, d) {
        if (!tooltipEl || !container.parentElement) return
        setTooltipContent(tooltipEl, d.row!.date, [
          `${d.row!.description || 'Transaction'}: $${formatMoney(d.row!.amount)}`,
          `Cumulative: $${formatMoney(d.row!.cumulativeSpent)}`,
        ])
        tooltipEl.style.display = 'block'
        positionTooltip(tooltipEl, container, event, 160, 52)
        select(this).attr('r', 5)
      })
      .on('mouseout', function () {
        if (tooltipEl) tooltipEl.style.display = 'none'
        select(this).attr('r', 3)
      })

    // Today marker — vertical dashed line with label (current period only)
    if (isCurrentPeriod && todayDate >= startDate && todayDate < endDate) {
      const todayX = xScale(todayDate)
      g.append('line')
        .attr('x1', todayX)
        .attr('x2', todayX)
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', 'currentColor')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.3)
      g.append('text')
        .attr('x', todayX + 3)
        .attr('y', 11)
        .attr('fill', 'currentColor')
        .attr('font-size', 9)
        .attr('opacity', 0.5)
        .text('Today')
    }

    const xAxis = axisBottom(xScale)
      .ticks(5)
      .tickFormat((d) => {
        const dt = d as unknown as Date
        const month = dt.toLocaleString('en', {
          month: 'short',
          timeZone: 'UTC',
        })
        return `${month} ${dt.getUTCDate()}`
      })
      .tickSizeOuter(0)

    const yAxis = axisLeft(yScale)
      .ticks(5)
      .tickFormat((d: NumberValue) => `$${formatMoney(Number(d))}`)
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((sel) =>
        sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
      )
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'currentColor'))
      .style('font-size', '10px')

    g.append('g')
      .call(yAxis)
      .style('font-size', '11px')
      .call((sel) =>
        sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
      )
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'currentColor'))

    return () => {
      if (tooltipEl) tooltipEl.style.display = 'none'
      select(container).selectAll('*').remove()
    }
  }, [
    data,
    periodStart,
    periodEnd,
    budget,
    isCurrentPeriod,
    today,
    dimensions,
    containerRef,
  ])

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div
        ref={tooltipRef}
        role="tooltip"
        style={{
          position: 'absolute',
          display: 'none',
          padding: '6px 10px',
          background: 'var(--vantura-surface)',
          color: 'var(--vantura-text)',
          border: '1px solid var(--vantura-border, #2c2c3c)',
          borderRadius: 4,
          fontSize: 12,
          pointerEvents: 'none',
          zIndex: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      />
    </div>
  )
}
