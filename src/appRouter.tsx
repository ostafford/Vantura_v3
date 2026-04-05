import { createBrowserRouter, Navigate } from 'react-router-dom'
import { Layout } from '@/layout/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { AnalyticsLayout } from '@/pages/analytics/AnalyticsLayout'
import { AnalyticsIndex } from '@/pages/analytics/AnalyticsIndex'
import { AnalyticsTrackers } from '@/pages/analytics/AnalyticsTrackers'
import { AnalyticsTrackersDetail } from '@/pages/analytics/AnalyticsTrackersDetail'
import { AnalyticsInsights } from '@/pages/analytics/AnalyticsInsights'
import { AnalyticsReports } from '@/pages/analytics/AnalyticsReports'
import { AnalyticsMonthlyReview } from '@/pages/analytics/AnalyticsMonthlyReview'
import { AnalyticsSavers } from '@/pages/analytics/AnalyticsSavers'
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
              element: <Navigate to="/analytics" replace />,
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
              element: <AnalyticsInsights />,
              handle: {
                breadcrumbLabel: 'Weekly insights',
                pageTitle: 'Weekly insights',
                pageTitleIcon: 'mdi-chart-bar',
              } satisfies AppRouteHandle,
            },
            {
              path: 'reports',
              element: <AnalyticsReports />,
              handle: {
                breadcrumbLabel: 'Reports',
                pageTitle: 'Reports',
                pageTitleIcon: 'mdi-file-chart',
              } satisfies AppRouteHandle,
            },
            {
              path: 'net-worth',
              element: <Navigate to="/analytics" replace />,
            },
            {
              path: 'monthly-review',
              element: <AnalyticsMonthlyReview />,
              handle: {
                breadcrumbLabel: 'Monthly review',
                pageTitle: 'Monthly review',
                pageTitleIcon: 'mdi-calendar-month',
              } satisfies AppRouteHandle,
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
