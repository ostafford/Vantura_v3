import type { NarrativeInsight } from '@/services/insights'

const NARRATIVE_ICONS: Record<NarrativeInsight['type'], string> = {
  win: 'mdi-check-circle-outline',
  challenge: 'mdi-alert-circle-outline',
  opportunity: 'mdi-lightbulb-outline',
}

const NARRATIVE_COLORS: Record<NarrativeInsight['type'], string> = {
  win: 'text-success',
  challenge: 'text-danger',
  opportunity: 'text-warning',
}

export function ComparisonNarratives({
  narratives,
}: {
  narratives: NarrativeInsight[]
}) {
  if (narratives.length === 0) return null
  return (
    <div className="mt-3 pt-2 border-top">
      {narratives.map((n, i) => (
        <div key={i} className="d-flex align-items-start gap-1 mb-1">
          <i
            className={`mdi ${NARRATIVE_ICONS[n.type]} ${NARRATIVE_COLORS[n.type]}`}
            aria-hidden
            style={{ fontSize: '0.95rem', marginTop: 1 }}
          />
          <span className="small">{n.label}</span>
        </div>
      ))}
    </div>
  )
}
