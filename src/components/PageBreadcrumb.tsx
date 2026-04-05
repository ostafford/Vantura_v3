import { Link } from 'react-router-dom'

export type PageBreadcrumbItem = { label: string; to?: string }

type PageBreadcrumbProps = {
  items: PageBreadcrumbItem[]
  className?: string
}

export function PageBreadcrumb({ items, className }: PageBreadcrumbProps) {
  if (items.length === 0) return null
  return (
    <nav aria-label="breadcrumb" className={className}>
      <ol className="breadcrumb mb-0">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li
              key={`${item.label}-${i}`}
              className={`breadcrumb-item${isLast ? ' active' : ''}`}
              aria-current={isLast ? 'page' : undefined}
            >
              {item.to != null && !isLast ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                item.label
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
