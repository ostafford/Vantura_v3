import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { formatMoney } from '@/lib/format'
import {
  estimateLeftAxisValueLabelSpace,
  estimateBottomAxisLabelSpace,
} from '@/lib/chartLabelSpace'

const BORDER_COLOR = 'var(--vantura-border, #ebedf2)'
const MARGIN_TOP = 8
const MARGIN_RIGHT = 24
const DEFAULT_LINE_COLOR = 'var(--vantura-primary, #b66dff)'
const GOAL_LINE_COLOR = 'var(--vantura-text-secondary, #9c9fa6)'

export interface ProgressDataPoint {
  date: string
  amount: number
}

type ProgressChartProps = {
  data: ProgressDataPoint[]
  goalAmount?: number
  lineColor?: string
  areaFill?: boolean
  maxDomain?: number
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function ProgressChart({
  data,
  goalAmount,
  lineColor = DEFAULT_LINE_COLOR,
  areaFill = true,
  maxDomain: maxDomainProp,
  className,
  style,
  'aria-label': ariaLabel,
}: ProgressChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setDimensions({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    const tooltipEl = tooltipRef.current
    if (
      !container ||
      dimensions.width <= 0 ||
      dimensions.height <= 0 ||
      data.length === 0
    )
      return

    const containerSelection = d3.select(container)
    containerSelection.selectAll('svg').remove()

    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))
    const maxAmount = Math.max(...sorted.map((d) => d.amount), 100)
    const maxY = maxDomainProp ?? Math.max(maxAmount, goalAmount ?? 0) * 1.1

    const left = estimateLeftAxisValueLabelSpace(maxY / 100, 11)
    const bottom = estimateBottomAxisLabelSpace(
      sorted.map((d) => d.date).slice(0, 6),
      10
    )
    const right = MARGIN_RIGHT

    const width = dimensions.width - left - right
    const height = dimensions.height - MARGIN_TOP - bottom

    const xScale = d3
      .scalePoint<string>()
      .domain(sorted.map((d) => d.date))
      .range([0, width])
      .padding(0.1)

    const yScale = d3.scaleLinear().domain([0, maxY]).range([height, 0]).nice()

    const line = d3
      .line<ProgressDataPoint>()
      .x((d) => xScale(d.date) ?? 0)
      .y((d) => yScale(d.amount))

    const svg = containerSelection
      .append('svg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .attr('role', 'img')
      .attr('aria-label', ariaLabel ?? 'Progress over time')

    const g = svg
      .append('g')
      .attr('transform', `translate(${left},${MARGIN_TOP})`)

    const tickCount = Math.min(8, sorted.length)
    const tickValues =
      tickCount <= 1 || tickCount >= sorted.length
        ? sorted.map((d) => d.date)
        : Array.from({ length: tickCount }, (_, i) => {
            const idx = Math.round((i / (tickCount - 1)) * (sorted.length - 1))
            return sorted[idx].date
          })

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickFormat((d) => String(d).slice(5))
          .tickValues(tickValues)
          .tickSizeOuter(0)
      )
      .selectAll('text')
      .attr('fill', 'var(--vantura-text-secondary, #9c9fa6)')
      .attr('font-size', 10)

    g.append('g')
      .call(
        d3
          .axisLeft(yScale)
          .tickFormat((v) => `$${formatMoney(Number(v))}`)
          .tickSizeOuter(0)
      )
      .selectAll('text')
      .attr('fill', 'var(--vantura-text-secondary, #9c9fa6)')
      .attr('font-size', 10)

    g.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)

    if (areaFill && sorted.length > 1) {
      const area = d3
        .area<ProgressDataPoint>()
        .x((d) => xScale(d.date) ?? 0)
        .y0(height)
        .y1((d) => yScale(d.amount))

      g.append('path')
        .datum(sorted)
        .attr('fill', lineColor)
        .attr('opacity', 0.1)
        .attr('d', area)
    }

    g.append('path')
      .datum(sorted)
      .attr('fill', 'none')
      .attr('stroke', lineColor)
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('d', line)

    if (goalAmount != null && goalAmount > 0) {
      const goalY = yScale(goalAmount)
      g.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', goalY)
        .attr('y2', goalY)
        .attr('stroke', GOAL_LINE_COLOR)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '6 4')

      g.append('text')
        .attr('x', width - 4)
        .attr('y', goalY - 6)
        .attr('text-anchor', 'end')
        .attr('fill', GOAL_LINE_COLOR)
        .attr('font-size', 10)
        .text(`Goal: $${formatMoney(goalAmount)}`)
    }

    g.selectAll('.dot')
      .data(sorted)
      .join('circle')
      .attr('class', 'dot')
      .attr('cx', (d) => xScale(d.date) ?? 0)
      .attr('cy', (d) => yScale(d.amount))
      .attr('r', 3)
      .attr('fill', lineColor)
      .attr('stroke', 'var(--vantura-surface, #fff)')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        if (tooltipEl) {
          tooltipEl.textContent = `${d.date}: $${formatMoney(d.amount)}`
          tooltipEl.style.display = 'block'
          tooltipEl.style.left = `${event.offsetX + 10}px`
          tooltipEl.style.top = `${event.offsetY + 10}px`
        }
        d3.select(this).attr('r', 5)
      })
      .on('mouseleave', function () {
        if (tooltipEl) tooltipEl.style.display = 'none'
        d3.select(this).attr('r', 3)
      })
  }, [
    data,
    dimensions,
    maxDomainProp,
    goalAmount,
    lineColor,
    areaFill,
    ariaLabel,
  ])

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div
        ref={tooltipRef}
        className="position-absolute bg-dark text-white rounded px-2 py-1 small"
        style={{
          display: 'none',
          pointerEvents: 'none',
          zIndex: 10,
        }}
        role="status"
      />
    </div>
  )
}
