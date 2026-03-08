import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, Form, Row, Col, Button, Dropdown, Modal } from 'react-bootstrap'
import { useStore } from 'zustand'
import {
  getTransactionsGroupedByDate,
  getFilteredTransactionsCount,
  getRoundUpsByParentIds,
  DEFAULT_PAGE_SIZE,
  type TransactionFilters,
  type TransactionSort,
  type TransactionRow,
} from '@/services/transactions'
import { getCategories } from '@/services/categories'
import {
  getTransactionUserDataMap,
  setTransactionUserNote,
  setTransactionUserCategoryOverride,
  suggestCategoryFromRules,
  learnCategoryFromOverride,
} from '@/services/transactionUserData'
import { syncStore } from '@/stores/syncStore'
import {
  formatMoney,
  formatShortDate,
  formatShortDateWithYear,
} from '@/lib/format'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MOBILE_MEDIA_QUERY } from '@/lib/constants'

const SORT_OPTIONS: { value: TransactionSort; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'amount', label: 'Amount' },
  { value: 'merchant', label: 'Merchant' },
]

function useFiltersFromSearchParams(): {
  filters: TransactionFilters
  sort: TransactionSort
  setFilters: (f: TransactionFilters, s: TransactionSort) => void
} {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: TransactionFilters = useMemo(() => {
    let dateFrom = searchParams.get('dateFrom') ?? ''
    let dateTo = searchParams.get('dateTo') ?? ''
    const categoryIds = searchParams.getAll('categoryId').filter(Boolean)
    let amountMin: number | undefined
    let amountMax: number | undefined
    const rawMin = searchParams.get('amountMin')
    const rawMax = searchParams.get('amountMax')
    if (rawMin != null && rawMin !== '') {
      const n = Number(rawMin)
      if (!Number.isNaN(n)) amountMin = n
    }
    if (rawMax != null && rawMax !== '') {
      const n = Number(rawMax)
      if (!Number.isNaN(n)) amountMax = n
    }
    if (amountMin != null && amountMax != null && amountMin > amountMax) {
      ;[amountMin, amountMax] = [amountMax, amountMin]
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      ;[dateFrom, dateTo] = [dateTo, dateFrom]
    }
    const search = searchParams.get('search') ?? undefined
    return {
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(categoryIds.length > 0 && { categoryIds }),
      ...(amountMin != null && { amountMin }),
      ...(amountMax != null && { amountMax }),
      ...(search && { search }),
    }
  }, [searchParams])

  const sort = (searchParams.get('sort') as TransactionSort) || 'date'

  const setFilters = (f: TransactionFilters, s: TransactionSort) => {
    const next = new URLSearchParams()
    if (f.dateFrom) next.set('dateFrom', f.dateFrom)
    if (f.dateTo) next.set('dateTo', f.dateTo)
    if (f.categoryIds?.length) {
      f.categoryIds.forEach((id) => next.append('categoryId', id))
    }
    if (f.amountMin != null) next.set('amountMin', String(f.amountMin))
    if (f.amountMax != null) next.set('amountMax', String(f.amountMax))
    if (f.search) next.set('search', f.search)
    next.set('sort', s)
    setSearchParams(next)
  }

  return { filters, sort, setFilters }
}

export function Transactions() {
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const { filters, sort, setFilters } = useFiltersFromSearchParams()
  const [page, setPage] = useState(0)
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const categories = getCategories()
  const totalCount = useMemo(() => {
    void lastSyncCompletedAt // Recompute when sync completes
    return getFilteredTransactionsCount(filters)
  }, [filters, lastSyncCompletedAt])
  const limit = (page + 1) * DEFAULT_PAGE_SIZE
  const grouped = useMemo(() => {
    void lastSyncCompletedAt // Recompute when sync completes
    return getTransactionsGroupedByDate(filters, sort, {
      limit,
      offset: 0,
    })
  }, [filters, sort, limit, lastSyncCompletedAt])
  const dateKeys = useMemo(
    () => Object.keys(grouped).sort().reverse(),
    [grouped]
  )
  const loadedCount = useMemo(
    () => dateKeys.reduce((n, k) => n + grouped[k].length, 0),
    [dateKeys, grouped]
  )
  const hasMore = loadedCount < totalCount

  const parentIdsByDate = useMemo(() => {
    const all: string[] = []
    for (const rows of Object.values(grouped)) {
      for (const row of rows) all.push(row.id)
    }
    return all
  }, [grouped])

  const roundUpsByParent = useMemo(
    () => getRoundUpsByParentIds(parentIdsByDate),
    [parentIdsByDate]
  )

  const [userDataVersion, setUserDataVersion] = useState(0)
  const userDataMap = useMemo(() => {
    void userDataVersion // invalidate when user saves note/override
    return getTransactionUserDataMap(parentIdsByDate)
  }, [parentIdsByDate, userDataVersion])

  const [editTxId, setEditTxId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const editTxRow = useMemo(() => {
    if (!editTxId) return null
    for (const rows of Object.values(grouped)) {
      const r = rows.find((x) => x.id === editTxId)
      if (r) return r
    }
    return null
  }, [editTxId, grouped])
  const openEditModal = (row: TransactionRow) => {
    const ud = userDataMap[row.id]
    setEditTxId(row.id)
    setEditNote(ud?.user_notes ?? '')
    setEditCategoryId(ud?.user_category_override ?? '')
  }
  const saveEditModal = () => {
    if (!editTxId) return
    setTransactionUserNote(editTxId, editNote.trim() || null)
    setTransactionUserCategoryOverride(editTxId, editCategoryId.trim() || null)
    if (editCategoryId.trim() && editTxRow) {
      learnCategoryFromOverride(editTxRow.description, editCategoryId.trim())
    }
    setEditTxId(null)
    setUserDataVersion((v) => v + 1)
  }

  useEffect(() => {
    setPage(0)
  }, [
    filters.dateFrom,
    filters.dateTo,
    filters.categoryIds,
    filters.amountMin,
    filters.amountMax,
    filters.search,
  ])

  const updateFilter = <K extends keyof TransactionFilters>(
    key: K,
    value: TransactionFilters[K]
  ) => {
    setFilters({ ...filters, [key]: value }, sort)
  }

  const updateSort = (s: TransactionSort) => {
    setFilters(filters, s)
  }

  return (
    <>
      <div className="page-header">
        <h3 className="page-title">
          <span className="page-title-icon">
            <i className="mdi mdi-credit-card-multiple" aria-hidden />
          </span>
          Transactions
        </h3>
      </div>
      <Card className="mb-3 grid-margin">
        <Card.Body>
          {isMobile ? (
            <>
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                <Button
                  variant="outline-secondary"
                  onClick={() => setFiltersDrawerOpen(true)}
                  aria-label="Open filters"
                >
                  <i className="mdi mdi-filter-variant me-1" aria-hidden />
                  Filters
                </Button>
                <Form.Select
                  id="transactions-sort-mobile"
                  value={sort}
                  onChange={(e) =>
                    updateSort(e.target.value as TransactionSort)
                  }
                  className="w-auto"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      Sort: {o.label}
                    </option>
                  ))}
                </Form.Select>
              </div>
              <Modal
                show={filtersDrawerOpen}
                onHide={() => setFiltersDrawerOpen(false)}
                centered
              >
                <Modal.Header closeButton>
                  <Modal.Title>Filters</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  <div className="d-flex flex-column gap-3">
                    <Form.Group>
                      <Form.Label>Date from</Form.Label>
                      <Form.Control
                        id="transactions-filter-date-from-mobile"
                        type="date"
                        value={filters.dateFrom ?? ''}
                        onChange={(e) =>
                          updateFilter('dateFrom', e.target.value || undefined)
                        }
                      />
                    </Form.Group>
                    <Form.Group>
                      <Form.Label>Date to</Form.Label>
                      <Form.Control
                        id="transactions-filter-date-to-mobile"
                        type="date"
                        value={filters.dateTo ?? ''}
                        onChange={(e) =>
                          updateFilter('dateTo', e.target.value || undefined)
                        }
                      />
                    </Form.Group>
                    <Form.Group>
                      <Form.Label>Category</Form.Label>
                      <Dropdown
                        autoClose="outside"
                        onSelect={(e) => {
                          if (e === '__all__') {
                            updateFilter('categoryIds', [])
                            return
                          }
                          if (e == null) return
                          const current = filters.categoryIds ?? []
                          const set = new Set(current)
                          if (set.has(e)) set.delete(e)
                          else set.add(e)
                          updateFilter('categoryIds', Array.from(set))
                        }}
                      >
                        <Dropdown.Toggle
                          id="transactions-filter-category-mobile"
                          variant="outline-secondary"
                          className="w-100 text-start"
                        >
                          {(filters.categoryIds?.length ?? 0) === 0
                            ? 'All categories'
                            : filters.categoryIds!.length === 1
                              ? (categories.find(
                                  (c) => c.id === filters.categoryIds![0]
                                )?.name ?? '1 category')
                              : `${filters.categoryIds!.length} categories`}
                        </Dropdown.Toggle>
                        <Dropdown.Menu className="p-0">
                          <Dropdown.Item
                            eventKey="__all__"
                            active={(filters.categoryIds?.length ?? 0) === 0}
                          >
                            All categories
                          </Dropdown.Item>
                          <Dropdown.Divider />
                          {categories.map((c) => (
                            <Dropdown.Item
                              key={c.id}
                              eventKey={c.id}
                              as="div"
                              className="d-flex align-items-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Form.Check
                                type="checkbox"
                                id={`transactions-cat-mobile-${c.id}`}
                                label={c.name}
                                checked={(filters.categoryIds ?? []).includes(
                                  c.id
                                )}
                                onChange={() => {
                                  const current = filters.categoryIds ?? []
                                  const set = new Set(current)
                                  if (set.has(c.id)) set.delete(c.id)
                                  else set.add(c.id)
                                  updateFilter('categoryIds', Array.from(set))
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </Dropdown.Item>
                          ))}
                        </Dropdown.Menu>
                      </Dropdown>
                    </Form.Group>
                    <Form.Group>
                      <Form.Label>Amount min ($)</Form.Label>
                      <Form.Control
                        id="transactions-filter-amount-min-mobile"
                        type="number"
                        placeholder="Min"
                        value={
                          filters.amountMin != null
                            ? filters.amountMin / 100
                            : ''
                        }
                        onChange={(e) => {
                          const v = e.target.value
                          updateFilter(
                            'amountMin',
                            v === '' ? undefined : Number(v) * 100
                          )
                        }}
                      />
                    </Form.Group>
                    <Form.Group>
                      <Form.Label>Amount max ($)</Form.Label>
                      <Form.Control
                        id="transactions-filter-amount-max-mobile"
                        type="number"
                        placeholder="Max"
                        value={
                          filters.amountMax != null
                            ? filters.amountMax / 100
                            : ''
                        }
                        onChange={(e) => {
                          const v = e.target.value
                          updateFilter(
                            'amountMax',
                            v === '' ? undefined : Number(v) * 100
                          )
                        }}
                      />
                    </Form.Group>
                    <Form.Group>
                      <Form.Label>Search</Form.Label>
                      <Form.Control
                        id="transactions-filter-search-mobile"
                        type="search"
                        placeholder="Search"
                        value={filters.search ?? ''}
                        onChange={(e) =>
                          updateFilter('search', e.target.value || undefined)
                        }
                      />
                    </Form.Group>
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    variant="primary"
                    onClick={() => setFiltersDrawerOpen(false)}
                  >
                    Done
                  </Button>
                </Modal.Footer>
              </Modal>
            </>
          ) : (
            <Row className="g-2 mb-3">
              <Col md={2}>
                <Form.Control
                  id="transactions-filter-date-from"
                  name="dateFrom"
                  type="date"
                  value={filters.dateFrom ?? ''}
                  onChange={(e) =>
                    updateFilter('dateFrom', e.target.value || undefined)
                  }
                  placeholder="From"
                />
              </Col>
              <Col md={2}>
                <Form.Control
                  id="transactions-filter-date-to"
                  name="dateTo"
                  type="date"
                  value={filters.dateTo ?? ''}
                  onChange={(e) =>
                    updateFilter('dateTo', e.target.value || undefined)
                  }
                  placeholder="To"
                />
              </Col>
              <Col md={2}>
                <Dropdown
                  autoClose="outside"
                  onSelect={(e) => {
                    if (e === '__all__') {
                      updateFilter('categoryIds', [])
                      return
                    }
                    if (e == null) return
                    const current = filters.categoryIds ?? []
                    const set = new Set(current)
                    if (set.has(e)) set.delete(e)
                    else set.add(e)
                    updateFilter('categoryIds', Array.from(set))
                  }}
                >
                  <Dropdown.Toggle
                    id="transactions-filter-category"
                    variant="outline-secondary"
                    className="w-100 text-start d-flex align-items-center justify-content-between"
                  >
                    <span className="text-truncate">
                      {(filters.categoryIds?.length ?? 0) === 0
                        ? 'All categories'
                        : filters.categoryIds!.length === 1
                          ? (categories.find(
                              (c) => c.id === filters.categoryIds![0]
                            )?.name ?? '1 category')
                          : `${filters.categoryIds!.length} categories`}
                    </span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="p-0">
                    <Dropdown.Item
                      eventKey="__all__"
                      active={(filters.categoryIds?.length ?? 0) === 0}
                    >
                      All categories
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    {categories.map((c) => (
                      <Dropdown.Item
                        key={c.id}
                        eventKey={c.id}
                        as="div"
                        className="d-flex align-items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Form.Check
                          type="checkbox"
                          id={`transactions-cat-${c.id}`}
                          label={c.name}
                          checked={(filters.categoryIds ?? []).includes(c.id)}
                          onChange={() => {
                            const current = filters.categoryIds ?? []
                            const set = new Set(current)
                            if (set.has(c.id)) set.delete(c.id)
                            else set.add(c.id)
                            updateFilter('categoryIds', Array.from(set))
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              </Col>
              <Col md={1}>
                <Form.Control
                  id="transactions-filter-amount-min"
                  name="amountMin"
                  type="number"
                  placeholder="Min $"
                  value={
                    filters.amountMin != null ? filters.amountMin / 100 : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value
                    updateFilter(
                      'amountMin',
                      v === '' ? undefined : Number(v) * 100
                    )
                  }}
                />
              </Col>
              <Col md={1}>
                <Form.Control
                  id="transactions-filter-amount-max"
                  name="amountMax"
                  type="number"
                  placeholder="Max $"
                  value={
                    filters.amountMax != null ? filters.amountMax / 100 : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value
                    updateFilter(
                      'amountMax',
                      v === '' ? undefined : Number(v) * 100
                    )
                  }}
                />
              </Col>
              <Col md={2}>
                <Form.Control
                  id="transactions-filter-search"
                  name="search"
                  type="search"
                  placeholder="Search"
                  value={filters.search ?? ''}
                  onChange={(e) =>
                    updateFilter('search', e.target.value || undefined)
                  }
                />
              </Col>
              <Col md={2}>
                <Form.Select
                  id="transactions-sort"
                  name="sort"
                  value={sort}
                  onChange={(e) =>
                    updateSort(e.target.value as TransactionSort)
                  }
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      Sort: {o.label}
                    </option>
                  ))}
                </Form.Select>
              </Col>
            </Row>
          )}
          {totalCount === 0 ? (
            <p className="text-muted mb-0">
              No transactions match your filters.
            </p>
          ) : (
            <p className="text-muted small mb-0">
              Showing {loadedCount} of {totalCount} transaction(s)
              {hasMore && ' — load more below'}
            </p>
          )}
        </Card.Body>
      </Card>

      {dateKeys.length === 0 ? null : isMobile ? (
        <div className="transactions-list-vertical">
          {dateKeys.flatMap((dateStr) => {
            const showYear =
              !filters.dateFrom &&
              !filters.dateTo &&
              (filters.categoryIds?.length ?? 0) > 0
            const displayDate =
              dateStr === 'Unknown'
                ? 'Unknown'
                : showYear
                  ? formatShortDateWithYear(dateStr)
                  : formatShortDate(dateStr)
            return grouped[dateStr].map((row) => {
              const isDebit = row.amount < 0
              const absCents = Math.abs(row.amount)
              const roundUps = roundUpsByParent.get(row.id) ?? []
              return (
                <Card key={row.id} className="mb-2 transactions-card">
                  <Card.Body
                    className="py-2 px-3"
                    role="button"
                    tabIndex={0}
                    onClick={() => openEditModal(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') openEditModal(row)
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <div className="flex-grow-1 min-width-0">
                        <div className="fw-medium text-break">
                          {row.description || row.raw_text || 'Unknown'}
                        </div>
                        <div className="small text-muted">
                          {displayDate}
                          {(() => {
                            const ud = userDataMap[row.id]
                            const overrideCat = ud?.user_category_override
                            const suggested = suggestCategoryFromRules(
                              row.description || row.raw_text || ''
                            )
                            const effective = overrideCat
                              ? (categories.find((c) => c.id === overrideCat)
                                  ?.name ?? overrideCat)
                              : suggested
                                ? (categories.find((c) => c.id === suggested)
                                    ?.name ?? 'Suggested')
                                : row.category_name
                            return effective ? ` · ${effective}` : ''
                          })()}
                        </div>
                        {userDataMap[row.id]?.user_notes && (
                          <div className="small text-muted mt-1">
                            Note: {userDataMap[row.id].user_notes}
                          </div>
                        )}
                        <span
                          className={`badge mt-1 ${
                            row.status === 'HELD'
                              ? 'bg-warning text-dark'
                              : 'bg-secondary'
                          }`}
                        >
                          {row.status === 'HELD' ? 'Held' : 'Settled'}
                        </span>
                      </div>
                      <div
                        className={`text-end flex-shrink-0 ${isDebit ? '' : 'text-success'}`}
                      >
                        {isDebit ? '-' : '+'}${formatMoney(absCents)}
                      </div>
                    </div>
                    {roundUps.length > 0 && (
                      <div className="mt-2 pt-2 border-top border-secondary border-opacity-25">
                        {roundUps.map((ru) => (
                          <div
                            key={ru.id}
                            className="small text-muted d-flex justify-content-between"
                          >
                            <span>
                              Round-up to{' '}
                              {ru.transfer_account_display_name ??
                                'Loose Change'}
                            </span>
                            <span className="text-success">
                              +${formatMoney(Math.abs(ru.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card.Body>
                </Card>
              )
            })
          })}
          {hasMore && (
            <div className="d-flex justify-content-center mt-3 mb-2">
              <Button
                variant="outline-primary"
                onClick={() => setPage((p) => p + 1)}
              >
                Load more
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <Card>
            <Card.Body>
              <table className="table table-striped table-hover mb-0">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-center align-middle">Status</th>
                    <th>Merchant</th>
                    <th>Category</th>
                    <th className="text-end">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {dateKeys.flatMap((dateStr, dateIndex) => {
                    const showYear =
                      !filters.dateFrom &&
                      !filters.dateTo &&
                      (filters.categoryIds?.length ?? 0) > 0
                    const displayDate =
                      dateStr === 'Unknown'
                        ? 'Unknown'
                        : showYear
                          ? formatShortDateWithYear(dateStr)
                          : formatShortDate(dateStr)
                    const dayRows = grouped[dateStr].flatMap((row) => {
                      const isDebit = row.amount < 0
                      const absCents = Math.abs(row.amount)
                      const mainRow = (
                        <tr
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openEditModal(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ')
                              openEditModal(row)
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>{displayDate}</td>
                          <td
                            className={`text-center align-middle ${row.status === 'HELD' ? 'status-held' : ''}`}
                          >
                            {row.status === 'HELD' ? 'Held' : 'Settled'}
                          </td>
                          <td>
                            {row.description || row.raw_text || 'Unknown'}
                          </td>
                          <td>
                            {(() => {
                              const ud = userDataMap[row.id]
                              const overrideCat = ud?.user_category_override
                              const suggested = suggestCategoryFromRules(
                                row.description || row.raw_text || ''
                              )
                              if (overrideCat) {
                                return (
                                  categories.find((c) => c.id === overrideCat)
                                    ?.name ?? overrideCat
                                )
                              }
                              if (suggested) {
                                return (
                                  (categories.find((c) => c.id === suggested)
                                    ?.name ?? suggested) + ' (suggested)'
                                )
                              }
                              return row.category_name ?? ''
                            })()}
                            {userDataMap[row.id]?.user_notes && (
                              <div className="small text-muted">
                                Note: {userDataMap[row.id].user_notes}
                              </div>
                            )}
                          </td>
                          <td
                            className={`text-end ${isDebit ? '' : 'text-success'}`}
                          >
                            {isDebit ? '-' : '+'}${formatMoney(absCents)}
                          </td>
                        </tr>
                      )
                      const roundUpRows = (
                        roundUpsByParent.get(row.id) ?? []
                      ).map((ru) => (
                        <tr key={ru.id} className="small text-muted">
                          <td />
                          <td />
                          <td>
                            Round-up to{' '}
                            {ru.transfer_account_display_name ?? 'Loose Change'}
                          </td>
                          <td />
                          <td className="text-end text-success">
                            +${formatMoney(Math.abs(ru.amount))}
                          </td>
                        </tr>
                      ))
                      return [mainRow, ...roundUpRows]
                    })
                    const separator =
                      dateIndex < dateKeys.length - 1 ? (
                        <tr
                          key={`sep-${dateStr}`}
                          className="transactions-day-separator"
                          aria-hidden="true"
                        >
                          <td colSpan={5} />
                        </tr>
                      ) : null
                    return [...dayRows, separator].filter(Boolean)
                  })}
                </tbody>
              </table>
            </Card.Body>
          </Card>
          {hasMore && (
            <div className="d-flex justify-content-center mt-3">
              <Button
                variant="outline-primary"
                onClick={() => setPage((p) => p + 1)}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        show={editTxId != null}
        onHide={() => setEditTxId(null)}
        centered
        aria-labelledby="transaction-edit-modal-title"
      >
        <Modal.Header closeButton>
          <Modal.Title id="transaction-edit-modal-title">
            Transaction note &amp; category
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editTxRow && (
            <>
              <p className="small text-muted mb-2">
                {editTxRow.description || editTxRow.raw_text || 'Unknown'}
              </p>
              <Form.Group className="mb-2">
                <Form.Label>Note (local only)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Optional note for this transaction"
                />
              </Form.Group>
              <Form.Group>
                <Form.Label>Category override (local only)</Form.Label>
                <Form.Select
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                >
                  <option value="">Use bank category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted">
                  Overrides the category from Up Bank for display only.
                </Form.Text>
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditTxId(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={saveEditModal}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
