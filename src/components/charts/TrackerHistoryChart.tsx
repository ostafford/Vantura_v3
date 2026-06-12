import { useEffect, useRef } from 'react'
import {
  select,
  scaleBand,
  scaleLinear,
  axisBottom,
  axisLeft,
  type NumberValue,
} from 'd3'
import type { TrackerPeriodHistoryRow } from '@/services/trackers'
import { formatMoney } from '@/lib/format'
import { estimateLeftAxisValueLabelSpace } from '@/lib/chartLabelSpace'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { positionTooltip, setTooltipContent } from '@/lib/chartTooltip'

const BORDER_COLOR = 'var(--vantura-border, #3e3a4a)'
const STRIPE_ID = 'tracker-history-stripe'
const GRAD_SUCCESS_ID = 'tracker-history-success'
const GRAD_WARNING_ID = 'tracker-history-warning'
const GRAD_DANGER_ID = 'tracker-history-danger'
const MARGIN_TOP = 8
const MARGIN_RIGHT = 24

type TrackerHistoryChartProps = {
  data: TrackerPeriodHistoryRow[]
  maxDomain?: number
  onBarClick?: (row: TrackerPeriodHistoryRow) => void
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function TrackerHistoryChart({
  data,
  maxDomain: maxDomainProp,
  onBarClick,
  className,
  style,
  'aria-label': ariaLabel,
}: TrackerHistoryChartProps) {
  const [containerRef, dimensions] = useChartDimensions()
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const tooltipEl = tooltipRef.current
    if (!container || dimensions.width <= 0 || dimensions.height <= 0) return
    if (data.length === 0) return

    select(container).selectAll('*').remove()

    const maxVal =
      maxDomainProp ?? Math.max(...data.flatMap((d) => [d.budget, d.spent]), 1)

    // Newest period (Now) on the left
    const chartData = [...data].reverse()

    // Abbreviated date labels; fall back to "d MMM" if any month repeats
    const monthLabels = chartData.map((d) => {
      const date = new Date(d.periodStart + 'T12:00:00Z')
      return date.toLocaleString('en-AU', { month: 'short', timeZone: 'UTC' })
    })
    const hasDuplicateMonths = monthLabels.length !== new Set(monthLabels).size
    const displayLabels = chartData.map((d, i) => {
      if (!hasDuplicateMonths) return monthLabels[i]
      const date = new Date(d.periodStart + 'T12:00:00Z')
      return `${date.getUTCDate()} ${monthLabels[i]}`
    })

    const left = estimateLeftAxisValueLabelSpace(maxVal / 100, 11)
    const bottom = 30
    const right = MARGIN_RIGHT

    const innerWidth = dimensions.width - left - right
    const innerHeight = dimensions.height - MARGIN_TOP - bottom

    const xScale = scaleBand()
      .domain(displayLabels)
      .range([0, innerWidth])
      .paddingInner(0.2)
      .paddingOuter(0.1)

    const yScale = scaleLinear()
      .domain([0, maxVal])
      .range([innerHeight, 0])
      .nice()

    const bandwidth = xScale.bandwidth()
    const barWidth = bandwidth * 0.6

    const svg = select(container)
      .append('svg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)

    const defs = svg.append('defs')

    // Stripe pattern for over-budget bars
    const stripePattern = defs
      .append('pattern')
      .attr('id', STRIPE_ID)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 8)
      .attr('height', 8)
      .attr('patternTransform', 'rotate(45)')
    stripePattern
      .append('rect')
      .attr('width', 4)
      .attr('height', 8)
      .attr('fill', 'rgba(255,255,255,0.28)')

    // Gradient defs matching progress-bar colour tokens
    const makeGrad = (id: string, fromVar: string, toVar: string) => {
      const grad = defs
        .append('linearGradient')
        .attr('id', id)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '0%')
      grad.append('stop').attr('offset', '0%').style('stop-color', fromVar)
      grad.append('stop').attr('offset', '100%').style('stop-color', toVar)
    }
    makeGrad(
      GRAD_SUCCESS_ID,
      'var(--vantura-chart-bar-success-from)',
      'var(--vantura-chart-bar-success-to)'
    )
    makeGrad(
      GRAD_WARNING_ID,
      'var(--vantura-chart-bar-warning-from)',
      'var(--vantura-chart-bar-warning-to)'
    )
    makeGrad(
      GRAD_DANGER_ID,
      'var(--vantura-chart-bar-danger-from)',
      'var(--vantura-chart-bar-danger-to)'
    )

    const g = svg
      .append('g')
      .attr('transform', `translate(${left},${MARGIN_TOP})`)

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const showTooltip = (row: TrackerPeriodHistoryRow, event: MouseEvent) => {
      if (!tooltipEl || !container.parentElement) return
      const pct =
        row.budget > 0 ? Math.round((row.spent / row.budget) * 100) : 0
      setTooltipContent(tooltipEl, row.periodLabel, [
        `Spent: $${formatMoney(row.spent)} (${pct}%)`,
        `Budget: $${formatMoney(row.budget)}`,
      ])
      tooltipEl.style.display = 'block'
      positionTooltip(tooltipEl, container, event, 120, 44)
    }

    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    }

    chartData.forEach((row, i) => {
      const label = displayLabels[i]
      const x = (xScale(label) ?? 0) + (bandwidth - barWidth) / 2
      const spentY = yScale(Math.min(row.spent, maxVal))
      const spentBarHeight = innerHeight - spentY

      const gradId =
        row.progress >= 81
          ? GRAD_DANGER_ID
          : row.progress > 50
            ? GRAD_WARNING_ID
            : GRAD_SUCCESS_ID
      const isOver = row.progress >= 100

      g.append('rect')
        .attr('class', 'bar-spent')
        .attr('x', x)
        .attr('y', spentY)
        .attr('width', barWidth)
        .attr('height', spentBarHeight)
        .attr('fill', `url(#${gradId})`)
        .attr('rx', 6)
        .attr('ry', 6)
        .style('cursor', onBarClick ? 'pointer' : 'default')
        .on('mouseover', function (event: MouseEvent) {
          showTooltip(row, event)
          if (!reduceMotion) select(this).style('opacity', 0.8)
        })
        .on('mouseout', function () {
          hideTooltip()
          select(this).style('opacity', null)
        })
        .on('click', () => onBarClick?.(row))

      if (isOver) {
        g.append('rect')
          .attr('class', 'bar-spent-stripe')
          .attr('x', x)
          .attr('y', spentY)
          .attr('width', barWidth)
          .attr('height', spentBarHeight)
          .attr('fill', `url(#${STRIPE_ID})`)
          .attr('rx', 6)
          .attr('ry', 6)
          .style('pointer-events', 'none')
      }

      // Percentage label — inside bar if tall enough, above bar if short
      if (row.progress > 0 && spentBarHeight >= 8) {
        const pct = Math.round(row.progress)
        const insideBar = spentBarHeight >= 22
        g.append('text')
          .attr('class', 'bar-label')
          .attr('x', x + barWidth / 2)
          .attr('y', insideBar ? spentY + spentBarHeight / 2 : spentY - 4)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', insideBar ? 'central' : 'auto')
          .attr('fill', insideBar ? 'white' : 'currentColor')
          .attr('font-size', '10')
          .attr('font-weight', '600')
          .style('opacity', '0.5')
          .style('pointer-events', 'none')
          .text(`${pct}%`)
      }
    })

    const xAxis = axisBottom(xScale)
      .tickFormat((d) => String(d))
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
      .style('font-size', '11px')

    g.append('g')
      .call(yAxis)
      .style('font-size', '11px')
      .call((sel) =>
        sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
      )
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'currentColor'))

    return () => {
      hideTooltip()
      select(container).selectAll('*').remove()
    }
  }, [data, maxDomainProp, onBarClick, dimensions, containerRef])

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
          border: '1px solid var(--vantura-border, #3e3a4a)',
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
