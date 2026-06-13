import { useEffect, useRef } from 'react'
import {
  select,
  scaleLinear,
  min as d3Min,
  max as d3Max,
  line,
  area,
  axisBottom,
  axisLeft,
  pointer,
  type NumberValue,
} from 'd3'
import type { YearMonthPoint } from '@/services/insights'
import type { MonthMetric } from '@/lib/monthSpendingSeries'
import { formatDollars, formatMoney } from '@/lib/format'
import { meanOfFiniteNumbers } from '@/lib/yearMonthlyChartMetrics'
import { getYearMonthlySemanticStrokes } from '@/components/charts/monthComparisonSemanticStrokes'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { positionTooltip, setTooltipContent } from '@/lib/chartTooltip'

const BORDER_COLOR = 'var(--vantura-border, #2c2c3c)'
const AVERAGE_STROKE = 'var(--vantura-chart-average, #f2994a)'
const MARGIN_TOP = 12
const MARGIN_BOTTOM = 24
const MARGIN_LEFT = 60
const MARGIN_RIGHT = 24
const SUCCESS_COLOR = 'var(--vantura-success, #8EC5A0)'
const SUCCESS_FILL =
  'color-mix(in srgb, var(--vantura-success) 18%, transparent)'
const DANGER_FILL = 'color-mix(in srgb, var(--vantura-danger) 18%, transparent)'

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const MONTH_AXIS_TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

function metricValue(p: YearMonthPoint, metric: MonthMetric): number {
  if (metric === 'spending') return p.moneyOut
  if (metric === 'income') return p.moneyIn
  return p.moneyIn - p.moneyOut
}

export type YearMonthlyLineChartProps = {
  pointsCurrent: YearMonthPoint[]
  pointsPrevious: YearMonthPoint[]
  /** Last month index (1–12) included in the current-year line; later months are omitted (in-progress year). */
  currentThroughMonth?: number
  metric: MonthMetric
  showCurrentYear: boolean
  showPreviousYear: boolean
  currentYear: number
  previousYear: number
  showAverage?: boolean
  height?: number
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function YearMonthlyLineChart({
  pointsCurrent,
  pointsPrevious,
  currentThroughMonth: currentThroughMonthProp = 12,
  metric,
  showCurrentYear,
  showPreviousYear,
  currentYear,
  previousYear,
  showAverage = false,
  height = 230,
  className,
  style,
  'aria-label': ariaLabel,
}: YearMonthlyLineChartProps) {
  const [containerRef, { width }] = useChartDimensions()
  const tooltipRef = useRef<HTMLDivElement>(null)

  const currentThroughMonth = Math.max(
    1,
    Math.min(12, Math.floor(currentThroughMonthProp))
  )

  useEffect(() => {
    const container = containerRef.current
    const tooltipEl = tooltipRef.current
    if (!container || width <= 0 || height <= 0) return
    if (pointsCurrent.length === 0) return
    if (pointsCurrent.length !== pointsPrevious.length) return
    if (pointsCurrent.length > 12) return

    select(container).selectAll('*').remove()

    const n = pointsCurrent.length
    const curVals = pointsCurrent.map((p) => metricValue(p, metric))
    const prevVals = pointsPrevious.map((p) => metricValue(p, metric))

    const curValsForAvg = curVals.slice(0, currentThroughMonth)
    const avg = showAverage ? meanOfFiniteNumbers(curValsForAvg) : null

    const allVals: number[] = []
    if (showCurrentYear) {
      for (let i = 0; i < currentThroughMonth && i < n; i++) {
        allVals.push(curVals[i])
      }
    }
    if (showPreviousYear) {
      for (let i = 0; i < n; i++) allVals.push(prevVals[i])
    }
    if (avg != null) allVals.push(avg)
    if (allVals.length === 0) return

    const minVal = d3Min(allVals) ?? 0
    const maxVal = d3Max(allVals) ?? 0

    let domainMin: number
    let domainMax: number
    if (metric === 'net') {
      domainMin = Math.min(minVal, 0)
      domainMax = maxVal
    } else {
      domainMin = 0
      domainMax = maxVal
    }

    const span = domainMax - domainMin || Math.abs(domainMax) || 1
    const padding = span * 0.05
    const yMin = domainMin - padding
    const yMax = domainMax + padding

    const semanticStrokes = getYearMonthlySemanticStrokes(
      curVals.slice(0, currentThroughMonth),
      prevVals.slice(0, currentThroughMonth),
      metric
    )
    const currentStroke =
      semanticStrokes?.currentStroke ?? 'var(--vantura-chart-accent, #E8B888)'
    const previousStroke =
      semanticStrokes?.previousStroke ??
      'var(--vantura-chart-previous, var(--bs-gray-600, #6c757d))'
    const currentFill =
      semanticStrokes != null
        ? semanticStrokes.currentStroke === SUCCESS_COLOR
          ? SUCCESS_FILL
          : DANGER_FILL
        : 'var(--vantura-chart-accent-soft, rgba(255, 159, 67, 0.15))'

    const innerWidth = width - MARGIN_LEFT - MARGIN_RIGHT
    const innerHeight = height - MARGIN_TOP - MARGIN_BOTTOM
    if (innerWidth <= 0 || innerHeight <= 0) return

    const xScale = scaleLinear().domain([1, n]).range([0, innerWidth])

    const yScale = scaleLinear()
      .domain([yMin, yMax])
      .nice()
      .range([innerHeight, 0])

    const currentDefined = (_: number, i: number) => i < currentThroughMonth

    // Named 'currentLine'/'previousLine' to avoid shadowing the imported 'line' function
    const currentLine = line<number>()
      .defined(currentDefined)
      .x((_, i) => xScale(i + 1))
      .y((d) => yScale(d))

    const previousLine = line<number>()
      .x((_, i) => xScale(i + 1))
      .y((d) => yScale(d))

    const svg = select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN_LEFT},${MARGIN_TOP})`)

    const xAxis = axisBottom(xScale)
      .tickValues([...MONTH_AXIS_TICKS].filter((m) => m <= n))
      .tickFormat((d) => SHORT_MONTHS[Number(d) - 1] ?? '')
      .tickSizeOuter(0)

    const yAxis = axisLeft(yScale)
      .ticks(5)
      .tickFormat((d: NumberValue) => `$${formatDollars(Number(d) / 100)}`)
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .style('font-size', '11px')
      .call((sel) =>
        sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
      )
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'currentColor'))

    g.append('g')
      .call(yAxis)
      .style('font-size', '10px')
      .call((sel) =>
        sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
      )
      .call((sel) => sel.selectAll('.tick text').attr('fill', 'currentColor'))

    if (avg != null) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(avg))
        .attr('y2', yScale(avg))
        .attr('stroke', AVERAGE_STROKE)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 4')
    }

    if (showCurrentYear && pointsCurrent.length >= 1) {
      // Named 'areaGen' to avoid shadowing the imported 'area' function
      const areaGen = area<number>()
        .defined(currentDefined)
        .x((_, i) => xScale(i + 1))
        .y0(innerHeight)
        .y1((d) => yScale(d))

      g.append('path')
        .datum(curVals)
        .attr('fill', currentFill)
        .attr('stroke', 'none')
        .attr('d', areaGen)
        .attr('opacity', 0.9)

      g.append('path')
        .datum(curVals)
        .attr('stroke', currentStroke)
        .attr('stroke-width', 2)
        .attr('fill', 'none')
        .attr('d', currentLine)
        .attr('opacity', 0.9)
    }

    if (showPreviousYear && pointsPrevious.length >= 1) {
      g.append('path')
        .datum(prevVals)
        .attr('fill', 'none')
        .attr('stroke', previousStroke)
        .attr('stroke-width', 2)
        .attr('d', previousLine)
        .attr('opacity', 0.9)
    }

    const showTooltip = (
      monthIndex: number,
      event: MouseEvent,
      label: string
    ) => {
      if (!tooltipEl || !container.parentElement) return
      const c = curVals[monthIndex]
      const p = prevVals[monthIndex]
      const metricLabel =
        metric === 'spending'
          ? 'Spending'
          : metric === 'income'
            ? 'Income'
            : 'Net'

      const lines: (string | null)[] = [
        showCurrentYear
          ? `${currentYear}: ${monthIndex < currentThroughMonth ? `$${formatMoney(c)}` : 'No data'}`
          : null,
        showPreviousYear ? `${previousYear}: $${formatMoney(p)}` : null,
        avg != null ? `Average: $${formatMoney(avg)}` : null,
      ]
      setTooltipContent(tooltipEl, label, lines)

      // Append the metric label as a styled span
      const span = document.createElement('span')
      span.className = 'text-muted small'
      span.textContent = metricLabel
      tooltipEl.appendChild(document.createElement('br'))
      tooltipEl.appendChild(span)

      tooltipEl.style.display = 'block'
      positionTooltip(tooltipEl, container, event, 160, 60)
    }

    const hoverGuide = g
      .append('line')
      .attr('x1', 0)
      .attr('x2', 0)
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', BORDER_COLOR)
      .attr('stroke-width', 1)
      .attr('opacity', 0.4)
      .style('display', 'none')

    const hoverCurrentDot = g
      .append('circle')
      .attr('r', 4)
      .attr('fill', currentStroke)
      .style('display', 'none')

    const hoverPreviousDot = g
      .append('circle')
      .attr('r', 4)
      .attr('fill', previousStroke)
      .style('display', 'none')

    const hoverAverageDot = g
      .append('circle')
      .attr('r', 4)
      .attr('fill', AVERAGE_STROKE)
      .style('display', 'none')

    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
      hoverGuide.style('display', 'none')
      hoverCurrentDot.style('display', 'none')
      hoverPreviousDot.style('display', 'none')
      hoverAverageDot.style('display', 'none')
    }

    function nearestMonthIndex(mx: number): number {
      let bestI = 0
      let bestD = Infinity
      for (let i = 0; i < n; i++) {
        const x = xScale(i + 1)
        const dist = Math.abs(mx - x)
        if (dist < bestD) {
          bestD = dist
          bestI = i
        }
      }
      return bestI
    }

    g.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .style('pointer-events', 'all')
      .on('mousemove', function (event: MouseEvent) {
        const [mx] = pointer(event, this)
        const i = nearestMonthIndex(mx)
        const label = SHORT_MONTHS[i] ?? `Month ${i + 1}`
        const x = xScale(i + 1)
        hoverGuide.attr('x1', x).attr('x2', x).style('display', 'block')

        if (showCurrentYear && i < currentThroughMonth) {
          hoverCurrentDot
            .attr('cx', x)
            .attr('cy', yScale(curVals[i]))
            .style('display', 'block')
        } else {
          hoverCurrentDot.style('display', 'none')
        }

        if (showPreviousYear) {
          hoverPreviousDot
            .attr('cx', x)
            .attr('cy', yScale(prevVals[i]))
            .style('display', 'block')
        } else {
          hoverPreviousDot.style('display', 'none')
        }

        if (avg != null) {
          hoverAverageDot
            .attr('cx', x)
            .attr('cy', yScale(avg))
            .style('display', 'block')
        } else {
          hoverAverageDot.style('display', 'none')
        }

        showTooltip(i, event, label)
      })
      .on('mouseleave', hideTooltip)

    return () => {
      hideTooltip()
      select(container).selectAll('*').remove()
    }
  }, [
    pointsCurrent,
    pointsPrevious,
    currentThroughMonth,
    metric,
    showCurrentYear,
    showPreviousYear,
    showAverage,
    currentYear,
    previousYear,
    width,
    height,
    containerRef,
  ])

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height,
        ...style,
      }}
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
