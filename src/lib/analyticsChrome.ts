import { matchPath } from 'react-router-dom'
import { getTracker } from '@/services/trackers'
import type { PageBreadcrumbItem } from '@/components/PageBreadcrumb'

const FALLBACK_ICON = 'mdi-chart-box'

export type AnalyticsChrome = {
  breadcrumbItems: PageBreadcrumbItem[]
  pageTitle: string
  pageTitleIcon: string
}

/**
 * Resolves analytics shell title, icon, and breadcrumbs from the current pathname.
 * Used with BrowserRouter (useMatches requires createBrowserRouter / RouterProvider).
 */
export function resolveAnalyticsChrome(pathname: string): AnalyticsChrome {
  const dash: PageBreadcrumbItem = { label: 'Dashboard', to: '/' }

  const trackerDetail = matchPath('/analytics/trackers/:trackerId', pathname)
  if (trackerDetail?.params.trackerId != null) {
    const id = parseInt(trackerDetail.params.trackerId, 10)
    const name = !Number.isNaN(id)
      ? (getTracker(id)?.name ?? 'Tracker')
      : 'Tracker'
    return {
      pageTitle: name,
      pageTitleIcon: 'mdi-chart-line',
      breadcrumbItems: [
        dash,
        { label: 'Analytics', to: '/analytics' },
        { label: 'Trackers', to: '/analytics/trackers' },
        { label: name },
      ],
    }
  }

  if (matchPath({ path: '/analytics/trackers', end: true }, pathname)) {
    return {
      pageTitle: 'Trackers',
      pageTitleIcon: 'mdi-chart-line',
      breadcrumbItems: [
        dash,
        { label: 'Analytics', to: '/analytics' },
        { label: 'Trackers' },
      ],
    }
  }

  if (matchPath({ path: '/analytics/savers', end: true }, pathname)) {
    return {
      pageTitle: 'Savers',
      pageTitleIcon: 'mdi-piggy-bank',
      breadcrumbItems: [
        dash,
        { label: 'Analytics', to: '/analytics' },
        { label: 'Savers' },
      ],
    }
  }

  if (matchPath('/analytics/savers/:saverId', pathname)) {
    return {
      pageTitle: 'Savers',
      pageTitleIcon: 'mdi-piggy-bank',
      breadcrumbItems: [
        dash,
        { label: 'Analytics', to: '/analytics' },
        { label: 'Savers' },
      ],
    }
  }

  if (matchPath({ path: '/analytics/insights', end: true }, pathname)) {
    return {
      pageTitle: 'Weekly insights',
      pageTitleIcon: 'mdi-chart-bar',
      breadcrumbItems: [
        dash,
        { label: 'Analytics', to: '/analytics' },
        { label: 'Weekly insights' },
      ],
    }
  }

  if (matchPath({ path: '/analytics/reports', end: true }, pathname)) {
    return {
      pageTitle: 'Reports',
      pageTitleIcon: 'mdi-file-chart',
      breadcrumbItems: [
        dash,
        { label: 'Analytics', to: '/analytics' },
        { label: 'Reports' },
      ],
    }
  }

  if (matchPath({ path: '/analytics/monthly-review', end: true }, pathname)) {
    return {
      pageTitle: 'Monthly review',
      pageTitleIcon: 'mdi-calendar-month',
      breadcrumbItems: [
        dash,
        { label: 'Analytics', to: '/analytics' },
        { label: 'Monthly review' },
      ],
    }
  }

  if (matchPath({ path: '/analytics', end: true }, pathname)) {
    return {
      pageTitle: 'Analytics',
      pageTitleIcon: 'mdi-chart-box',
      breadcrumbItems: [dash, { label: 'Analytics' }],
    }
  }

  return {
    pageTitle: 'Analytics',
    pageTitleIcon: FALLBACK_ICON,
    breadcrumbItems: [dash, { label: 'Analytics' }],
  }
}
