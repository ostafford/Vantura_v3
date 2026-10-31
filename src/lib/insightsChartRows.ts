import { getCategoryColor, getUncategorisedColor } from '@/lib/colorSystem'
import type { ColorMode } from '@/lib/colorSystem'
import type { CategoryGroupSection } from '@/services/insights'
import type { InsightsChartRow } from '@/types/charts'

/**
 * Flattens the grouped weekly breakdown into chart rows. Rows keep the data
 * layer's order (parent groups in the colour system's validated order, then
 * Uncategorised, then Other) — see getWeeklyCategoryBreakdownGrouped's doc.
 * An unlabelled gap row sits between each pair of sections so bars from
 * different hue families are never adjacent — the layout the CVD check
 * assumed (docs/adr/0011).
 */
export function buildInsightsChartRows(
  sections: CategoryGroupSection[],
  mode: ColorMode
): InsightsChartRow[] {
  return sections.flatMap((section, i) => {
    const isNeutral = section.isOther || section.parentId === null
    const bars: InsightsChartRow[] = section.rows.map((r) => {
      const hex = isNeutral
        ? getUncategorisedColor(mode)
        : getCategoryColor(r.category_id, mode)
      return {
        kind: 'bar',
        datum: {
          category_id:
            r.category_id ??
            (section.isOther ? '__other__' : '__uncategorised__'),
          name: r.category_name,
          totalDollars: r.total / 100,
          fill: hex,
          stroke: hex,
        },
      }
    })
    if (i === 0) return bars
    const gap: InsightsChartRow = {
      kind: 'gap',
      key: `gap:${section.parentId ?? section.parentName}`,
    }
    return [gap, ...bars]
  })
}
