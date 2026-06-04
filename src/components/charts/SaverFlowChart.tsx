import { useEffect, useRef } from 'react'
import {
  select,
  scaleBand,
  scaleLinear,
  axisBottom,
  axisLeft,
  type NumberValue,
} from 'd3'
import type { InsightsHistoryRow } from '@/services/insights'
import { formatMoney } from '@/lib/format'
import {
  estimateLeftAxisValueLabelSpace,
  estimateBottomAxisLabelSpace,
} from '@/lib/chartLabelSpace'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { positionTooltip, setTooltipContent } from '@/lib/chartTooltip'

const SAVE_COLOR = 'var(--vantura-success, #1bcfb4)'
const WITHDRAW_COLOR = 'var(--vantura-danger)'
const BORDER_COLOR = 'var(--vantura-border, #ebedf2)'
const MARGIN_TOP = 8
const MARGIN_RIGHT = 16

type SaverFlowChartProps = {
  data: InsightsHistoryRow[]
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function SaverFlowChart({
  data,
  className,
  style,
  'aria-label': ariaLabel,
}: SaverFlowChartProps) {
  const [containerRef, dimensions] = useChartDimensions()
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const tooltipEl = tooltipRef.current
    if (!container || dimensions.width <= 0 || dimensions.height <= 0) return
    if (data.length === 0) return

    select(container).selectAll('*').remove()

    // saverChanges is negative when money flows to savers; show abs value
    const maxVal = Math.max(...data.map((d) => Math.abs(d.saverChanges)), 1)
    const labels = data.map((d) => d.weekLabel)

    const left = estimateLeftAxisValueLabelSpace(maxVal / 100, 11)
    const bottom = estimateBottomAxisLabelSpace(labels, 11)

    const innerWidth = dimensions.width - left - MARGIN_RIGHT
    const innerHeight = dimensions.height - MARGIN_TOP - bottom

    const xScale = scaleBand()
      .domain(labels)
      .range([0, innerWidth])
      .paddingInner(0.25)
      .paddingOuter(0.1)

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

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const showTooltip = (row: InsightsHistoryRow, event: MouseEvent) => {
      if (!tooltipEl || !container.parentElement) return
      const saved = row.saverChanges <= 0
      const amount = Math.abs(row.saverChanges)
      setTooltipContent(tooltipEl, row.weekLabel, [
        saved
          ? `Saved: $${formatMoney(amount)}`
          : `Withdrew: $${formatMoney(amount)}`,
      ])
      tooltipEl.style.display = 'block'
      positionTooltip(tooltipEl, container, event, 130, 44)
    }

    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    }

    // Gridlines
    g.selectAll('.grid-line')
      .data(yScale.ticks(4))
      .join('line')
      .attr('class', 'grid-line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d: number) => yScale(d))
      .attr('y2', (d: number) => yScale(d))
      .attr('stroke', BORDER_COLOR)
      .attr('stroke-width', 1)

    data.forEach((row) => {
      const absVal = Math.abs(row.saverChanges)
      const barY = yScale(Math.min(absVal, maxVal))
      const barHeight = innerHeight - barY
      const color = row.saverChanges <= 0 ? SAVE_COLOR : WITHDRAW_COLOR

      g.append('rect')
        .attr('x', xScale(row.weekLabel) ?? 0)
        .attr('y', barY)
        .attr('width', xScale.bandwidth())
        .attr('height', Math.max(barHeight, 0))
        .attr('fill', color)
        .attr('rx', 2)
        .attr('ry', 2)
        .style('opacity', 0.8)
        .on('mouseover', function (event: MouseEvent) {
          showTooltip(row, event)
          if (!reduceMotion) select(this).style('opacity', 1)
        })
        .on('mouseout', function () {
          hideTooltip()
          select(this).style('opacity', 0.8)
        })
    })

    const xAxis = axisBottom(xScale)
      .tickFormat((d) => String(d))
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('transform', 'rotate(-55)')
      .style('text-anchor', 'end')
      .style('font-size', '11px')

    const yAxis = axisLeft(yScale)
      .ticks(4)
      .tickFormat((d: NumberValue) => `$${formatMoney(Number(d))}`)
      .tickSizeOuter(0)

    g.append('g').call(yAxis).style('font-size', '11px')
  }, [containerRef, data, dimensions])

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
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
          border: '1px solid var(--vantura-border, #ebedf2)',
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
