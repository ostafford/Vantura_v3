import { useEffect, useRef } from 'react'
import {
  select,
  scaleLinear,
  scaleBand,
  axisBottom,
  axisLeft,
  type NumberValue,
  type Selection,
} from 'd3'
import type { InsightsChartDatum } from '@/types/charts'
import { formatDollars } from '@/lib/format'
import {
  estimateLeftAxisLabelSpace,
  estimateLeftAxisValueLabelSpace,
  estimateBottomAxisLabelSpace,
} from '@/lib/chartLabelSpace'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { positionTooltip, setTooltipContent } from '@/lib/chartTooltip'

const BORDER_COLOR = 'var(--vantura-border, #3e3a4a)'
const BAR_MAX_WIDTH = 32
const MARGIN_TOP = 8
const MARGIN_RIGHT_DESKTOP = 24
const MARGIN_RIGHT_MOBILE = 8

type InsightsBarChartProps = {
  chartData: InsightsChartDatum[]
  maxDomain: number
  isMobile: boolean
  /** Prefer a stable callback (e.g. useCallback) to avoid unnecessary redraws. */
  onBarClick?: (datum: InsightsChartDatum) => void
  className?: string
  style?: React.CSSProperties
  /** Accessible chart summary (e.g. "Spending by category this week"). */
  'aria-label'?: string
}

/**
 * D3 single-series bar chart for Weekly Insights (spending by category).
 * Desktop: horizontal bars (Y = category, X = dollars). Mobile: vertical bars (X = category, Y = dollars).
 */
export function InsightsBarChart({
  chartData,
  maxDomain,
  isMobile,
  onBarClick,
  className,
  style,
  'aria-label': ariaLabel,
}: InsightsBarChartProps) {
  const [containerRef, dimensions] = useChartDimensions()
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const tooltipEl = tooltipRef.current
    if (!container || dimensions.width <= 0 || dimensions.height <= 0) return
    if (chartData.length === 0) return

    select(container).selectAll('*').remove()

    const keys = chartData.map((d) => d.category_id)
    const names = chartData.map((d) => d.name)
    const nameByKey: Record<string, string> = {}
    chartData.forEach((d) => {
      nameByKey[d.category_id] = d.name
    })

    const left = isMobile
      ? estimateLeftAxisValueLabelSpace(maxDomain, 11)
      : estimateLeftAxisLabelSpace(names, 12)
    const bottom = isMobile
      ? estimateBottomAxisLabelSpace(names, 11, { rotatedDeg: -60 })
      : 8
    const right = isMobile ? MARGIN_RIGHT_MOBILE : MARGIN_RIGHT_DESKTOP

    const innerWidth = dimensions.width - left - right
    const innerHeight = dimensions.height - MARGIN_TOP - bottom

    const svg = select(container)
      .append('svg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)

    const defs = svg.append('defs')

    const g = svg
      .append('g')
      .attr('transform', `translate(${left},${MARGIN_TOP})`)

    const valueScale = scaleLinear()
      .domain([0, maxDomain])
      .range([0, innerWidth])
    const valueScaleVert = scaleLinear()
      .domain([0, maxDomain])
      .range([innerHeight, 0])

    const categoryScale = scaleBand()
      .domain(keys)
      .range(isMobile ? [0, innerWidth] : [0, innerHeight])
      .paddingInner(0.2)
      .paddingOuter(0.1)

    const bandwidth = categoryScale.bandwidth()
    const barSize = Math.min(BAR_MAX_WIDTH, bandwidth)

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const showTooltip = (datum: InsightsChartDatum, event: MouseEvent) => {
      if (!tooltipEl || !container.parentElement) return
      setTooltipContent(tooltipEl, datum.name, [
        `$${formatDollars(datum.totalDollars)} spent`,
      ])
      tooltipEl.style.display = 'block'
      positionTooltip(tooltipEl, container, event, 120, 44)
    }

    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    }

    const formatTickLabel = (key: string) => nameByKey[key] ?? key

    if (isMobile) {
      chartData.forEach((d, index) => {
        const grad = defs
          .append('linearGradient')
          .attr('id', `insights-bar-grad-${index}`)
          .attr('x1', '0%')
          .attr('y1', '0%')
          .attr('x2', '0%')
          .attr('y2', '100%')

        grad
          .append('stop')
          .attr('offset', '0%')
          .attr('stop-color', d.fill)
          .attr('stop-opacity', 0.85)

        grad
          .append('stop')
          .attr('offset', '100%')
          .attr('stop-color', d.fill)
          .attr('stop-opacity', 1)
      })

      const xAxis = axisBottom(categoryScale)
        .tickFormat(formatTickLabel)
        .tickSizeOuter(0)
      const yAxis = axisLeft(valueScaleVert)
        .tickFormat((d: NumberValue) => `$${formatDollars(Number(d))}`)
        .tickSizeOuter(0)

      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(xAxis)
        .selectAll('text')
        .attr('transform', 'rotate(-60)')
        .style('text-anchor', 'end')
        .style('font-size', '11px')
        .attr('fill', 'currentColor')

      g.append('g')
        .call(yAxis)
        .style('font-size', '11px')
        .call((sel: Selection<SVGGElement, unknown, null, undefined>) =>
          sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
        )
        .call((sel: Selection<SVGGElement, unknown, null, undefined>) =>
          sel.selectAll('.tick text').attr('fill', 'currentColor')
        )

      g.selectAll<SVGRectElement, InsightsChartDatum>('.bar')
        .data(chartData)
        .join('rect')
        .attr('class', 'bar')
        .attr(
          'x',
          (d: InsightsChartDatum) =>
            (categoryScale(d.category_id) ?? 0) + (bandwidth - barSize) / 2
        )
        .attr('y', (d: InsightsChartDatum) => valueScaleVert(d.totalDollars))
        .attr('width', barSize)
        .attr(
          'height',
          (d: InsightsChartDatum) =>
            innerHeight - valueScaleVert(d.totalDollars)
        )
        .attr('fill', (_d: InsightsChartDatum, index: number) => {
          return `url(#insights-bar-grad-${index})`
        })
        .attr('stroke', (d: InsightsChartDatum) => d.stroke)
        .attr('stroke-width', 1)
        .attr('rx', 4)
        .attr('ry', 4)
        .style('opacity', 'var(--vantura-chart-bar-opacity, 0.75)')
        .style('cursor', onBarClick ? 'pointer' : 'default')
        .on(
          'mouseover',
          function (
            this: SVGRectElement,
            event: MouseEvent,
            d: InsightsChartDatum
          ) {
            showTooltip(d, event)
            if (!reduceMotion) select(this).style('opacity', 0.8)
          }
        )
        .on('mouseout', function (this: SVGRectElement) {
          hideTooltip()
          select(this).style('opacity', null)
        })
        .on('click', (_: MouseEvent, d: InsightsChartDatum) => {
          onBarClick?.(d)
        })
    } else {
      chartData.forEach((d, index) => {
        const grad = defs
          .append('linearGradient')
          .attr('id', `insights-bar-grad-${index}`)
          .attr('x1', '0%')
          .attr('y1', '0%')
          .attr('x2', '100%')
          .attr('y2', '0%')

        grad
          .append('stop')
          .attr('offset', '0%')
          .attr('stop-color', d.fill)
          .attr('stop-opacity', 0.85)

        grad
          .append('stop')
          .attr('offset', '100%')
          .attr('stop-color', d.fill)
          .attr('stop-opacity', 1)
      })

      const xAxis = axisBottom(valueScale)
        .tickFormat((d: NumberValue) => `$${formatDollars(Number(d))}`)
        .tickSizeOuter(0)
      const yAxis = axisLeft(categoryScale)
        .tickFormat(formatTickLabel)
        .tickSizeOuter(0)

      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(xAxis)
        .call((sel: Selection<SVGGElement, unknown, null, undefined>) =>
          sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
        )
        .call((sel: Selection<SVGGElement, unknown, null, undefined>) =>
          sel.selectAll('.tick text').attr('fill', 'currentColor')
        )

      g.append('g')
        .call(yAxis)
        .style('font-size', '12px')
        .call((sel: Selection<SVGGElement, unknown, null, undefined>) =>
          sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
        )
        .call((sel: Selection<SVGGElement, unknown, null, undefined>) =>
          sel.selectAll('.tick text').attr('fill', 'currentColor')
        )

      g.selectAll<SVGRectElement, InsightsChartDatum>('.bar')
        .data(chartData)
        .join('rect')
        .attr('class', 'bar')
        .attr('x', 0)
        .attr(
          'y',
          (d: InsightsChartDatum) =>
            (categoryScale(d.category_id) ?? 0) + (bandwidth - barSize) / 2
        )
        .attr('width', (d: InsightsChartDatum) => valueScale(d.totalDollars))
        .attr('height', barSize)
        .attr('fill', (_d: InsightsChartDatum, index: number) => {
          return `url(#insights-bar-grad-${index})`
        })
        .attr('stroke', (d: InsightsChartDatum) => d.stroke)
        .attr('stroke-width', 1)
        .attr('rx', 4)
        .attr('ry', 4)
        .style('opacity', 'var(--vantura-chart-bar-opacity, 0.75)')
        .style('cursor', onBarClick ? 'pointer' : 'default')
        .on(
          'mouseover',
          function (
            this: SVGRectElement,
            event: MouseEvent,
            d: InsightsChartDatum
          ) {
            showTooltip(d, event)
            if (!reduceMotion) select(this).style('opacity', 0.8)
          }
        )
        .on('mouseout', function (this: SVGRectElement) {
          hideTooltip()
          select(this).style('opacity', null)
        })
        .on('click', (_: MouseEvent, d: InsightsChartDatum) => {
          onBarClick?.(d)
        })
    }

    return () => {
      hideTooltip()
      select(container).selectAll('*').remove()
    }
  }, [chartData, maxDomain, isMobile, onBarClick, dimensions, containerRef])

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
