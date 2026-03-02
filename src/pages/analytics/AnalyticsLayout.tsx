import { Link, Outlet } from 'react-router-dom'

export function AnalyticsLayout() {
  return (
    <div>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon bg-gradient-primary text-white mr-2">
            <i className="mdi mdi-chart-box" aria-hidden />
          </span>
          Analytics
        </h3>
        <nav aria-label="breadcrumb">
          <ol className="breadcrumb">
            <li className="breadcrumb-item">
              <Link to="/">Dashboard</Link>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              Analytics
            </li>
          </ol>
        </nav>
      </div>

      <Outlet />
    </div>
  )
}
