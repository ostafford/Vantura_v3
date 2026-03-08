/**
 * Simple flow diagram: Income (left) to spending categories (right).
 * Link width is proportional to amount. Used on Reports page.
 */

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { CategoryBreakdownRow } from '@/services/insights'
import { getInsightsCategoryColors } from '@/lib/chartColors'
import { normalizeCategoryIdForColor } from '@/lib/chartColors'
import { UNCATEGORISED_COLOR_KEY } from '@/lib/chartColors'
import { ACCENT_PALETTES } from '@/lib/accentPalettes'
import { useStore } from 'zustand'
import { accentStore } from '@/stores/accentStore'
const NODE_WIDTH = 12
const COLUMN_GAP = 80
const MIN_LINK_WIDTH = 2
const MAX_LINK_WIDTH = 24

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
  const accent = useStore(accentStore, (s) => s.accent)
  const chartPalette = ACCENT_PALETTES[accent].chartPalette
  const categoryColors = getInsightsCategoryColors()

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || width <= 0 || height <= 0) return

    const totalOut = categories.reduce((s, c) => s + c.total, 0)
    const maxFlow = Math.max(moneyInCents, totalOut, 1)
    const linkScale = d3
      .scaleLinear()
      .domain([0, maxFlow])
      .range([MIN_LINK_WIDTH, MAX_LINK_WIDTH])
      .clamp(true)

    const leftX = 20
    const rightX = width - 20 - NODE_WIDTH
    const centerY = height / 2

    // Income node (left, single)
    const incomeNodeY = centerY - NODE_WIDTH / 2
    // Category nodes (right, stacked)
    const catHeight = (height - 40) / Math.max(categories.length, 1)
    const categoryNodes = categories.map((c, i) => ({
      ...c,
      y: 20 + i * catHeight + (catHeight - NODE_WIDTH) / 2,
    }))

    const g = d3.select(svg).selectChild<SVGGElement>('g')
    if (!g.empty()) g.remove()

    const container = d3
      .select(svg)
      .append('g')
      .attr('transform', 'translate(0,0)')

    // Links: Income (center) to each category
    categoryNodes.forEach((cat, i) => {
      const linkWidth = linkScale(cat.total)
      const colorKey = normalizeCategoryIdForColor(cat.category_id)
      const color =
        categoryColors[colorKey] ??
        categoryColors[UNCATEGORISED_COLOR_KEY] ??
        chartPalette[i % chartPalette.length]
      const path = d3.line().curve(d3.curveMonotoneX)([
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

    // Income node (rectangle)
    container
      .append('rect')
      .attr('x', leftX)
      .attr('y', incomeNodeY)
      .attr('width', NODE_WIDTH)
      .attr('height', NODE_WIDTH)
      .attr('fill', chartPalette[0])
      .attr('opacity', 0.9)
      .attr('rx', 2)

    // Category nodes
    categoryNodes.forEach((cat, i) => {
      const colorKey = normalizeCategoryIdForColor(cat.category_id)
      const color =
        categoryColors[colorKey] ??
        categoryColors[UNCATEGORISED_COLOR_KEY] ??
        chartPalette[i % chartPalette.length]
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

    // Labels in a separate layer so they're not clipped
    const labelG = d3.select(svg).selectChild<SVGGElement>('g.labels')
    if (!labelG.empty()) labelG.remove()
    const labels = d3.select(svg).append('g').attr('class', 'labels')
    labels
      .append('text')
      .attr('x', leftX - 4)
      .attr('y', centerY + 4)
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--vantura-text, #1a1a1a)')
      .attr('font-size', 11)
      .text('Income')
    categoryNodes.forEach((cat) => {
      labels
        .append('text')
        .attr('x', rightX + NODE_WIDTH + 4)
        .attr('y', cat.y + NODE_WIDTH / 2 + 4)
        .attr('text-anchor', 'start')
        .attr('fill', 'var(--vantura-text, #1a1a1a)')
        .attr('font-size', 10)
        .text(
          cat.category_name.length > 12
            ? cat.category_name.slice(0, 11) + '…'
            : cat.category_name
        )
    })
  }, [
    moneyInCents,
    categories,
    width,
    height,
    accent,
    categoryColors,
    chartPalette,
  ])

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
