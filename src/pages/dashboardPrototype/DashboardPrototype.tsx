// PROTOTYPE — throwaway. Wayfinder ticket #181: Dashboard after the cuts.
// Three variants, switchable via ?variant=A|B|C on the existing / route;
// fixture data only. ?headroom=pos|neg, ?review=on|off.
import { useSearchParams } from 'react-router-dom'
import { PrototypeSwitcher } from '@/components/prototype/PrototypeSwitcher'
import { getFixture } from './fixture'
import { VariantA, variantAName } from './VariantA'
import { VariantB, variantBName } from './VariantB'
import { VariantC, variantCName } from './VariantC'

export function DashboardPrototype() {
  const [params] = useSearchParams()
  const variant = params.get('variant') ?? 'A'
  const f = getFixture({
    neg: params.get('headroom') === 'neg',
    review: params.get('review') !== 'off',
  })
  return (
    <div style={{ paddingBottom: 80 }}>
      <div className="page-header">
        <h3 className="page-title">Dashboard</h3>
      </div>
      <div
        className="mb-3 px-2 py-1 small"
        style={{
          border: '1px dashed var(--bs-warning)',
          borderRadius: 6,
          color: 'var(--bs-secondary-color)',
        }}
      >
        PROTOTYPE · fixture data · drop <code>?variant=</code> to return to the
        real page
      </div>
      {variant === 'A' && <VariantA f={f} />}
      {variant === 'B' && <VariantB f={f} />}
      {variant === 'C' && <VariantC f={f} />}
      <PrototypeSwitcher
        variants={[
          { key: 'A', name: variantAName },
          { key: 'B', name: variantBName },
          { key: 'C', name: variantCName },
        ]}
        toggles={[
          {
            param: 'headroom',
            options: [
              { value: 'pos', label: 'Headroom +' },
              { value: 'neg', label: 'Headroom −' },
            ],
          },
          {
            param: 'review',
            options: [
              { value: 'on', label: 'Review on' },
              { value: 'off', label: 'Review off' },
            ],
          },
        ]}
      />
    </div>
  )
}
