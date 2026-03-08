import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { NetWorthSnapshot } from '@/services/netWorth'
import { formatMoney } from '@/lib/format'
import {
  estimateLeftAxisValueLabelSpace,
  estimateBottomAxisLabelSpace,
} from '@/lib/chartLabelSpace'

const BORDER_COLOR = 'var(--vantura-border, #ebedf2)'
const MARGIN_TOP = 8
const MARGIN_RIGHT = 24
const LINE_COLOR = 'var(--vantura-primary, #b66dff)'

type NetWorthChartProps = {
  data: NetWorthSnapshot[]
  maxDomain?: number
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function NetWorthChart({
  data,
  maxDomain: maxDomainProp,
  className,
  style,
  'aria-label': ariaLabel,
}: NetWorthChartProps) {
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

    const sorted = [...data].sort((a, b) =>
      a.snapshot_date.localeCompare(b.snapshot_date)
    )
    const maxBalance =
      maxDomainProp ??
      Math.max(...sorted.map((d) => d.total_balance_cents), 100)

    const left = estimateLeftAxisValueLabelSpace(maxBalance / 100, 11)
    const bottom = estimateBottomAxisLabelSpace(
      sorted.map((d) => d.snapshot_date).slice(0, 6),
      10
    )
    const right = MARGIN_RIGHT

    const width = dimensions.width - left - right
    const height = dimensions.height - MARGIN_TOP - bottom

    const xScale = d3
      .scalePoint<string>()
      .domain(sorted.map((d) => d.snapshot_date))
      .range([0, width])
      .padding(0.1)

    const yScale = d3
      .scaleLinear()
      .domain([0, maxBalance])
      .range([height, 0])
      .nice()

    const line = d3
      .line<NetWorthSnapshot>()
      .x((d) => xScale(d.snapshot_date) ?? 0)
      .y((d) => yScale(d.total_balance_cents))

    const svg = containerSelection
      .append('svg')
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .attr('role', 'img')
      .attr('aria-label', ariaLabel ?? 'Net worth over time')

    const g = svg
      .append('g')
      .attr('transform', `translate(${left},${MARGIN_TOP})`)

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(
        d3.axisBottom(xScale).tickFormat((d) => {
          const s = String(d)
          return s.slice(5)
        })
      )
      .selectAll('text')
      .attr('fill', 'var(--vantura-text-secondary, #9c9fa6)')
      .attr('font-size', 10)

    g.append('g')
      .call(d3.axisLeft(yScale).tickFormat((v) => `$${formatMoney(Number(v))}`))
      .selectAll('text')
      .attr('fill', 'var(--vantura-text-secondary, #9c9fa6)')
      .attr('font-size', 10)

    g.selectAll('.domain, .tick line').attr('stroke', BORDER_COLOR)

    g.append('path')
      .datum(sorted)
      .attr('fill', 'none')
      .attr('stroke', LINE_COLOR)
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('d', line)

    g.selectAll('.dot')
      .data(sorted)
      .join('circle')
      .attr('class', 'dot')
      .attr('cx', (d) => xScale(d.snapshot_date) ?? 0)
      .attr('cy', (d) => yScale(d.total_balance_cents))
      .attr('r', 3)
      .attr('fill', LINE_COLOR)
      .attr('stroke', 'var(--vantura-surface, #fff)')
      .attr('stroke-width', 1)
      .on('mouseenter', function (event, d) {
        if (tooltipEl) {
          tooltipEl.textContent = `${d.snapshot_date}: $${formatMoney(d.total_balance_cents)}`
          tooltipEl.style.display = 'block'
          tooltipEl.style.left = `${event.offsetX + 10}px`
          tooltipEl.style.top = `${event.offsetY + 10}px`
        }
      })
      .on('mouseleave', () => {
        if (tooltipEl) tooltipEl.style.display = 'none'
      })
  }, [data, dimensions, maxDomainProp, ariaLabel])

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
