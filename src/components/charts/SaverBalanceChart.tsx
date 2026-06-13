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
import type { SaverBalanceSnapshot } from '@/services/accounts'
import { formatMoney } from '@/lib/format'
import { estimateLeftAxisValueLabelSpace } from '@/lib/chartLabelSpace'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { positionTooltip, setTooltipContent } from '@/lib/chartTooltip'

const LINE_COLOR = 'var(--vantura-success, #8EC5A0)'
const AREA_COLOR = 'rgba(142, 197, 160, 0.18)'
const BORDER_COLOR = 'var(--vantura-border, #2c2c3c)'
const MARGIN_TOP = 8
const MARGIN_RIGHT = 16

type SaverBalanceChartProps = {
  data: SaverBalanceSnapshot[]
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function SaverBalanceChart({
  data,
  className,
  style,
  'aria-label': ariaLabel,
}: SaverBalanceChartProps) {
  const [containerRef, dimensions] = useChartDimensions()
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const tooltipEl = tooltipRef.current
    if (!container || dimensions.width <= 0 || dimensions.height <= 0) return
    if (data.length < 2) return

    select(container).selectAll('*').remove()

    const parsed = data.map((d) => ({
      date: new Date(d.snapshot_date + 'T12:00:00Z'),
      balance: d.balance_cents,
    }))

    const maxVal = Math.max(...parsed.map((d) => d.balance), 1)
    const minVal = Math.min(...parsed.map((d) => d.balance), 0)

    const left = estimateLeftAxisValueLabelSpace(maxVal / 100, 11)
    const bottom = 28

    const innerWidth = dimensions.width - left - MARGIN_RIGHT
    const innerHeight = dimensions.height - MARGIN_TOP - bottom

    const xScale = scaleTime()
      .domain([parsed[0].date, parsed[parsed.length - 1].date])
      .range([0, innerWidth])

    const yScale = scaleLinear()
      .domain([Math.min(minVal, 0), maxVal])
      .range([innerHeight, 0])
      .nice()

    const svg = select(container)
      .append('svg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)

    const g = svg
      .append('g')
      .attr('transform', `translate(${left},${MARGIN_TOP})`)

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

    const areaGen = area<{ date: Date; balance: number }>()
      .x((d) => xScale(d.date))
      .y0(innerHeight)
      .y1((d) => yScale(d.balance))

    const lineGen = line<{ date: Date; balance: number }>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.balance))

    g.append('path').datum(parsed).attr('fill', AREA_COLOR).attr('d', areaGen)

    g.append('path')
      .datum(parsed)
      .attr('fill', 'none')
      .attr('stroke', LINE_COLOR)
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('d', lineGen)

    // Hover overlay for tooltips
    const bisect = (mx: number) => {
      let closest = parsed[0]
      let minDist = Infinity
      for (const p of parsed) {
        const dist = Math.abs(xScale(p.date) - mx)
        if (dist < minDist) {
          minDist = dist
          closest = p
        }
      }
      return closest
    }

    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
      g.selectAll('.hover-circle').remove()
    }

    svg
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('transform', `translate(${left},${MARGIN_TOP})`)
      .attr('fill', 'transparent')
      .on('mousemove', function (event: MouseEvent) {
        if (!tooltipEl || !container.parentElement) return
        const [mx] = [event.offsetX - left, event.offsetY - MARGIN_TOP]
        const point = bisect(mx)
        g.selectAll('.hover-circle').remove()
        g.append('circle')
          .attr('class', 'hover-circle')
          .attr('cx', xScale(point.date))
          .attr('cy', yScale(point.balance))
          .attr('r', 4)
          .attr('fill', LINE_COLOR)
          .attr('stroke', 'var(--vantura-surface, #1c1c28)')
          .attr('stroke-width', 2)
          .attr('pointer-events', 'none')

        const dateLabel = point.date.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
        setTooltipContent(tooltipEl, dateLabel, [
          `Balance: $${formatMoney(point.balance)}`,
        ])
        tooltipEl.style.display = 'block'
        positionTooltip(tooltipEl, container, event, 140, 44)
      })
      .on('mouseleave', hideTooltip)

    const xAxis = axisBottom(xScale)
      .ticks(Math.min(parsed.length, 6))
      .tickFormat((d) => {
        const date = d as Date
        return date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
      })
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
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
