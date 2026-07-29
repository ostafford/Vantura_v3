/**
 * Simple flow diagram: Income (left) to spending categories (right).
 * Link width is proportional to amount. Used on Reports page.
 */

import { useEffect, useRef } from 'react'
import { select, scaleLinear, line, curveMonotoneX } from 'd3'
import type { CategoryBreakdownRow } from '@/services/insights'
import { getInsightsCategoryColors } from '@/lib/chartColors'
import { normalizeCategoryIdForColor } from '@/lib/chartColors'
import { UNCATEGORISED_COLOR_KEY } from '@/lib/chartColors'
const NODE_WIDTH = 12
const COLUMN_GAP = 80
const MIN_LINK_WIDTH = 2
const MAX_LINK_WIDTH = 24
const CHART_PALETTE = ['#c2def8', '#90caf9', '#5b9fd4']

export interface SankeyFlowChartProps {
  moneyInCents: number
  categories: CategoryBreakdownRow[]
  width: number
  height: number
  ariaLabel?: string
}

export function SankeyFlowChart({
  moneyInCents,
  categories,
  width,
  height,
  ariaLabel = 'Income to spending flow',
}: SankeyFlowChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const categoryColors = getInsightsCategoryColors()

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || width <= 0 || height <= 0) return

    const totalOut = categories.reduce((s, c) => s + c.total, 0)
    const maxFlow = Math.max(moneyInCents, totalOut, 1)
    const linkScale = scaleLinear()
      .domain([0, maxFlow])
      .range([MIN_LINK_WIDTH, MAX_LINK_WIDTH])
      .clamp(true)

    const leftX = 20
    const rightX = width - 20 - NODE_WIDTH
    const centerY = height / 2

    const incomeNodeY = centerY - NODE_WIDTH / 2
    const catHeight = (height - 40) / Math.max(categories.length, 1)
    const categoryNodes = categories.map((c, i) => ({
      ...c,
      y: 20 + i * catHeight + (catHeight - NODE_WIDTH) / 2,
    }))

    const g = select(svg).selectChild<SVGGElement>('g')
    if (!g.empty()) g.remove()

    const container = select(svg)
      .append('g')
      .attr('transform', 'translate(0,0)')

    categoryNodes.forEach((cat, i) => {
      const linkWidth = linkScale(cat.total)
      const colorKey = normalizeCategoryIdForColor(cat.category_id)
      const color =
        categoryColors[colorKey] ??
        categoryColors[UNCATEGORISED_COLOR_KEY] ??
        CHART_PALETTE[i % CHART_PALETTE.length]
      const path = line().curve(curveMonotoneX)([
        [leftX + NODE_WIDTH, centerY],
        [leftX + NODE_WIDTH + COLUMN_GAP * 0.3, centerY],
        [rightX - COLUMN_GAP * 0.3, cat.y + NODE_WIDTH / 2],
        [rightX, cat.y + NODE_WIDTH / 2],
      ]) as string
      container
        .append('path')
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', linkWidth)
        .attr('stroke-opacity', 0.8)
        .attr('stroke-linecap', 'round')
    })

    container
      .append('rect')
      .attr('x', leftX)
      .attr('y', incomeNodeY)
      .attr('width', NODE_WIDTH)
      .attr('height', NODE_WIDTH)
      .attr('fill', CHART_PALETTE[0])
      .attr('opacity', 0.9)
      .attr('rx', 2)

    categoryNodes.forEach((cat, i) => {
      const colorKey = normalizeCategoryIdForColor(cat.category_id)
      const color =
        categoryColors[colorKey] ??
        categoryColors[UNCATEGORISED_COLOR_KEY] ??
        CHART_PALETTE[i % CHART_PALETTE.length]
      container
        .append('rect')
        .attr('x', rightX)
        .attr('y', cat.y)
        .attr('width', NODE_WIDTH)
        .attr('height', NODE_WIDTH)
        .attr('fill', color)
        .attr('opacity', 0.9)
        .attr('rx', 2)
    })

    const labelG = select(svg).selectChild<SVGGElement>('g.labels')
    if (!labelG.empty()) labelG.remove()
    const labels = select(svg).append('g').attr('class', 'labels')
    labels
      .append('text')
      .attr('x', leftX - 4)
      .attr('y', centerY + 4)
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--vantura-text, #e4e4f0)')
      .attr('font-size', 11)
      .text('Income')
    categoryNodes.forEach((cat) => {
      labels
        .append('text')
        .attr('x', rightX + NODE_WIDTH + 4)
        .attr('y', cat.y + NODE_WIDTH / 2 + 4)
        .attr('text-anchor', 'start')
        .attr('fill', 'var(--vantura-text, #e4e4f0)')
        .attr('font-size', 10)
        .text(
          cat.category_name.length > 12
            ? cat.category_name.slice(0, 11) + '…'
            : cat.category_name
        )
    })
  }, [moneyInCents, categories, width, height, categoryColors])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel}
      style={{ overflow: 'visible' }}
    />
  )
}
