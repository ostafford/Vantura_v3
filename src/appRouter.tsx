import {
  createBrowserRouter,
  Navigate,
  Link,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router-dom'
import { Layout } from '@/layout/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { AnalyticsLayout } from '@/pages/analytics/AnalyticsLayout'
import { AnalyticsIndex } from '@/pages/analytics/AnalyticsIndex'
import { AnalyticsTrackers } from '@/pages/analytics/AnalyticsTrackers'
import { AnalyticsTrackersDetail } from '@/pages/analytics/AnalyticsTrackersDetail'
import { AnalyticsReports } from '@/pages/analytics/AnalyticsReports'
import { AnalyticsSavers } from '@/pages/analytics/AnalyticsSavers'
import { AnalyticsNetWorth } from '@/pages/analytics/AnalyticsNetWorth'
import { AnalyticsBudgetPlan } from '@/pages/analytics/AnalyticsBudgetPlan'
import { AnalyticsBudgetPlanBucket } from '@/pages/analytics/AnalyticsBudgetPlanBucket'
import { Settings } from '@/pages/Settings'
import { Help } from '@/pages/Help'
import { Changelog } from '@/pages/Changelog'
import { SaverAccountTransactionsRedirect } from '@/routing/SaverAccountTransactionsRedirect'
import type { AppRouteHandle } from '@/types/appRouteHandle'

function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'An unexpected error occurred.'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
        backgroundColor: 'var(--vantura-background, #13131c)',
        color: 'var(--vantura-text, #e4e4f0)',
      }}
    >
      <h2 className="mb-3">Something went wrong</h2>
      <p className="text-muted mb-3 text-center">{message}</p>
      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.location.assign('/')}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="text-center py-5">
      <h2 className="mb-3">Page not found</h2>
      <p className="text-muted mb-3">
        The page you're looking for doesn't exist.
      </p>
      <Link to="/" className="btn btn-primary">
        Go to Dashboard
      </Link>
    </div>
  )
}

export const appRouter = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'plan', element: <Navigate to="/analytics" replace /> },
        { path: 'transactions', element: <Transactions /> },
        {
          path: 'analytics',
          element: <AnalyticsLayout />,
          handle: {
            breadcrumbLabel: 'Analytics',
          } satisfies AppRouteHandle,
          children: [
            {
              index: true,
              element: <AnalyticsIndex />,
              handle: {
                pageTitle: 'Analytics',
                pageTitleIcon: 'mdi-chart-box',
              } satisfies AppRouteHandle,
            },
            {
              path: 'budget',
              element: <AnalyticsBudgetPlan />,
              handle: {
                breadcrumbLabel: 'Budget Plan',
                pageTitle: 'Budget Plan',
                pageTitleIcon: 'mdi-wallet-outline',
              } satisfies AppRouteHandle,
            },
            {
              path: 'budget/:bucketId',
              element: <AnalyticsBudgetPlanBucket />,
              handle: {
                breadcrumbBefore: {
                  label: 'Budget Plan',
                  to: '/analytics/budget',
                },
                useBucketName: true,
                pageTitleIcon: 'mdi-wallet-outline',
              } satisfies AppRouteHandle,
            },
            {
              path: 'income',
              element: <Navigate to="/analytics" replace />,
            },
            {
              path: 'trackers',
              element: <AnalyticsTrackers />,
              handle: {
                breadcrumbLabel: 'Trackers',
                pageTitle: 'Trackers',
                pageTitleIcon: 'mdi-chart-line',
              } satisfies AppRouteHandle,
            },
            {
              path: 'trackers/:trackerId',
              element: <AnalyticsTrackersDetail />,
              handle: {
                breadcrumbBefore: {
                  label: 'Trackers',
                  to: '/analytics/trackers',
                },
                useTrackerName: true,
                pageTitleIcon: 'mdi-chart-line',
              } satisfies AppRouteHandle,
            },
            {
              path: 'savers',
              element: <AnalyticsSavers />,
              handle: {
                breadcrumbLabel: 'Savers',
                pageTitle: 'Savers',
                pageTitleIcon: 'mdi-piggy-bank',
              } satisfies AppRouteHandle,
            },
            {
              path: 'savers/:saverId',
              element: <SaverAccountTransactionsRedirect />,
            },
            {
              path: 'maybuys',
              element: <Navigate to="/analytics" replace />,
            },
            {
              path: 'wants',
              element: <Navigate to="/analytics" replace />,
            },
            {
              path: 'wants/:wantId',
              element: <Navigate to="/analytics" replace />,
            },
            {
              path: 'goals',
              element: <Navigate to="/analytics" replace />,
            },
            {
              path: 'goals/:goalId',
              element: <Navigate to="/analytics" replace />,
            },
            {
              path: 'insights',
              element: <Navigate to="/analytics/reports" replace />,
            },
            {
              path: 'reports',
              element: <AnalyticsReports />,
              handle: {
                breadcrumbLabel: 'Reports',
                pageTitle: 'Reports',
                pageTitleIcon: 'mdi-file-chart',
                noLayoutHeader: true,
              } satisfies AppRouteHandle,
            },
            {
              path: 'net-worth',
              element: <AnalyticsNetWorth />,
              handle: {
                breadcrumbLabel: 'Net Worth',
                pageTitle: 'Net Worth',
                pageTitleIcon: 'mdi-chart-timeline-variant',
              } satisfies AppRouteHandle,
            },
            {
              path: 'monthly-review',
              element: <Navigate to="/analytics/reports" replace />,
            },
          ],
        },
        { path: 'settings', element: <Settings /> },
        { path: 'help', element: <Help /> },
        { path: 'changelog', element: <Changelog /> },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL }
)
