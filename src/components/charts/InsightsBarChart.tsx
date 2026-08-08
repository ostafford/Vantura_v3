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
import type { InsightsChartDatum, InsightsChartRow } from '@/types/charts'
import { formatDollars } from '@/lib/format'
import {
  estimateLeftAxisLabelSpace,
  estimateLeftAxisValueLabelSpace,
  estimateBottomAxisLabelSpace,
} from '@/lib/chartLabelSpace'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { positionTooltip, setTooltipContent } from '@/lib/chartTooltip'

const BORDER_COLOR = 'var(--vantura-border, #2c2c3c)'
const BAR_MAX_WIDTH = 32
const MARGIN_TOP = 8
const MARGIN_RIGHT_DESKTOP = 24
const MARGIN_RIGHT_MOBILE = 8

type InsightsBarChartProps = {
  /** Ordered mix of category bars and parent-group header dividers — see
   * InsightsChartRow. The data layer owns all sorting/grouping/Other-folding;
   * the chart just renders whatever order it's given. */
  rows: InsightsChartRow[]
  maxDomain: number
  isMobile: boolean
  className?: string
  style?: React.CSSProperties
  /** Accessible chart summary (e.g. "Spending by category this week"). */
  'aria-label'?: string
}

/**
 * D3 single-series bar chart for Weekly Insights (spending by category),
 * grouped into parent-category clusters with a header divider between each.
 * Desktop: horizontal bars (Y = category, X = dollars). Mobile: vertical bars (X = category, Y = dollars).
 */
export function InsightsBarChart({
  rows,
  maxDomain,
  isMobile,
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
    if (rows.length === 0) return

    select(container).selectAll('*').remove()

    const barRows = rows
      .filter(
        (r): r is { kind: 'bar'; datum: InsightsChartDatum } => r.kind === 'bar'
      )
      .map((r) => r.datum)
    const headerKeys = new Set(
      rows.filter((r) => r.kind === 'header').map((r) => r.key)
    )

    const keys = rows.map((r) =>
      r.kind === 'bar' ? r.datum.category_id : r.key
    )
    const labelByKey: Record<string, string> = {}
    for (const r of rows) {
      labelByKey[r.kind === 'bar' ? r.datum.category_id : r.key] =
        r.kind === 'bar' ? r.datum.name : r.label
    }
    // Header labels count toward axis width too, so a long group name
    // ("Good Life") doesn't get clipped.
    const allLabels = Object.values(labelByKey)

    const left = isMobile
      ? estimateLeftAxisValueLabelSpace(maxDomain, 11)
      : estimateLeftAxisLabelSpace(allLabels, 12)
    const bottom = isMobile
      ? estimateBottomAxisLabelSpace(allLabels, 11, { rotatedDeg: -60 })
      : 8
    const right = isMobile ? MARGIN_RIGHT_MOBILE : MARGIN_RIGHT_DESKTOP

    const innerWidth = dimensions.width - left - right
    const innerHeight = dimensions.height - MARGIN_TOP - bottom
    if (innerWidth <= 0 || innerHeight <= 0) return

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

    const formatTickLabel = (key: string) =>
      headerKeys.has(key) ? '' : (labelByKey[key] ?? key)

    /** Style header ticks distinctly (bold/muted, no tick line) and add a
     * divider line at the start of each header's band slot — run after the
     * default axis .call() so it can override/augment the generated ticks. */
    function decorateHeaderTicks(
      axisGroup: Selection<SVGGElement, unknown, null, undefined>,
      orientation: 'horizontal' | 'vertical'
    ) {
      axisGroup.selectAll('.tick').each(function (d) {
        const key = String(d)
        if (!headerKeys.has(key)) return
        const tick = select(this as SVGGElement)
        tick.select('line').remove()
        const label = labelByKey[key] ?? key
        const textSel = tick
          .select('text')
          .text(label)
          .style('font-weight', 700)
          .style('font-size', '10px')
          .style('text-transform', 'uppercase')
          .style('letter-spacing', '0.04em')
          .attr('fill', 'var(--vantura-text-secondary, currentColor)')
        if (orientation === 'horizontal') {
          textSel
            .attr('transform', null)
            .style('text-anchor', 'start')
            .attr('x', 0)
            .attr('dy', -4)
        } else {
          textSel.attr('transform', 'rotate(-60)').style('text-anchor', 'end')
        }
      })

      const bandStart = (key: string) => categoryScale(key) ?? 0
      const dividers = [...headerKeys].map((key) => bandStart(key))
      g.selectAll('.group-divider')
        .data(dividers)
        .join('line')
        .attr('class', 'group-divider')
        .attr('x1', orientation === 'horizontal' ? 0 : (d) => d)
        .attr('x2', orientation === 'horizontal' ? innerWidth : (d) => d)
        .attr('y1', orientation === 'horizontal' ? (d) => d : 0)
        .attr('y2', orientation === 'horizontal' ? (d) => d : innerHeight)
        .attr('stroke', BORDER_COLOR)
        .attr('stroke-width', 1)
    }

    if (isMobile) {
      barRows.forEach((d, index) => {
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

      const xAxisGroup = g
        .append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(xAxis)
      xAxisGroup
        .selectAll('text')
        .attr('transform', 'rotate(-60)')
        .style('text-anchor', 'end')
        .style('font-size', '11px')
        .attr('fill', 'currentColor')
      decorateHeaderTicks(
        xAxisGroup as Selection<SVGGElement, unknown, null, undefined>,
        'vertical'
      )

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
        .data(barRows)
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
    } else {
      barRows.forEach((d, index) => {
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

      const yAxisGroup = g
        .append('g')
        .call(yAxis)
        .style('font-size', '12px')
        .call((sel: Selection<SVGGElement, unknown, null, undefined>) =>
          sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
        )
        .call((sel: Selection<SVGGElement, unknown, null, undefined>) =>
          sel.selectAll('.tick text').attr('fill', 'currentColor')
        )
      decorateHeaderTicks(
        yAxisGroup as Selection<SVGGElement, unknown, null, undefined>,
        'horizontal'
      )

      g.selectAll<SVGRectElement, InsightsChartDatum>('.bar')
        .data(barRows)
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
    }

    return () => {
      hideTooltip()
      select(container).selectAll('*').remove()
    }
  }, [rows, maxDomain, isMobile, dimensions, containerRef])

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
