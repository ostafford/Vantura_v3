import { Fragment, useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageBreadcrumb } from '@/components/PageBreadcrumb'
import {
  Card,
  Form,
  Row,
  Col,
  Button,
  Badge,
  Dropdown,
  Modal,
  Spinner,
} from 'react-bootstrap'
import { useStore } from 'zustand'
import {
  getTransactionsGroupedByDate,
  getFilteredTransactionsCount,
  getRoundUpsByParentIds,
  getRoundUpsForTransaction,
  DEFAULT_PAGE_SIZE,
  type TransactionFilters,
  type TransactionSort,
  type TransactionRow,
} from '@/services/transactions'
import { getCategories } from '@/services/categories'
import { getTransactionUserDataMap } from '@/services/transactionUserData'
import { updateTransactionCategoryLocal } from '@/services/transactions'
import {
  getAllTags,
  getTagsForTransaction,
  setTransactionTagsLocal,
} from '@/services/tags'
import {
  updateTransactionCategory,
  addTransactionTags,
  removeTransactionTags,
} from '@/api/upBank'
import { sessionStore } from '@/stores/sessionStore'
import { getAppSetting, setAppSetting } from '@/db'
import {
  type PaydayFrequency,
  getPaydayDayOptions,
  computeNextPaydayFromReference,
} from '@/lib/payday'
import { toast } from '@/stores/toastStore'
import { syncStore } from '@/stores/syncStore'
import { useFullReSync } from '@/hooks/useFullReSync'
import {
  formatMoney,
  formatDateTime,
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

const CARD_METHOD_LABELS: Record<string, string> = {
  CONTACTLESS: 'Tap',
  CHIP_AND_PIN: 'Chip & PIN',
  ECOMMERCE: 'Online',
  MAGNETIC_STRIPE: 'Swipe',
  BAR_CODE: 'Barcode',
}

function cardMethodLabel(method: string): string {
  return CARD_METHOD_LABELS[method] ?? method
}

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
    const saverActivity = searchParams.get('saverActivity') === '1'
    const linkedAccountId =
      searchParams.get('linkedAccountId')?.trim() || undefined
    return {
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(categoryIds.length > 0 && { categoryIds }),
      ...(amountMin != null && { amountMin }),
      ...(amountMax != null && { amountMax }),
      ...(search && { search }),
      ...(saverActivity ? { saverActivity: true } : {}),
      ...(linkedAccountId ? { linkedAccountId } : {}),
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
    if (f.saverActivity) next.set('saverActivity', '1')
    if (f.linkedAccountId) next.set('linkedAccountId', f.linkedAccountId)
    next.set('sort', s)
    setSearchParams(next)
  }

  return { filters, sort, setFilters }
}

export function Transactions() {
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const { syncing, syncError, handleReSync } = useFullReSync()
  const isDemoMode = getAppSetting('demo_mode') === '1'
  const { filters, sort, setFilters } = useFiltersFromSearchParams()
  const [page, setPage] = useState(0)
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false)
  const [localDbVersion, setLocalDbVersion] = useState(0)
  const bumpLocal = () => setLocalDbVersion((v) => v + 1)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const categories = getCategories()
  const totalCount = useMemo(() => {
    void lastSyncCompletedAt
    void localDbVersion
    return getFilteredTransactionsCount(filters)
  }, [filters, lastSyncCompletedAt, localDbVersion])
  const limit = (page + 1) * DEFAULT_PAGE_SIZE
  const grouped = useMemo(() => {
    void lastSyncCompletedAt
    void localDbVersion
    return getTransactionsGroupedByDate(filters, sort, {
      limit,
      offset: 0,
    })
  }, [filters, sort, limit, lastSyncCompletedAt, localDbVersion])
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

  const userDataMap = useMemo(
    () => getTransactionUserDataMap(parentIdsByDate),
    [parentIdsByDate]
  )

  const [editTxId, setEditTxId] = useState<string | null>(null)
  const editTxRow = useMemo(() => {
    if (!editTxId) return null
    for (const rows of Object.values(grouped)) {
      const r = rows.find((x) => x.id === editTxId)
      if (r) return r
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTxId, grouped, localDbVersion])
  const editRoundUps = useMemo(
    () => (editTxId ? getRoundUpsForTransaction(editTxId) : []),
    [editTxId, lastSyncCompletedAt]
  )

  const editEffectiveCategory = useMemo(() => {
    if (!editTxRow) return null
    const savedOverride = userDataMap[editTxRow.id]?.user_category_override
    if (savedOverride)
      return (
        categories.find((c) => c.id === savedOverride)?.name ?? savedOverride
      )
    return editTxRow.category_name
  }, [editTxRow, userDataMap, categories])

  const [categoryUpdating, setCategoryUpdating] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)

  const handleCategoryChange = async (newCategoryId: string) => {
    const token = sessionStore.getState().getToken()
    if (!token || !editTxRow) return
    setCategoryUpdating(true)
    setCategoryError(null)
    try {
      await updateTransactionCategory(
        editTxRow.id,
        newCategoryId || null,
        token
      )
      updateTransactionCategoryLocal(editTxRow.id, newCategoryId || null)
      bumpLocal()
    } catch {
      setCategoryError('Could not update category. Try again.')
    } finally {
      setCategoryUpdating(false)
    }
  }

  const [editTxTags, setEditTxTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [tagUpdating, setTagUpdating] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  const [showPaydaySetup, setShowPaydaySetup] = useState(false)
  const [paydaySetupFreq, setPaydaySetupFreq] = useState<PaydayFrequency>(
    () =>
      (getAppSetting('payday_frequency') as PaydayFrequency | null) ?? 'MONTHLY'
  )

  const paydaySetupPreview = useMemo(() => {
    if (!editTxRow) return null
    const txDate = (editTxRow.created_at ?? editTxRow.settled_at ?? '').slice(
      0,
      10
    )
    if (!txDate) return null
    const { paydayDay, nextPayday } = computeNextPaydayFromReference(
      txDate,
      paydaySetupFreq
    )
    const dayOptions = getPaydayDayOptions(paydaySetupFreq)
    const dayLabel =
      dayOptions.find((o) => o.value === paydayDay)?.label ?? String(paydayDay)
    return { paydayDay, nextPayday, dayLabel }
  }, [editTxRow, paydaySetupFreq])

  function handlePaydayNominate() {
    if (!editTxRow || !paydaySetupPreview) return
    setAppSetting('payday_frequency', paydaySetupFreq)
    setAppSetting('payday_day', String(paydaySetupPreview.paydayDay))
    setAppSetting('next_payday', paydaySetupPreview.nextPayday)
    toast.success(
      `Payday set: ${paydaySetupFreq.charAt(0) + paydaySetupFreq.slice(1).toLowerCase()} on ${paydaySetupPreview.dayLabel}. Next: ${paydaySetupPreview.nextPayday}.`
    )
    setShowPaydaySetup(false)
  }

  useEffect(() => {
    if (editTxId) {
      setEditTxTags(getTagsForTransaction(editTxId))
      setAllTags(getAllTags())
      setCategoryError(null)
      setTagError(null)
      setShowPaydaySetup(false)
    } else {
      setEditTxTags([])
      setAllTags([])
      setShowPaydaySetup(false)
    }
  }, [editTxId, localDbVersion])

  const handleAddTag = async (tagId: string) => {
    const token = sessionStore.getState().getToken()
    if (!token || !editTxId || editTxTags.length >= 6) return
    setTagUpdating(true)
    setTagError(null)
    const next = [...editTxTags, tagId]
    try {
      await addTransactionTags(editTxId, [tagId], token)
      setTransactionTagsLocal(editTxId, next)
      setEditTxTags(next)
      setAllTags(getAllTags())
    } catch {
      setTagError('Could not add tag. Try again.')
    } finally {
      setTagUpdating(false)
    }
  }

  const handleRemoveTag = async (tagId: string) => {
    const token = sessionStore.getState().getToken()
    if (!token || !editTxId) return
    setTagUpdating(true)
    setTagError(null)
    const next = editTxTags.filter((t) => t !== tagId)
    try {
      await removeTransactionTags(editTxId, [tagId], token)
      setTransactionTagsLocal(editTxId, next)
      setEditTxTags(next)
    } catch {
      setTagError('Could not remove tag. Try again.')
    } finally {
      setTagUpdating(false)
    }
  }

  const openDetailModal = (row: TransactionRow) => {
    setEditTxId(row.id)
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
    filters.saverActivity,
    filters.linkedAccountId,
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

  const clearSaverFilters = () => {
    setFilters(
      {
        ...filters,
        saverActivity: undefined,
        linkedAccountId: undefined,
      },
      sort
    )
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
        <div className="d-flex flex-wrap align-items-center gap-2 ms-auto">
          <PageBreadcrumb
            items={[{ label: 'Dashboard', to: '/' }, { label: 'Transactions' }]}
          />
          <Button
            type="button"
            className="btn-gradient-primary"
            size="sm"
            onClick={handleReSync}
            disabled={syncing || isDemoMode}
            aria-label="Re-sync with Up Bank"
            aria-busy={syncing}
          >
            {syncing ? (
              <>
                <Spinner
                  animation="border"
                  size="sm"
                  className="me-1"
                  role="status"
                  aria-hidden="true"
                />
                Syncing…
              </>
            ) : (
              'Re-sync now'
            )}
          </Button>
        </div>
      </div>
      {syncError ? (
        <div className="text-danger small mb-3" role="alert">
          {syncError}
        </div>
      ) : null}
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
                        <Dropdown.Menu className="p-0 transactions-category-menu">
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
                    <Form.Check
                      type="checkbox"
                      id="transactions-filter-saver-mobile"
                      label="Saver-related only"
                      checked={!!filters.saverActivity}
                      onChange={(e) =>
                        updateFilter(
                          'saverActivity',
                          e.target.checked ? true : undefined
                        )
                      }
                    />
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
                  <Dropdown.Menu className="p-0 transactions-category-menu">
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
          {!isMobile && (filters.saverActivity || filters.linkedAccountId) ? (
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2 small">
              <span className="text-muted">
                {filters.saverActivity && 'Saver-related filter active'}
                {filters.saverActivity && filters.linkedAccountId && ' · '}
                {filters.linkedAccountId &&
                  `Account scope: ${filters.linkedAccountId.slice(0, 8)}…`}
              </span>
              <Button
                type="button"
                variant="link"
                className="p-0 small"
                onClick={clearSaverFilters}
              >
                Clear saver filters
              </Button>
            </div>
          ) : null}
          {!isMobile ? (
            <div className="mb-2">
              <Form.Check
                type="checkbox"
                id="transactions-filter-saver-desktop"
                label="Saver-related only (transfers to/from savers, activity on saver accounts, round-ups)"
                checked={!!filters.saverActivity}
                onChange={(e) =>
                  updateFilter(
                    'saverActivity',
                    e.target.checked ? true : undefined
                  )
                }
              />
            </div>
          ) : null}
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
                    onClick={() => openDetailModal(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ')
                        openDetailModal(row)
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
                            const effective = overrideCat
                              ? (categories.find((c) => c.id === overrideCat)
                                  ?.name ?? overrideCat)
                              : row.category_name
                            return effective ? ` · ${effective}` : ''
                          })()}
                        </div>
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
                          onClick={() => openDetailModal(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ')
                              openDetailModal(row)
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
                              if (overrideCat) {
                                return (
                                  categories.find((c) => c.id === overrideCat)
                                    ?.name ?? overrideCat
                                )
                              }
                              return row.category_name ?? ''
                            })()}
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
        aria-labelledby="transaction-detail-modal-title"
      >
        <Modal.Header closeButton>
          <Modal.Title
            id="transaction-detail-modal-title"
            className="text-truncate"
            style={{ maxWidth: '90%' }}
          >
            {editTxRow?.description || editTxRow?.raw_text || 'Transaction'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editTxRow && (
            <>
              <div className="mb-3">
                <div
                  className={`fs-4 fw-bold ${editTxRow.amount < 0 ? '' : 'text-success'}`}
                >
                  {editTxRow.amount < 0 ? '-' : '+'}$
                  {formatMoney(Math.abs(editTxRow.amount))}
                </div>
                <span
                  className={`badge ${
                    editTxRow.status === 'HELD'
                      ? 'bg-warning text-dark'
                      : 'bg-secondary'
                  }`}
                >
                  {editTxRow.status === 'HELD' ? 'Pending' : 'Settled'}
                </span>
              </div>

              <dl className="row small mb-3">
                <dt className="col-sm-4 text-muted">Date</dt>
                <dd className="col-sm-8">
                  {formatDateTime(
                    editTxRow.created_at ?? editTxRow.settled_at ?? ''
                  )}
                </dd>

                {editTxRow.settled_at && editTxRow.status !== 'HELD' && (
                  <>
                    <dt className="col-sm-4 text-muted">Settled</dt>
                    <dd className="col-sm-8">
                      {formatDateTime(editTxRow.settled_at)}
                    </dd>
                  </>
                )}

                {editTxRow.is_categorizable ? (
                  <>
                    <dt className="col-sm-4 text-muted">Category</dt>
                    <dd className="col-sm-8">
                      {categoryUpdating ? (
                        <Spinner animation="border" size="sm" />
                      ) : (
                        <Form.Select
                          size="sm"
                          value={editTxRow.category_id ?? ''}
                          onChange={(e) => handleCategoryChange(e.target.value)}
                          disabled={categoryUpdating}
                        >
                          <option value="">No category</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Form.Select>
                      )}
                      {categoryError && (
                        <small className="text-danger d-block mt-1">
                          {categoryError}
                        </small>
                      )}
                    </dd>
                  </>
                ) : editEffectiveCategory ? (
                  <>
                    <dt className="col-sm-4 text-muted">Category</dt>
                    <dd className="col-sm-8">{editEffectiveCategory}</dd>
                  </>
                ) : null}

                {editTxRow.transaction_type && (
                  <>
                    <dt className="col-sm-4 text-muted">Type</dt>
                    <dd className="col-sm-8">{editTxRow.transaction_type}</dd>
                  </>
                )}

                {editTxRow.performing_customer && (
                  <>
                    <dt className="col-sm-4 text-muted">Paid by</dt>
                    <dd className="col-sm-8">
                      {editTxRow.performing_customer}
                    </dd>
                  </>
                )}

                {editTxRow.card_purchase_method && (
                  <>
                    <dt className="col-sm-4 text-muted">Paid with</dt>
                    <dd className="col-sm-8">
                      {cardMethodLabel(editTxRow.card_purchase_method)}
                      {editTxRow.card_number_suffix &&
                        ` · ••••${editTxRow.card_number_suffix}`}
                    </dd>
                  </>
                )}

                {editTxRow.message && (
                  <>
                    <dt className="col-sm-4 text-muted">Message</dt>
                    <dd className="col-sm-8">{editTxRow.message}</dd>
                  </>
                )}

                {editTxRow.note && (
                  <>
                    <dt className="col-sm-4 text-muted">Note</dt>
                    <dd className="col-sm-8">{editTxRow.note}</dd>
                  </>
                )}

                {editRoundUps.map((ru) => (
                  <Fragment key={ru.id}>
                    <dt className="col-sm-4 text-muted">Round-up</dt>
                    <dd className="col-sm-8 text-success">
                      +${formatMoney(Math.abs(ru.amount))} →{' '}
                      {ru.transfer_account_display_name ?? 'Loose Change'}
                      {editTxRow.round_up_boost_portion != null && (
                        <span className="text-muted ms-1 fw-normal">
                          (incl. $
                          {formatMoney(
                            Math.abs(editTxRow.round_up_boost_portion)
                          )}{' '}
                          boost)
                        </span>
                      )}
                    </dd>
                  </Fragment>
                ))}

                {editTxRow.cashback_amount != null && (
                  <>
                    <dt className="col-sm-4 text-muted">Cashback</dt>
                    <dd className="col-sm-8 text-success">
                      +${formatMoney(editTxRow.cashback_amount)}
                      {editTxRow.cashback_description && (
                        <span className="text-muted ms-1 fw-normal">
                          · {editTxRow.cashback_description}
                        </span>
                      )}
                    </dd>
                  </>
                )}

                {editTxRow.foreign_amount != null && (
                  <>
                    <dt className="col-sm-4 text-muted">Original amount</dt>
                    <dd className="col-sm-8">
                      {editTxRow.foreign_currency ?? ''}{' '}
                      {formatMoney(Math.abs(editTxRow.foreign_amount))}
                    </dd>
                  </>
                )}

                {editTxRow.transfer_account_display_name && (
                  <>
                    <dt className="col-sm-4 text-muted">Transfer</dt>
                    <dd className="col-sm-8">
                      {editTxRow.transfer_account_display_name}
                    </dd>
                  </>
                )}

                <dt className="col-sm-4 text-muted pt-1">Tags</dt>
                <dd className="col-sm-8">
                  <div className="d-flex flex-wrap gap-1 mb-1">
                    {editTxTags.map((tag) => (
                      <Badge
                        key={tag}
                        bg="secondary"
                        className="d-inline-flex align-items-center gap-1 fw-normal"
                      >
                        {tag}
                        <button
                          type="button"
                          className="btn-close btn-close-white"
                          style={{ fontSize: '0.55rem' }}
                          aria-label={`Remove tag ${tag}`}
                          onClick={() => handleRemoveTag(tag)}
                          disabled={tagUpdating}
                        />
                      </Badge>
                    ))}
                    {editTxTags.length === 0 && !tagUpdating && (
                      <span className="text-muted fst-italic">None</span>
                    )}
                    {tagUpdating && <Spinner animation="border" size="sm" />}
                  </div>
                  {editTxTags.length < 6 && (
                    <Form.Select
                      size="sm"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleAddTag(e.target.value)
                      }}
                      disabled={tagUpdating}
                    >
                      <option value="">Add tag…</option>
                      {allTags
                        .filter((t) => !editTxTags.includes(t))
                        .map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                    </Form.Select>
                  )}
                  {tagError && (
                    <small className="text-danger d-block mt-1">
                      {tagError}
                    </small>
                  )}
                </dd>
              </dl>

              {editTxRow.amount > 0 && !editTxRow.transfer_account_id && (
                <>
                  <hr className="my-2" />
                  {showPaydaySetup ? (
                    <div className="small">
                      <p className="fw-semibold mb-2">
                        Configure pay schedule from this transaction
                      </p>
                      <Form.Group className="mb-2">
                        <Form.Label htmlFor="payday-setup-freq">
                          Frequency
                        </Form.Label>
                        <Form.Select
                          id="payday-setup-freq"
                          size="sm"
                          value={paydaySetupFreq}
                          onChange={(e) =>
                            setPaydaySetupFreq(
                              e.target.value as PaydayFrequency
                            )
                          }
                        >
                          <option value="WEEKLY">Weekly</option>
                          <option value="FORTNIGHTLY">Fortnightly</option>
                          <option value="MONTHLY">Monthly</option>
                        </Form.Select>
                      </Form.Group>
                      {paydaySetupPreview && (
                        <p className="text-muted mb-2">
                          Pay day:{' '}
                          <strong>{paydaySetupPreview.dayLabel}</strong>
                          {' · '}Next payday:{' '}
                          <strong>{paydaySetupPreview.nextPayday}</strong>
                        </p>
                      )}
                      <div className="d-flex gap-2 align-items-center">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handlePaydayNominate}
                        >
                          Save payday settings
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 text-muted"
                          onClick={() => setShowPaydaySetup(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => setShowPaydaySetup(true)}
                    >
                      <i
                        className="mdi mdi-calendar-account me-1"
                        aria-hidden
                      />
                      Use as payday reference
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          {editTxRow?.deep_link_url ? (
            <a
              href={editTxRow.deep_link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-secondary btn-sm"
            >
              Open in Up ↗
            </a>
          ) : (
            <span />
          )}
          <Button variant="secondary" onClick={() => setEditTxId(null)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
