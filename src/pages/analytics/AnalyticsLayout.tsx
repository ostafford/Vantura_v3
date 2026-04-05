import { useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { PageBreadcrumb } from '@/components/PageBreadcrumb'
import { resolveAnalyticsChrome } from '@/lib/analyticsChrome'

export function AnalyticsLayout() {
  const { pathname } = useLocation()
  const { breadcrumbItems, pageTitle, pageTitleIcon } = useMemo(
    () => resolveAnalyticsChrome(pathname),
    [pathname]
  )

  return (
    <div>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-primary text-white mr-2">
            <i className={`mdi ${pageTitleIcon}`} aria-hidden />
          </span>
          {pageTitle}
        </h3>
        <PageBreadcrumb items={breadcrumbItems} />
      </div>

      <Outlet />
    </div>
  )
}
