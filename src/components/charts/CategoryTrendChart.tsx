import { useEffect, useRef } from 'react'
import {
  select,
  scaleBand,
  scaleLinear,
  axisBottom,
  axisLeft,
  type NumberValue,
} from 'd3'
import type { CategoryBreakdownHistoryRow } from '@/services/insights'
import { formatMoney } from '@/lib/format'
import {
  estimateLeftAxisValueLabelSpace,
  estimateBottomAxisLabelSpace,
} from '@/lib/chartLabelSpace'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { positionTooltip, setTooltipContent } from '@/lib/chartTooltip'

const BORDER_COLOR = 'var(--vantura-border, #2c2c3c)'
const BAR_COLOR = 'var(--vantura-primary)'
const MARGIN_TOP = 8
const MARGIN_RIGHT = 24

type CategoryTrendChartProps = {
  data: CategoryBreakdownHistoryRow[]
  categoryName: string
  maxDomain?: number
  barColor?: string
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function CategoryTrendChart({
  data,
  categoryName,
  maxDomain: maxDomainProp,
  barColor = BAR_COLOR,
  className,
  style,
  'aria-label': ariaLabel,
}: CategoryTrendChartProps) {
  const [containerRef, dimensions] = useChartDimensions()
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const tooltipEl = tooltipRef.current
    if (!container || dimensions.width <= 0 || dimensions.height <= 0) return
    if (data.length === 0) return

    select(container).selectAll('*').remove()

    const maxVal = maxDomainProp ?? Math.max(...data.map((d) => d.total), 100)
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

    const svg = select(container)
      .append('svg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)

    const g = svg
      .append('g')
      .attr('transform', `translate(${left},${MARGIN_TOP})`)

    const showTooltip = (
      row: CategoryBreakdownHistoryRow,
      event: MouseEvent
    ) => {
      if (!tooltipEl || !container.parentElement) return
      setTooltipContent(tooltipEl, categoryName, [
        `${row.weekLabel}`,
        `Spent: $${formatMoney(row.total)}`,
      ])
      tooltipEl.style.display = 'block'
      positionTooltip(tooltipEl, container, event, 140, 44)
    }

    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    }

    data.forEach((row) => {
      const x = xScale(row.weekLabel) ?? 0
      const h = innerHeight - yScale(Math.min(row.total, maxVal))
      g.append('rect')
        .attr('class', 'bar')
        .attr('x', x)
        .attr('y', yScale(Math.min(row.total, maxVal)))
        .attr('width', xScale.bandwidth())
        .attr('height', h)
        .attr('fill', barColor)
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
  }, [data, categoryName, maxDomainProp, barColor, dimensions, containerRef])

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
