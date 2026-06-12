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

const BORDER_COLOR = 'var(--vantura-border, #3e3a4a)'
const MONEY_IN_COLOR = 'var(--vantura-chart-money-in)'
const MONEY_OUT_COLOR = 'var(--vantura-chart-money-out)'
const MARGIN_TOP = 8
const MARGIN_RIGHT = 24

type InsightsHistoryChartProps = {
  data: InsightsHistoryRow[]
  maxDomain?: number
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function InsightsHistoryChart({
  data,
  maxDomain: maxDomainProp,
  className,
  style,
  'aria-label': ariaLabel,
}: InsightsHistoryChartProps) {
  const [containerRef, dimensions] = useChartDimensions()
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const tooltipEl = tooltipRef.current
    if (!container || dimensions.width <= 0 || dimensions.height <= 0) return
    if (data.length === 0) return

    select(container).selectAll('*').remove()

    const maxVal =
      maxDomainProp ??
      Math.max(...data.flatMap((d) => [d.moneyIn, d.moneyOut]), 100)

    const labels = data.map((d) => d.weekLabel)

    const left = estimateLeftAxisValueLabelSpace(maxVal / 100, 11)
    const bottom = estimateBottomAxisLabelSpace(labels, 10)
    const right = MARGIN_RIGHT

    const innerWidth = dimensions.width - left - right
    const innerHeight = dimensions.height - MARGIN_TOP - bottom

    const xScale = scaleBand()
      .domain(labels)
      .range([0, innerWidth])
      .paddingInner(0.2)
      .paddingOuter(0.1)

    const yScale = scaleLinear()
      .domain([0, maxVal])
      .range([innerHeight, 0])
      .nice()

    const bandwidth = xScale.bandwidth()
    const barWidth = bandwidth * 0.4

    const svg = select(container)
      .append('svg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)

    const g = svg
      .append('g')
      .attr('transform', `translate(${left},${MARGIN_TOP})`)

    const showTooltip = (row: InsightsHistoryRow, event: MouseEvent) => {
      if (!tooltipEl || !container.parentElement) return
      setTooltipContent(tooltipEl, row.weekLabel, [
        `Money In: $${formatMoney(row.moneyIn)}`,
        `Money Out: $${formatMoney(row.moneyOut)}`,
      ])
      tooltipEl.style.display = 'block'
      positionTooltip(tooltipEl, container, event, 160, 52)
    }

    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    }

    data.forEach((row) => {
      const x =
        (xScale(row.weekLabel) ?? 0) + (bandwidth - barWidth * 2 - 4) / 2
      const inY = yScale(Math.min(row.moneyIn, maxVal))
      const outY = yScale(Math.min(row.moneyOut, maxVal))
      const inHeight = innerHeight - inY
      const outHeight = innerHeight - outY

      g.append('rect')
        .attr('class', 'bar-in')
        .attr('x', x)
        .attr('y', inY)
        .attr('width', barWidth)
        .attr('height', inHeight)
        .attr('fill', MONEY_IN_COLOR)
        .attr('rx', 2)
        .attr('ry', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function (event: MouseEvent) {
          showTooltip(row, event)
          select(this).style('opacity', 0.8)
        })
        .on('mouseout', function () {
          hideTooltip()
          select(this).style('opacity', null)
        })

      g.append('rect')
        .attr('class', 'bar-out')
        .attr('x', x + barWidth + 4)
        .attr('y', outY)
        .attr('width', barWidth)
        .attr('height', outHeight)
        .attr('fill', MONEY_OUT_COLOR)
        .attr('rx', 2)
        .attr('ry', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function (event: MouseEvent) {
          showTooltip(row, event)
          select(this).style('opacity', 0.8)
        })
        .on('mouseout', function () {
          hideTooltip()
          select(this).style('opacity', null)
        })
    })

    const xAxis = axisBottom(xScale).tickSizeOuter(0)
    const yAxis = axisLeft(yScale)
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
      hideTooltip()
      select(container).selectAll('*').remove()
    }
  }, [data, maxDomainProp, dimensions, containerRef])

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
