import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Layout } from '@/layout/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { AnalyticsLayout } from '@/pages/analytics/AnalyticsLayout'
import { AnalyticsIndex } from '@/pages/analytics/AnalyticsIndex'
import { AnalyticsTrackers } from '@/pages/analytics/AnalyticsTrackers'
import { AnalyticsTrackersDetail } from '@/pages/analytics/AnalyticsTrackersDetail'
import { AnalyticsReports } from '@/pages/analytics/AnalyticsReports'
import { AnalyticsSavers } from '@/pages/analytics/AnalyticsSavers'
import { AnalyticsBudgetPlan } from '@/pages/analytics/AnalyticsBudgetPlan'
import { AnalyticsBudgetPlanBucket } from '@/pages/analytics/AnalyticsBudgetPlanBucket'
import { Settings } from '@/pages/Settings'
import { Help } from '@/pages/Help'
import { SaverAccountTransactionsRedirect } from '@/routing/SaverAccountTransactionsRedirect'
import type { AppRouteHandle } from '@/types/appRouteHandle'

export const appRouter = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
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
              element: <Navigate to="/analytics" replace />,
            },
            {
              path: 'monthly-review',
              element: <Navigate to="/analytics/reports" replace />,
            },
          ],
        },
        { path: 'settings', element: <Settings /> },
        { path: 'help', element: <Help /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL }
)
