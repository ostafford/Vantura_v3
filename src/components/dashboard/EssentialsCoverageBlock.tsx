import { formatMoney } from '@/lib/format'
import type { EssentialsCoverage } from '@/services/essentialsCoverage'

/**
 * Essentials-era Dashboard bill-coverage block (docs/adr/0019 § Presentation;
 * threshold/copy locked in ticket #95). Sits below the classic balance-cards
 * zone, which stays untouched for every user — this is additive, and only
 * ever rendered for an Essentials user with at least one observed
 * Essentials-funded Regular (`coverage.state !== 'hidden'`).
 */
export function EssentialsCoverageBlock({
  coverage,
}: {
  coverage: EssentialsCoverage
}) {
  if (coverage.state === 'hidden') return null

  return (
    <div
      className={`essentials-coverage essentials-coverage--${coverage.state} mb-4`}
    >
      <div className="essentials-coverage__status">
        {coverage.state === 'covered' && (
          <>
            <i
              className="mdi mdi-check-circle essentials-coverage__icon"
              aria-hidden
            />
            All bills covered
          </>
        )}
        {coverage.state === 'partial' && (
          <>
            {coverage.transactionalCount} bill
            {coverage.transactionalCount === 1 ? '' : 's'} still on your
            everyday account
          </>
        )}
        {coverage.state === 'shortfall' && (
          <>
            <i
              className="mdi mdi-alert essentials-coverage__icon"
              aria-hidden
            />
            Essentials Saver may be short $
            {formatMoney(coverage.shortfallCents)} for upcoming bills
          </>
        )}
      </div>
      {coverage.state !== 'covered' && (
        <div className="essentials-coverage__split">
          <div className="essentials-coverage__split-row">
            <span>Reserved here</span>
            <span>${formatMoney(coverage.reservedHereCents)}</span>
          </div>
          <div className="essentials-coverage__split-row">
            <span>Set aside in Essentials</span>
            <span>${formatMoney(coverage.essentialsSetAsideCents)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
