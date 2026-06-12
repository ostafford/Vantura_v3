import { useEffect, useRef } from 'react'
import {
  select,
  scalePoint,
  scaleLinear,
  line,
  area,
  axisBottom,
  axisLeft,
  type NumberValue,
} from 'd3'
import type { TrackerTransactionTimelineRow } from '@/services/trackers'
import { formatMoney } from '@/lib/format'
import {
  estimateLeftAxisValueLabelSpace,
  estimateBottomAxisLabelSpace,
} from '@/lib/chartLabelSpace'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { positionTooltip, setTooltipContent } from '@/lib/chartTooltip'

const BORDER_COLOR = 'var(--vantura-border, #3e3a4a)'
const LINE_COLOR = 'var(--vantura-primary)'
const AREA_OPACITY = 0.2
const MARGIN_TOP = 8
const MARGIN_RIGHT = 24

type TrackerCumulativeChartProps = {
  data: TrackerTransactionTimelineRow[]
  maxDomain?: number
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function TrackerCumulativeChart({
  data,
  maxDomain: maxDomainProp,
  className,
  style,
  'aria-label': ariaLabel,
}: TrackerCumulativeChartProps) {
  const [containerRef, dimensions] = useChartDimensions()
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const tooltipEl = tooltipRef.current
    if (!container || dimensions.width <= 0 || dimensions.height <= 0) return
    if (data.length === 0) return

    select(container).selectAll('*').remove()

    const maxCumulative =
      maxDomainProp ?? Math.max(...data.map((d) => d.cumulativeSpent), 1)
    const dateLabels = data.map((d) => d.date)

    const left = estimateLeftAxisValueLabelSpace(maxCumulative / 100, 11)
    const bottom = estimateBottomAxisLabelSpace(dateLabels, 10)
    const right = MARGIN_RIGHT

    const innerWidth = dimensions.width - left - right
    const innerHeight = dimensions.height - MARGIN_TOP - bottom

    const xScale = scalePoint().domain(dateLabels).range([0, innerWidth])

    const yScale = scaleLinear()
      .domain([0, maxCumulative])
      .range([innerHeight, 0])
      .nice()

    // Named 'lineGen'/'areaGen' to avoid shadowing the imported 'line'/'area' functions
    const lineGen = line<TrackerTransactionTimelineRow>()
      .x((d) => xScale(d.date) ?? 0)
      .y((d) => yScale(d.cumulativeSpent))

    const areaGen = area<TrackerTransactionTimelineRow>()
      .x((d) => xScale(d.date) ?? 0)
      .y0(innerHeight)
      .y1((d) => yScale(d.cumulativeSpent))

    const svg = select(container)
      .append('svg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)

    const g = svg
      .append('g')
      .attr('transform', `translate(${left},${MARGIN_TOP})`)

    const showTooltip = (
      row: TrackerTransactionTimelineRow,
      event: MouseEvent
    ) => {
      if (!tooltipEl || !container.parentElement) return
      setTooltipContent(tooltipEl, row.date, [
        `${row.description || 'Transaction'}: $${formatMoney(row.amount)}`,
        `Cumulative: $${formatMoney(row.cumulativeSpent)}`,
      ])
      tooltipEl.style.display = 'block'
      positionTooltip(tooltipEl, container, event, 160, 52)
    }

    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    }

    g.append('path')
      .datum(data)
      .attr('fill', LINE_COLOR)
      .attr('fill-opacity', AREA_OPACITY)
      .attr('d', areaGen)

    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', LINE_COLOR)
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('d', lineGen)

    g.selectAll('.point')
      .data(data)
      .join('circle')
      .attr('class', 'point')
      .attr('cx', (d) => xScale(d.date) ?? 0)
      .attr('cy', (d) => yScale(d.cumulativeSpent))
      .attr('r', 3)
      .attr('fill', LINE_COLOR)
      .style('cursor', 'pointer')
      .on(
        'mouseover',
        function (event: MouseEvent, d: TrackerTransactionTimelineRow) {
          showTooltip(d, event)
          select(this).attr('r', 5)
        }
      )
      .on('mouseout', function () {
        hideTooltip()
        select(this).attr('r', 3)
      })

    const xAxis = axisBottom(xScale)
      .tickFormat((d) => {
        const s = String(d)
        return s.length > 10 ? s.slice(5, 10) : s
      })
      .tickSizeOuter(0)

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
