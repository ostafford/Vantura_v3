/**
 * Route `handle` metadata for analytics shell (data router + useMatches).
 */
export type AppRouteHandle = {
  breadcrumbLabel?: string
  pageTitle?: string
  pageTitleIcon?: string
  breadcrumbBefore?: { label: string; to: string }
  useTrackerName?: boolean
}
