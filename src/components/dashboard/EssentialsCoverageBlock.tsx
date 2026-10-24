import { Link } from 'react-router-dom'
import { formatMoney, formatSignedMoney } from '@/lib/format'
import type { EssentialsCoverage } from '@/services/essentialsCoverage'

/**
 * Essentials-era Dashboard bill-coverage block (docs/adr/0019 § Presentation;
 * threshold/copy locked in ticket #95). Sits below the classic balance-cards
 * zone, which stays untouched for every user — this is additive, and only
 * ever rendered for an Essentials user with at least one observed
 * Essentials-funded Regular (`coverage.state !== 'hidden'`) — or, as a
 * notice with no figures, when the nominated Saver is closed or no payday
 * is configured.
 */
export function EssentialsCoverageBlock({
  coverage,
}: {
  coverage: EssentialsCoverage
}) {
  if (coverage.state === 'hidden') return null

  // Declined states: no coverage figures to show, only what to fix.
  if (
    coverage.state === 'saver_unavailable' ||
    coverage.state === 'payday_needed'
  ) {
    const unavailable = coverage.state === 'saver_unavailable'
    return (
      <div
        className={`essentials-coverage essentials-coverage--${coverage.state} mb-4`}
      >
        <div className="essentials-coverage__status" role="status">
          <i
            className={`mdi ${unavailable ? 'mdi-alert' : 'mdi-information-outline'} essentials-coverage__icon`}
            aria-hidden
          />
          {unavailable
            ? 'Your Essentials Saver is closed — choose another in Settings'
            : 'Set your payday to check bill coverage'}
        </div>
        <div className="essentials-coverage__split">
          <Link
            to={unavailable ? '/settings#essentials' : '/settings#payday'}
            className="text-decoration-none"
          >
            {unavailable ? 'Settings → Essentials' : 'Settings → Payday'}
            <i className="mdi mdi-chevron-right" aria-hidden />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`essentials-coverage essentials-coverage--${coverage.state} mb-4`}
    >
      <div className="essentials-coverage__status" role="status">
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
          <div className="essentials-coverage__split-row essentials-coverage__split-row--sub">
            <span>Essentials Saver balance</span>
            <span>{formatSignedMoney(coverage.saverBalanceCents)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
