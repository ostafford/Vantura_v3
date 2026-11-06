import { useMemo } from 'react'
import { Outlet, useMatches, useLocation } from 'react-router-dom'
import { useStore } from 'zustand'
import {
  PageBreadcrumb,
  type PageBreadcrumbItem,
} from '@/components/PageBreadcrumb'
import type { AppRouteHandle } from '@/types/appRouteHandle'
import { getTracker } from '@/services/trackers'
import { bucketInMonth } from '@/components/budgetPlan/planMonth'
import {
  sidebarPinsStore,
  PINNABLE_ANALYTICS_PAGES,
} from '@/stores/sidebarPinsStore'

/** The bucket a `budget/:bucketId` match names, in the month its `?month=` shows (#243). */
function matchBucket(m: ReturnType<typeof useMatches>[number], search: string) {
  const raw = m.params.bucketId
  const id = raw != null ? parseInt(raw, 10) : NaN
  if (Number.isNaN(id)) return { name: 'Bucket', search: '' }
  const found = bucketInMonth(id, search)
  return { name: found.name ?? 'Bucket', search: found.search }
}

function buildAnalyticsBreadcrumbItems(
  matches: ReturnType<typeof useMatches>,
  search: string
) {
  const items: PageBreadcrumbItem[] = [{ label: 'Dashboard', to: '/' }]

  for (const m of matches) {
    const h = m.handle as AppRouteHandle | undefined
    if (!h) continue

    if (h.breadcrumbBefore) {
      // The bucket page's month carries back to the Budget Plan (#243).
      const carry = h.useBucketName ? matchBucket(m, search).search : ''
      items.push({
        label: h.breadcrumbBefore.label,
        to: `${h.breadcrumbBefore.to}${carry}`,
      })
    }

    if (h.useTrackerName) {
      const raw = m.params.trackerId
      const id = raw != null ? parseInt(raw, 10) : NaN
      const name = !Number.isNaN(id)
        ? (getTracker(id)?.name ?? 'Tracker')
        : 'Tracker'
      items.push({ label: name, to: undefined })
      continue
    }

    if (h.useBucketName) {
      items.push({ label: matchBucket(m, search).name, to: undefined })
      continue
    }

    if (h.breadcrumbLabel) {
      items.push({ label: h.breadcrumbLabel, to: m.pathname })
    }
  }

  if (items.length >= 2) {
    const last = items[items.length - 1]
    items[items.length - 1] = { label: last.label }
  }

  return items
}

function resolveAnalyticsPageTitle(
  matches: ReturnType<typeof useMatches>,
  search: string
) {
  const fallbackIcon = 'mdi-chart-box'
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    const h = m.handle as AppRouteHandle | undefined
    if (!h) continue
    if (h.useTrackerName) {
      const raw = m.params.trackerId
      const id = raw != null ? parseInt(raw, 10) : NaN
      const title = !Number.isNaN(id)
        ? (getTracker(id)?.name ?? 'Tracker')
        : 'Tracker'
      return {
        pageTitle: title,
        pageTitleIcon: h.pageTitleIcon ?? fallbackIcon,
      }
    }

    if (h.useBucketName) {
      return {
        pageTitle: matchBucket(m, search).name,
        pageTitleIcon: h.pageTitleIcon ?? fallbackIcon,
      }
    }
    if (h.pageTitle != null || h.pageTitleIcon != null) {
      return {
        pageTitle: h.pageTitle ?? '',
        pageTitleIcon: h.pageTitleIcon ?? fallbackIcon,
      }
    }
  }
  return { pageTitle: 'Analytics', pageTitleIcon: fallbackIcon }
}

export function AnalyticsLayout() {
  const matches = useMatches()
  const location = useLocation()
  const pins = useStore(sidebarPinsStore, (s) => s.pins)

  const breadcrumbItems = useMemo(
    () => buildAnalyticsBreadcrumbItems(matches, location.search),
    [matches, location.search]
  )
  const { pageTitle, pageTitleIcon } = useMemo(
    () => resolveAnalyticsPageTitle(matches, location.search),
    [matches, location.search]
  )

  const suppressHeader = matches.some(
    (m) => (m.handle as AppRouteHandle | undefined)?.noLayoutHeader === true
  )

  const pinnablePage = PINNABLE_ANALYTICS_PAGES.find(
    (p) => p.path === location.pathname
  )
  const isPinned =
    pinnablePage != null && pins.some((p) => p.path === pinnablePage.path)

  return (
    <div>
      {!suppressHeader && (
        <div className="sticky-toolbar">
          <div className="page-header" style={{ margin: 0 }}>
            <h3 className="page-title">
              <span className="page-title-icon">
                <i className={`mdi ${pageTitleIcon}`} aria-hidden />
              </span>
              {pageTitle}
            </h3>
            <div className="d-flex align-items-center gap-2">
              {pinnablePage && (
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() =>
                    sidebarPinsStore.getState().toggle(pinnablePage)
                  }
                  aria-label={
                    isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'
                  }
                  title={isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
                >
                  <i
                    className={`mdi ${isPinned ? 'mdi-pin' : 'mdi-pin-outline'}`}
                    aria-hidden
                  />
                </button>
              )}
              <PageBreadcrumb items={breadcrumbItems} />
            </div>
          </div>
        </div>
      )}

      <Outlet />
    </div>
  )
}
