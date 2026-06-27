import { useMemo } from 'react'
import { Outlet, useMatches } from 'react-router-dom'
import {
  PageBreadcrumb,
  type PageBreadcrumbItem,
} from '@/components/PageBreadcrumb'
import type { AppRouteHandle } from '@/types/appRouteHandle'
import { getTracker } from '@/services/trackers'
import { getBucket } from '@/services/budgetBuckets'

function buildAnalyticsBreadcrumbItems(matches: ReturnType<typeof useMatches>) {
  const items: PageBreadcrumbItem[] = [{ label: 'Dashboard', to: '/' }]

  for (const m of matches) {
    const h = m.handle as AppRouteHandle | undefined
    if (!h) continue

    if (h.breadcrumbBefore) {
      items.push({
        label: h.breadcrumbBefore.label,
        to: h.breadcrumbBefore.to,
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
      const raw = m.params.bucketId
      const id = raw != null ? parseInt(raw, 10) : NaN
      const name = !Number.isNaN(id)
        ? (getBucket(id)?.name ?? 'Bucket')
        : 'Bucket'
      items.push({ label: name, to: undefined })
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

function resolveAnalyticsPageTitle(matches: ReturnType<typeof useMatches>) {
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
      const raw = m.params.bucketId
      const id = raw != null ? parseInt(raw, 10) : NaN
      const title = !Number.isNaN(id)
        ? (getBucket(id)?.name ?? 'Bucket')
        : 'Bucket'
      return {
        pageTitle: title,
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
  const breadcrumbItems = useMemo(
    () => buildAnalyticsBreadcrumbItems(matches),
    [matches]
  )
  const { pageTitle, pageTitleIcon } = useMemo(
    () => resolveAnalyticsPageTitle(matches),
    [matches]
  )

  const suppressHeader = matches.some(
    (m) => (m.handle as AppRouteHandle | undefined)?.noLayoutHeader === true
  )

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
            <PageBreadcrumb items={breadcrumbItems} />
          </div>
        </div>
      )}

      <Outlet />
    </div>
  )
}
