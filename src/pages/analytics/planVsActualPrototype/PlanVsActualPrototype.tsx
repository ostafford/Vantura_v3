// PROTOTYPE — throwaway. Wayfinder ticket #174: plan vs actual on the
// Budget Plan page. Three variants of plan vs actual, switchable via
// ?variant=A|B|C on the existing /analytics/budget route; fixture month
// (fake data), ?month=live|done for day 10 of 30 vs a finished month.
import { useSearchParams } from 'react-router-dom'
import { PrototypeSwitcher } from '@/components/prototype/PrototypeSwitcher'
import { getFixtureMonth } from './fixture'
import { VariantA, variantAName } from './VariantA'
import { VariantB, variantBName } from './VariantB'
import { VariantC, variantCName } from './VariantC'

export function PlanVsActualPrototype() {
  const [params] = useSearchParams()
  const variant = params.get('variant') ?? 'A'
  const month = getFixtureMonth(params.get('month') === 'done' ? 'done' : 'live')
  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        className="mb-3 px-2 py-1 small"
        style={{
          border: '1px dashed var(--bs-warning)',
          borderRadius: 6,
          color: 'var(--bs-secondary-color)',
        }}
      >
        PROTOTYPE · fixture data · drop <code>?variant=</code> to return to the real page
      </div>
      {variant === 'A' && <VariantA month={month} />}
      {variant === 'B' && <VariantB month={month} />}
      {variant === 'C' && <VariantC month={month} />}
      <PrototypeSwitcher
        variants={[
          { key: 'A', name: variantAName },
          { key: 'B', name: variantBName },
          { key: 'C', name: variantCName },
        ]}
        toggles={[
          {
            param: 'month',
            options: [
              { value: 'live', label: 'Day 10/30' },
              { value: 'done', label: 'Finished' },
            ],
          },
        ]}
      />
    </div>
  )
}
