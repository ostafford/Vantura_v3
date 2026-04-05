import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import type {
  MonthSpendingSeries,
  MonthSpendingSeriesPoint,
  MonthMetric,
} from '@/lib/monthSpendingSeries'
import { formatDollars, formatMoney } from '@/lib/format'
import { getMonthComparisonSemanticStrokes } from '@/components/charts/monthComparisonSemanticStrokes'

const BORDER_COLOR = 'var(--vantura-border, #ebedf2)'
const MARGIN_TOP = 12
const MARGIN_BOTTOM = 24
const MARGIN_RIGHT = 24
const SUCCESS_COLOR = 'var(--vantura-success, #1bcfb4)'
const SUCCESS_FILL =
  'color-mix(in srgb, var(--vantura-success) 18%, transparent)'
const DANGER_FILL = 'color-mix(in srgb, var(--vantura-danger) 18%, transparent)'
const TOOLTIP_OFFSET = 10
const TOOLTIP_PADDING = 8

export interface MonthSpendingComparisonChartProps {
  series: MonthSpendingSeries | null
  metric: MonthMetric
  height?: number
  showAverage?: boolean
  showCurrent?: boolean
  showPrevious?: boolean
  /** Default: `Day ${day}`; use for week view (e.g. Mon–Sun). */
  formatXAxisTick?: (day: number) => string
  /** Tooltip / legend label for the previous (baseline) series. */
  previousLineLabel?: string
  /** Tooltip / legend label for the current series. */
  currentLineLabel?: string
  /** Tooltip title for the x-axis bucket; default `Day ${day}`. */
  formatTooltipDayTitle?: (day: number) => string
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

function getMetricValues(
  points: MonthSpendingSeriesPoint[],
  metric: MonthMetric
) {
  const currentKey =
    metric === 'spending'
      ? 'currentSpending'
      : metric === 'income'
        ? 'currentIncome'
        : 'currentNet'
  const previousKey =
    metric === 'spending'
      ? 'previousSpending'
      : metric === 'income'
        ? 'previousIncome'
        : 'previousNet'

  const currentValues: (number | null)[] = []
  const previousValues: (number | null)[] = []

  for (const p of points) {
    currentValues.push(p[currentKey] as number | null)
    previousValues.push(p[previousKey] as number | null)
  }

  return { currentValues, previousValues }
}

function computeAverage(values: (number | null)[]): number | null {
  let sum = 0
  let count = 0
  for (const v of values) {
    if (v != null) {
      sum += v
      count += 1
    }
  }
  if (count === 0) return null
  return sum / count
}

export function MonthSpendingComparisonChart({
  series,
  metric,
  height = 220,
  showAverage = false,
  showCurrent = true,
  showPrevious = true,
  formatXAxisTick,
  previousLineLabel = 'Last month',
  currentLineLabel = 'This month',
  formatTooltipDayTitle,
  className,
  style,
  'aria-label': ariaLabel,
}: MonthSpendingComparisonChartProps) {
  const formatXResolved = useMemo(
    () => formatXAxisTick ?? ((d: number) => `Day ${d}`),
    [formatXAxisTick]
  )
  const formatTitleResolved = useMemo(
    () => formatTooltipDayTitle ?? ((d: number) => `Day ${d}`),
    [formatTooltipDayTitle]
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  const prepared = useMemo(() => {
    if (!series || series.points.length === 0) return null
    const { currentValues, previousValues } = getMetricValues(
      series.points,
      metric
    )

    const avg = showAverage ? computeAverage(currentValues) : null

    const allValues: number[] = []
    if (showCurrent) {
      for (const v of currentValues) if (v != null) allValues.push(v)
    }
    if (showPrevious) {
      for (const v of previousValues) if (v != null) allValues.push(v)
    }
    if (avg != null) allValues.push(avg)

    if (allValues.length === 0) {
      return {
        points: series.points,
        yDomain: [0, 1],
        avg,
      }
    }

    const minVal = d3.min(allValues) ?? 0
    const maxVal = d3.max(allValues) ?? 0

    let domainMin: number
    if (metric === 'net') {
      domainMin = Math.min(minVal, 0)
    } else {
      domainMin = 0
    }

    const span = maxVal - domainMin || Math.abs(maxVal) || 1
    const padding = span * 0.05
    const yMin = domainMin - padding
    const yMax = maxVal + padding

    return {
      points: series.points,
      yDomain: [yMin, yMax] as [number, number],
      avg,
    }
  }, [series, metric, showAverage, showCurrent, showPrevious])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width: nextWidth } = entries[0].contentRect
      setWidth(nextWidth)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !prepared || width <= 0 || height <= 0) return

    d3.select(container).selectAll('*').remove()

    const { points, yDomain, avg } = prepared
    const semanticStrokes = getMonthComparisonSemanticStrokes(points, metric)
    const currentStroke =
      semanticStrokes?.currentStroke ??
      'var(--vantura-chart-accent, var(--bs-primary, #ff9f43))'
    const previousStroke =
      semanticStrokes?.previousStroke ??
      'var(--vantura-chart-previous, var(--bs-gray-600, #6c757d))'
    const currentFill =
      semanticStrokes != null
        ? semanticStrokes.currentStroke === SUCCESS_COLOR
          ? SUCCESS_FILL
          : DANGER_FILL
        : 'var(--vantura-chart-accent-soft, rgba(255, 159, 67, 0.15))'

    const marginLeft = 60
    const innerWidth = width - marginLeft - MARGIN_RIGHT
    const innerHeight = height - MARGIN_TOP - MARGIN_BOTTOM

    if (innerWidth <= 0 || innerHeight <= 0) return

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)

    const g = svg
      .append('g')
      .attr('transform', `translate(${marginLeft},${MARGIN_TOP})`)

    const xScale = d3
      .scaleLinear()
      .domain([1, points.length])
      .range([0, innerWidth])

    const yScale = d3
      .scaleLinear()
      .domain(yDomain)
      .nice()
      .range([innerHeight, 0])

    const currentLine = d3
      .line<MonthSpendingSeriesPoint>()
      .defined((d) => {
        const { currentValues } = getMetricValues([d], metric)
        return currentValues[0] != null
      })
      .x((d) => xScale(d.day))
      .y((d) => {
        const { currentValues } = getMetricValues([d], metric)
        return yScale(currentValues[0] ?? 0)
      })

    const previousLine = d3
      .line<MonthSpendingSeriesPoint>()
      .defined((d) => {
        const { previousValues } = getMetricValues([d], metric)
        return previousValues[0] != null
      })
      .x((d) => xScale(d.day))
      .y((d) => {
        const { previousValues } = getMetricValues([d], metric)
        return yScale(previousValues[0] ?? 0)
      })

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(points.length, 8))
      .tickFormat((d: d3.NumberValue) => formatXResolved(Number(d)))
      .tickSizeOuter(0)

    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d: d3.NumberValue) => `$${formatDollars(Number(d) / 100)}`)
      .tickSizeOuter(0)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .style('font-size', '11px')
      .call((sel: d3.Selection<SVGGElement, unknown, null, undefined>) =>
        sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
      )
      .call((sel: d3.Selection<SVGGElement, unknown, null, undefined>) =>
        sel.selectAll('.tick text').attr('fill', 'currentColor')
      )

    g.append('g')
      .call(yAxis)
      .style('font-size', '10px')
      .call((sel: d3.Selection<SVGGElement, unknown, null, undefined>) =>
        sel.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)
      )
      .call((sel: d3.Selection<SVGGElement, unknown, null, undefined>) =>
        sel.selectAll('.tick text').attr('fill', 'currentColor')
      )

    if (avg != null) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(avg))
        .attr('y2', yScale(avg))
        .attr('stroke', 'var(--vantura-chart-average, #f2994a)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 4')
    }

    // Conditionally render visible series
    if (showCurrent) {
      const area = d3
        .area<MonthSpendingSeriesPoint>()
        .defined(currentLine.defined())
        .x((d) => xScale(d.day))
        .y0(innerHeight)
        .y1((d) => {
          const { currentValues } = getMetricValues([d], metric)
          return yScale(currentValues[0] ?? 0)
        })

      g.append('path')
        .datum(points)
        .attr('fill', currentFill)
        .attr('stroke', 'none')
        .attr('d', area)
        .attr('opacity', 0.9)

      g.append('path')
        .datum(points)
        .attr('stroke', currentStroke)
        .attr('stroke-width', 2)
        .attr('fill', 'none')
        .attr('d', currentLine)
        .attr('opacity', 0.9)
    }

    if (showPrevious) {
      g.append('path')
        .datum(points)
        .attr('stroke', previousStroke)
        .attr('stroke-width', 2)
        .attr('fill', 'none')
        .attr('d', previousLine)
        .attr('opacity', 0.9)
    }

    // Hover tooltip + markers (matches behavior used in other D3 charts)
    const tooltipEl = tooltipRef.current
    const currentKey =
      metric === 'spending'
        ? 'currentSpending'
        : metric === 'income'
          ? 'currentIncome'
          : 'currentNet'
    const previousKey =
      metric === 'spending'
        ? 'previousSpending'
        : metric === 'income'
          ? 'previousIncome'
          : 'previousNet'

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
      .attr('fill', 'var(--vantura-chart-average, #f2994a)')
      .style('display', 'none')

    const showTooltip = (
      point: MonthSpendingSeriesPoint,
      event: MouseEvent
    ) => {
      if (!tooltipEl || !container.parentElement) return

      const lines: string[] = []
      if (showPrevious) {
        const v = point[previousKey] as number | null
        const formatted = v == null ? 'No data' : `$${formatMoney(v)}`
        lines.push(`${previousLineLabel}: ${formatted}`)
      }
      if (showCurrent) {
        const v = point[currentKey] as number | null
        const formatted = v == null ? 'No data' : `$${formatMoney(v)}`
        lines.push(`${currentLineLabel}: ${formatted}`)
      }
      if (avg != null) {
        lines.push(`Average: $${formatMoney(avg)}`)
      }

      const dayTitle = formatTitleResolved(point.day)
      if (lines.length === 0) {
        tooltipEl.innerHTML = `<strong>${dayTitle}</strong><br/>No series selected`
        tooltipEl.style.display = 'block'
        // Positioning still matters; we'll reuse existing placement logic below.
      } else {
        tooltipEl.innerHTML = `<strong>${dayTitle}</strong><br/>${lines.join(
          '<br/>'
        )}`
        tooltipEl.style.display = 'block'
      }

      const wr = container.parentElement.getBoundingClientRect()
      const tw = tooltipEl.offsetWidth || 160
      const th = tooltipEl.offsetHeight || 50

      let leftPx = event.clientX - wr.left + TOOLTIP_OFFSET
      let topPx = event.clientY - wr.top + TOOLTIP_OFFSET
      leftPx = Math.max(
        TOOLTIP_PADDING,
        Math.min(wr.width - tw - TOOLTIP_PADDING, leftPx)
      )
      topPx = Math.max(
        TOOLTIP_PADDING,
        Math.min(wr.height - th - TOOLTIP_PADDING, topPx)
      )
      tooltipEl.style.left = `${leftPx}px`
      tooltipEl.style.top = `${topPx}px`
    }

    const hideTooltip = () => {
      if (tooltipEl) tooltipEl.style.display = 'none'
      hoverGuide.style('display', 'none')
      hoverCurrentDot.style('display', 'none')
      hoverPreviousDot.style('display', 'none')
      hoverAverageDot.style('display', 'none')
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
        const [mx] = d3.pointer(event, this)
        const rawDay = xScale.invert(mx)
        const day = Math.max(1, Math.min(points.length, Math.round(rawDay)))
        const point = points[day - 1]

        const x = xScale(point.day)
        hoverGuide.attr('x1', x).attr('x2', x).style('display', 'block')

        if (showCurrent) {
          const v = point[currentKey] as number | null
          if (v != null) {
            hoverCurrentDot
              .attr('cx', x)
              .attr('cy', yScale(v))
              .style('display', 'block')
          } else {
            hoverCurrentDot.style('display', 'none')
          }
        } else {
          hoverCurrentDot.style('display', 'none')
        }

        if (showPrevious) {
          const v = point[previousKey] as number | null
          if (v != null) {
            hoverPreviousDot
              .attr('cx', x)
              .attr('cy', yScale(v))
              .style('display', 'block')
          } else {
            hoverPreviousDot.style('display', 'none')
          }
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

        showTooltip(point, event)
      })
      .on('mouseleave', function () {
        hideTooltip()
      })

    return () => {
      hideTooltip()
      d3.select(container).selectAll('*').remove()
    }
  }, [
    prepared,
    metric,
    width,
    height,
    showCurrent,
    showPrevious,
    showAverage,
    formatXResolved,
    formatTitleResolved,
    previousLineLabel,
    currentLineLabel,
  ])

  if (!series || series.points.length === 0) {
    return (
      <div className={className} style={style}>
        <div className="small text-muted">
          Not enough data to show chart yet.
        </div>
      </div>
    )
  }

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
