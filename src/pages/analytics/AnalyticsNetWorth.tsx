import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { Card, Row, Col, Modal, Button, Form, Badge } from 'react-bootstrap'
import { syncStore } from '@/stores/syncStore'
import { formatMoney } from '@/lib/format'
import {
  getAccountsByTypes,
  createCreditCardAccount,
  CREDIT_CARD_IMPORT_TYPE,
  type AccountRow,
} from '@/services/accounts'
import { StatementImportModal } from '@/components/StatementImportModal'
import { getLatestStatementImport } from '@/services/creditCardImport'
import {
  getNetWorthSummary,
  getProjectedNetWorth,
  getNetWorthSnapshots,
} from '@/services/netWorth'
import {
  getManualAccounts,
  addManualAccount,
  updateManualAccount,
  updateManualAccountBalance,
  deleteManualAccount,
  isStale,
  getStaleDays,
  STALE_THRESHOLD_DAYS,
  MANUAL_ACCOUNT_TYPE_LABELS,
  MANUAL_ACCOUNT_TYPE_ICONS,
  LIABILITY_TYPES,
  ASSET_TYPES,
  type ManualAccountRow,
  type ManualAccountType,
  type ManualAccountInput,
} from '@/services/manualAccounts'
import { NetWorthTrendChart } from '@/components/charts/NetWorthTrendChart'
import { HelpPopover } from '@/components/HelpPopover'
import { toast } from '@/stores/toastStore'

// ─── Helpers ────────────────────────────────────────────────────────────────

function staleBadge(account: ManualAccountRow) {
  const days = getStaleDays(account)
  const threshold = STALE_THRESHOLD_DAYS[account.account_type]
  if (days > threshold) {
    return <span className="badge bg-warning text-dark ms-1">{days}d ago</span>
  }
  return <span className="text-muted small ms-1">↻ {days}d ago</span>
}

function deltaArrow(cents: number) {
  if (cents > 0)
    return (
      <span className="text-success ms-1">
        ↑ +${formatMoney(Math.abs(cents))}
      </span>
    )
  if (cents < 0)
    return (
      <span className="text-danger ms-1">
        ↓ −${formatMoney(Math.abs(cents))}
      </span>
    )
  return null
}

// ─── Account form fields per type ───────────────────────────────────────────

const SHOWS_CREDIT_LIMIT: ManualAccountType[] = ['CREDIT_CARD']
const SHOWS_INTEREST_RATE: ManualAccountType[] = [
  'CREDIT_CARD',
  'MORTGAGE',
  'PERSONAL_LOAN',
  'SAVINGS',
]
const SHOWS_RATE_TYPE: ManualAccountType[] = ['MORTGAGE', 'PERSONAL_LOAN']
const SHOWS_FIXED_EXPIRY: ManualAccountType[] = ['MORTGAGE', 'PERSONAL_LOAN']

const HECS_NOTE =
  'HECS/HELP debt is indexed to CPI annually — there is no traditional interest rate.'
const PROPERTY_NOTE =
  'Enter an estimated current market value. This will always be approximate.'

// ─── Type picker step ───────────────────────────────────────────────────────

function TypePicker({
  onSelect,
}: {
  onSelect: (t: ManualAccountType) => void
}) {
  return (
    <div>
      <p className="text-muted small mb-3">
        What type of account are you adding?
      </p>
      <p
        className="fw-semibold small text-uppercase mb-2"
        style={{ letterSpacing: '0.05em', fontSize: '0.7rem' }}
      >
        Liabilities
      </p>
      <Row className="g-2 mb-3">
        {LIABILITY_TYPES.map((t) => (
          <Col xs={6} key={t}>
            <button
              type="button"
              className="btn btn-outline-secondary w-100 text-start py-2 px-3"
              onClick={() => onSelect(t)}
            >
              <i
                className={`mdi ${MANUAL_ACCOUNT_TYPE_ICONS[t]} me-2`}
                aria-hidden
              />
              <span className="small">{MANUAL_ACCOUNT_TYPE_LABELS[t]}</span>
            </button>
          </Col>
        ))}
      </Row>
      <p
        className="fw-semibold small text-uppercase mb-2"
        style={{ letterSpacing: '0.05em', fontSize: '0.7rem' }}
      >
        Assets
      </p>
      <Row className="g-2">
        {ASSET_TYPES.map((t) => (
          <Col xs={6} key={t}>
            <button
              type="button"
              className="btn btn-outline-secondary w-100 text-start py-2 px-3"
              onClick={() => onSelect(t)}
            >
              <i
                className={`mdi ${MANUAL_ACCOUNT_TYPE_ICONS[t]} me-2`}
                aria-hidden
              />
              <span className="small">{MANUAL_ACCOUNT_TYPE_LABELS[t]}</span>
            </button>
          </Col>
        ))}
      </Row>
    </div>
  )
}

// ─── Account form ────────────────────────────────────────────────────────────

interface AccountFormState {
  name: string
  institution: string
  account_type: ManualAccountType
  balance: string
  credit_limit: string
  interest_rate: string
  rate_type: string
  fixed_rate_expiry: string
  notes: string
}

function blankForm(type: ManualAccountType): AccountFormState {
  return {
    name: '',
    institution: '',
    account_type: type,
    balance: '',
    credit_limit: '',
    interest_rate: '',
    rate_type: 'VARIABLE',
    fixed_rate_expiry: '',
    notes: '',
  }
}

function formFromRow(row: ManualAccountRow): AccountFormState {
  return {
    name: row.name,
    institution: row.institution ?? '',
    account_type: row.account_type,
    balance: (row.balance_cents / 100).toFixed(2),
    credit_limit:
      row.credit_limit_cents != null
        ? (row.credit_limit_cents / 100).toFixed(2)
        : '',
    interest_rate:
      row.interest_rate_bps != null
        ? (row.interest_rate_bps / 100).toFixed(2)
        : '',
    rate_type: row.rate_type ?? 'VARIABLE',
    fixed_rate_expiry: row.fixed_rate_expiry_date ?? '',
    notes: row.notes ?? '',
  }
}

function formToInput(f: AccountFormState): ManualAccountInput {
  const kind = LIABILITY_TYPES.includes(f.account_type) ? 'liability' : 'asset'
  const balanceCents = Math.round(parseFloat(f.balance || '0') * 100)
  const creditLimitCents = f.credit_limit
    ? Math.round(parseFloat(f.credit_limit) * 100)
    : null
  const rateBps = f.interest_rate
    ? Math.round(parseFloat(f.interest_rate) * 100)
    : null
  return {
    name: f.name.trim(),
    institution: f.institution.trim() || null,
    account_type: f.account_type,
    kind,
    balance_cents: balanceCents,
    credit_limit_cents: creditLimitCents,
    interest_rate_bps: rateBps,
    rate_type: SHOWS_RATE_TYPE.includes(f.account_type) ? f.rate_type : null,
    fixed_rate_expiry_date:
      SHOWS_FIXED_EXPIRY.includes(f.account_type) &&
      f.rate_type === 'FIXED' &&
      f.fixed_rate_expiry
        ? f.fixed_rate_expiry
        : null,
    notes: f.notes.trim() || null,
  }
}

function AccountForm({
  form,
  onChange,
}: {
  form: AccountFormState
  onChange: (patch: Partial<AccountFormState>) => void
}) {
  const t = form.account_type
  const balanceLabel =
    t === 'PROPERTY'
      ? 'Estimated current value ($)'
      : t === 'INVESTMENT'
        ? 'Current portfolio value ($)'
        : LIABILITY_TYPES.includes(t)
          ? 'Balance owing ($)'
          : 'Current balance ($)'

  return (
    <Form>
      {t === 'HECS_HELP' && (
        <div className="alert alert-secondary small py-2 mb-3">{HECS_NOTE}</div>
      )}
      {t === 'PROPERTY' && (
        <div className="alert alert-secondary small py-2 mb-3">
          {PROPERTY_NOTE}
        </div>
      )}

      <Row className="g-3 mb-3">
        <Col xs={12} sm={6}>
          <Form.Group>
            <Form.Label>Name *</Form.Label>
            <Form.Control
              value={form.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={
                t === 'CREDIT_CARD'
                  ? 'ANZ Visa'
                  : t === 'SUPERANNUATION'
                    ? 'Australian Retirement Trust'
                    : ''
              }
              autoFocus
            />
          </Form.Group>
        </Col>
        <Col xs={12} sm={6}>
          <Form.Group>
            <Form.Label>Institution</Form.Label>
            <Form.Control
              value={form.institution}
              onChange={(e) => onChange({ institution: e.target.value })}
              placeholder="ANZ, Westpac…"
            />
          </Form.Group>
        </Col>
      </Row>

      <Form.Group className="mb-3">
        <Form.Label>{balanceLabel} *</Form.Label>
        <Form.Control
          type="number"
          min="0"
          step="0.01"
          value={form.balance}
          onChange={(e) => onChange({ balance: e.target.value })}
          placeholder="0.00"
        />
      </Form.Group>

      {SHOWS_CREDIT_LIMIT.includes(t) && (
        <Form.Group className="mb-3">
          <Form.Label>Credit limit ($)</Form.Label>
          <Form.Control
            type="number"
            min="0"
            step="0.01"
            value={form.credit_limit}
            onChange={(e) => onChange({ credit_limit: e.target.value })}
            placeholder="0.00"
          />
        </Form.Group>
      )}

      {SHOWS_INTEREST_RATE.includes(t) && (
        <Row className="g-3 mb-3">
          <Col xs={12} sm={SHOWS_RATE_TYPE.includes(t) ? 4 : 6}>
            <Form.Group>
              <Form.Label>Interest rate (%)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="0.01"
                value={form.interest_rate}
                onChange={(e) => onChange({ interest_rate: e.target.value })}
                placeholder="e.g. 20.99"
              />
            </Form.Group>
          </Col>
          {SHOWS_RATE_TYPE.includes(t) && (
            <>
              <Col xs={12} sm={4}>
                <Form.Group>
                  <Form.Label>Rate type</Form.Label>
                  <Form.Select
                    value={form.rate_type}
                    onChange={(e) => onChange({ rate_type: e.target.value })}
                  >
                    <option value="VARIABLE">Variable</option>
                    <option value="FIXED">Fixed</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              {form.rate_type === 'FIXED' && (
                <Col xs={12} sm={4}>
                  <Form.Group>
                    <Form.Label>Fixed rate expiry</Form.Label>
                    <Form.Control
                      type="date"
                      value={form.fixed_rate_expiry}
                      onChange={(e) =>
                        onChange({ fixed_rate_expiry: e.target.value })
                      }
                    />
                  </Form.Group>
                </Col>
              )}
            </>
          )}
        </Row>
      )}

      <Form.Group className="mb-1">
        <Form.Label>Notes</Form.Label>
        <Form.Control
          as="textarea"
          rows={2}
          value={form.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Optional"
        />
      </Form.Group>
    </Form>
  )
}

// ─── Quick balance update modal ──────────────────────────────────────────────

function QuickUpdateModal({
  account,
  onSave,
  onClose,
  onFullEdit,
}: {
  account: ManualAccountRow
  onSave: (balanceCents: number) => void
  onClose: () => void
  onFullEdit: () => void
}) {
  const [value, setValue] = useState((account.balance_cents / 100).toFixed(2))
  const label = LIABILITY_TYPES.includes(account.account_type)
    ? 'Update balance owing ($)'
    : account.account_type === 'PROPERTY'
      ? 'Update estimated value ($)'
      : 'Update balance ($)'

  function handleSave() {
    const cents = Math.round(parseFloat(value || '0') * 100)
    if (isNaN(cents) || cents < 0) {
      toast.error('Enter a valid amount.')
      return
    }
    onSave(cents)
  }

  return (
    <Modal show onHide={onClose} centered size="sm">
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">{account.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group>
          <Form.Label className="small">{label}</Form.Label>
          <Form.Control
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
            autoFocus
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <Button
          variant="link"
          size="sm"
          className="p-0 text-muted"
          onClick={onFullEdit}
        >
          Full edit
        </Button>
        <div className="d-flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            Update
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}

// ─── Add / Edit account modal ────────────────────────────────────────────────

function AccountModal({
  editingAccount,
  initialType,
  onSave,
  onDelete,
  onClose,
}: {
  editingAccount: ManualAccountRow | null
  initialType: ManualAccountType | null
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [step, setStep] = useState<'pick' | 'form'>(
    editingAccount || initialType ? 'form' : 'pick'
  )
  const [selectedType, setSelectedType] = useState<ManualAccountType | null>(
    editingAccount?.account_type ?? initialType ?? null
  )
  const [form, setForm] = useState<AccountFormState>(() =>
    editingAccount
      ? formFromRow(editingAccount)
      : selectedType
        ? blankForm(selectedType)
        : blankForm('CREDIT_CARD')
  )
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  function handleTypeSelect(t: ManualAccountType) {
    setSelectedType(t)
    setForm(blankForm(t))
    setStep('form')
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error('Name is required.')
      return
    }
    const balance = parseFloat(form.balance || '0')
    if (isNaN(balance) || balance < 0) {
      toast.error('Enter a valid balance.')
      return
    }
    const input = formToInput(form)
    if (editingAccount) {
      updateManualAccount(editingAccount.id, input)
      toast.success('Account updated.')
    } else {
      addManualAccount(input)
      toast.success('Account added.')
    }
    onSave()
  }

  const title = editingAccount
    ? `Edit — ${editingAccount.name}`
    : step === 'pick'
      ? 'Add Account'
      : `Add ${selectedType ? MANUAL_ACCOUNT_TYPE_LABELS[selectedType] : 'Account'}`

  return (
    <>
      <Modal show={!showDeleteConfirm} onHide={onClose} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">
            {step === 'form' && !editingAccount && (
              <button
                type="button"
                className="btn btn-link p-0 me-2 text-muted"
                onClick={() => setStep('pick')}
                aria-label="Back"
              >
                <i className="mdi mdi-chevron-left" aria-hidden />
              </button>
            )}
            {title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {step === 'pick' ? (
            <TypePicker onSelect={handleTypeSelect} />
          ) : (
            <AccountForm
              form={form}
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />
          )}
        </Modal.Body>
        {step === 'form' && (
          <Modal.Footer>
            {editingAccount && onDelete && (
              <Button
                variant="outline-danger"
                className="me-auto"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              {editingAccount ? 'Save changes' : 'Add account'}
            </Button>
          </Modal.Footer>
        )}
      </Modal>

      {showDeleteConfirm && editingAccount && onDelete && (
        <Modal
          show
          onHide={() => setShowDeleteConfirm(false)}
          centered
          size="sm"
        >
          <Modal.Header closeButton>
            <Modal.Title className="fs-6">Delete account</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-0">
              Delete <strong>{editingAccount.name}</strong>? This cannot be
              undone.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  )
}

// ─── Account row ─────────────────────────────────────────────────────────────

function AccountRow({
  account,
  onQuickUpdate,
}: {
  account: ManualAccountRow
  onQuickUpdate: (a: ManualAccountRow) => void
}) {
  const stale = isStale(account)
  return (
    <div
      className="d-flex justify-content-between align-items-center py-2 px-3 rounded"
      style={{ cursor: 'pointer' }}
      role="button"
      tabIndex={0}
      onClick={() => onQuickUpdate(account)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onQuickUpdate(account)
        }
      }}
    >
      <div className="d-flex align-items-center gap-2 min-w-0">
        <i
          className={`mdi ${MANUAL_ACCOUNT_TYPE_ICONS[account.account_type]} text-muted flex-shrink-0`}
          aria-hidden
        />
        <div className="min-w-0">
          <span className="fw-medium">{account.name}</span>
          {account.institution && (
            <span className="text-muted small ms-1">
              · {account.institution}
            </span>
          )}
          {staleBadge(account)}
        </div>
      </div>
      <div className="text-end flex-shrink-0 ms-2">
        <span className={stale ? 'text-muted' : ''}>
          ${formatMoney(account.balance_cents)}
        </span>
        {account.account_type === 'CREDIT_CARD' &&
        account.credit_limit_cents ? (
          <div className="text-muted" style={{ fontSize: '0.7rem' }}>
            of ${formatMoney(account.credit_limit_cents)} limit
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Credit card import status line ─────────────────────────────────────────

function CreditCardImportStatus({
  accountId,
  refresh,
}: {
  accountId: string
  refresh: number
}) {
  const record = useMemo(
    () => getLatestStatementImport(accountId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, refresh]
  )
  if (!record) return null

  const dateLabel = new Date(record.importedAt).toLocaleDateString()
  if (record.checksumMismatchCents != null) {
    return (
      <div className="small text-warning mt-1">
        <i className="mdi mdi-alert-outline me-1" aria-hidden />
        Last import ({dateLabel}, {record.rowCount} txns) is off by $
        {formatMoney(Math.abs(record.checksumMismatchCents))} from the
        statement's stated closing balance.
      </div>
    )
  }
  if (record.statedClosingBalanceCents != null) {
    return (
      <div className="small text-success mt-1">
        <i className="mdi mdi-check-circle-outline me-1" aria-hidden />
        Last import ({dateLabel}, {record.rowCount} txns) matches the
        statement's closing balance.
      </div>
    )
  }
  return (
    <div className="small text-muted mt-1">
      Last import: {dateLabel}, {record.rowCount} txns (no stated closing
      balance to verify against).
    </div>
  )
}

// ─── Add credit card (statement import) modal ───────────────────────────────

function AddCreditCardModal({
  onSave,
  onClose,
}: {
  onSave: () => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [openingDate, setOpeningDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cents = Math.round(parseFloat(openingBalance || '0') * 100)
    if (!name.trim()) {
      setError('Give this card a name.')
      return
    }
    if (!Number.isFinite(cents) || cents < 0) {
      setError('Opening balance must be a non-negative amount.')
      return
    }
    createCreditCardAccount(name.trim(), cents, openingDate)
    onSave()
  }

  return (
    <Modal show onHide={onClose} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Add Credit Card (Statement Import)</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small">
            This is different from a plain manual "Credit Card" liability — this
            account holds real transactions imported from your bank's statement,
            so it can be categorized and budgeted like any Up Bank account.
          </p>
          <Form.Group className="mb-3">
            <Form.Label>Card name</Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chase Sapphire"
              autoFocus
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Opening balance</Form.Label>
            <Form.Control
              type="number"
              step="0.01"
              min="0"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="0.00"
            />
            <Form.Text className="text-muted">
              Use the "Previous Balance" / "Opening Balance" printed on the
              first statement you'll import.
            </Form.Text>
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>Opening balance date</Form.Label>
            <Form.Control
              type="date"
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
            />
            <Form.Text className="text-muted">
              The statement period's start date — the anchor future imports are
              calculated from.
            </Form.Text>
          </Form.Group>
          {error && <div className="text-danger small mt-2">{error}</div>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Add Card
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function AnalyticsNetWorth() {
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const [refresh, setRefresh] = useState(0)
  const navigate = useNavigate()

  // State for modals
  const [quickUpdateAccount, setQuickUpdateAccount] =
    useState<ManualAccountRow | null>(null)
  const [editAccount, setEditAccount] = useState<ManualAccountRow | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addInitialType, setAddInitialType] =
    useState<ManualAccountType | null>(null)
  const [showAddCreditCard, setShowAddCreditCard] = useState(false)
  const [importAccount, setImportAccount] = useState<AccountRow | null>(null)

  const bump = useCallback(() => setRefresh((r) => r + 1), [])

  const upAccounts = useMemo(
    () => getAccountsByTypes(['TRANSACTIONAL', 'SAVER', 'HOME_LOAN']),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt, refresh]
  )

  const ccAccounts = useMemo(
    () => getAccountsByTypes([CREDIT_CARD_IMPORT_TYPE]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt, refresh]
  )

  const manualAccounts = useMemo(
    () => getManualAccounts(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh]
  )

  const { summary, projected } = useMemo(() => {
    const s = getNetWorthSummary()
    return { summary: s, projected: getProjectedNetWorth(s.totalCents) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncCompletedAt, refresh])

  const snapshots = useMemo(
    () => getNetWorthSnapshots(12),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncCompletedAt, refresh]
  )

  const manualAssets = manualAccounts.filter((a) => a.kind === 'asset')
  const manualLiabilities = manualAccounts.filter((a) => a.kind === 'liability')
  const staleAccounts = manualAccounts.filter(isStale)

  const prevSnapshot =
    snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null
  const deltaVsPrev = prevSnapshot
    ? summary.totalCents - prevSnapshot.total_cents
    : null

  const hasApproximate = staleAccounts.length > 0

  function openQuickUpdate(account: ManualAccountRow) {
    setQuickUpdateAccount(account)
  }

  function handleQuickSave(balanceCents: number) {
    if (!quickUpdateAccount) return
    updateManualAccountBalance(quickUpdateAccount.id, balanceCents)
    toast.success('Balance updated.')
    setQuickUpdateAccount(null)
    bump()
  }

  function openFullEdit(account: ManualAccountRow) {
    setQuickUpdateAccount(null)
    setEditAccount(account)
  }

  function handleDeleteAccount() {
    if (!editAccount) return
    deleteManualAccount(editAccount.id)
    toast.success('Account removed.')
    setEditAccount(null)
    bump()
  }

  function handleModalSave() {
    setShowAddModal(false)
    setEditAccount(null)
    setAddInitialType(null)
    bump()
  }

  return (
    <div className="grid-margin">
      <div className="d-flex align-items-start justify-content-between mb-3">
        <p className="text-muted mb-0 small">
          Up Bank accounts sync automatically. External accounts are updated
          manually.
        </p>
        <HelpPopover
          id="net-worth-help"
          title="Net Worth"
          content="Net worth is total assets minus total liabilities. Up Bank balances sync automatically on each sync. External accounts (credit cards, super, HECS, property, etc.) are entered manually — tap any account to update its balance. The projected figure excludes upcoming bills due before your next payday, but not liability repayments (like credit card payments) since those are asset-liability transfers that don't change your net worth."
          ariaLabel="How does Net Worth work?"
        />
      </div>

      {/* ── Summary KPI card ─────────────────────────────────────────────── */}
      <Card className="grid-margin">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="text-muted mb-0">Net Worth at a glance</h6>
            {hasApproximate && <Badge bg="secondary">≈ approximate</Badge>}
          </div>
          <div className="d-flex flex-wrap gap-3">
            <div
              className="rounded p-3 flex-fill"
              style={{
                background: 'var(--bs-tertiary-bg, rgba(0,0,0,0.04))',
                minWidth: 140,
              }}
            >
              <div className="small text-muted mb-1">Net Worth</div>
              <div className="fw-semibold fs-4">
                {hasApproximate ? '≈ ' : ''}${formatMoney(summary.totalCents)}
              </div>
              {deltaVsPrev !== null && (
                <div className="small mt-1">
                  {deltaArrow(deltaVsPrev)}
                  <span className="text-muted"> vs last snapshot</span>
                </div>
              )}
            </div>
            <div
              className="rounded p-3 flex-fill"
              style={{
                background: 'var(--bs-tertiary-bg, rgba(0,0,0,0.04))',
                minWidth: 140,
              }}
            >
              <div className="small text-muted mb-1">
                Projected (after bills)
              </div>
              <div className="fw-semibold fs-5 text-muted">
                ≈ ${formatMoney(projected.projectedCents)}
              </div>
              {projected.upcomingExpenseCents > 0 && (
                <div className="small text-muted mt-1">
                  −${formatMoney(projected.upcomingExpenseCents)} upcoming
                  expenses
                </div>
              )}
            </div>
            <div
              className="rounded p-3 flex-fill"
              style={{
                background: 'var(--bs-tertiary-bg, rgba(0,0,0,0.04))',
                minWidth: 140,
              }}
            >
              <div className="small text-muted mb-1">Total Assets</div>
              <div className="fw-semibold fs-5 text-success">
                ${formatMoney(summary.upBankCents + summary.manualAssetsCents)}
              </div>
            </div>
            <div
              className="rounded p-3 flex-fill"
              style={{
                background: 'var(--bs-tertiary-bg, rgba(0,0,0,0.04))',
                minWidth: 140,
              }}
            >
              <div className="small text-muted mb-1">Total Liabilities</div>
              <div className="fw-semibold fs-5 text-danger">
                ${formatMoney(summary.manualLiabilitiesCents)}
              </div>
            </div>
          </div>
          {staleAccounts.length > 0 && (
            <div className="mt-3 small text-warning d-flex align-items-center gap-1">
              <i className="mdi mdi-alert-outline" aria-hidden />
              {staleAccounts.length === 1
                ? `${staleAccounts[0].name} hasn't been updated in a while — tap it to refresh.`
                : `${staleAccounts.length} accounts may be out of date — tap them to refresh.`}
            </div>
          )}
        </Card.Body>
      </Card>

      {/* ── Assets ───────────────────────────────────────────────────────── */}
      <Card className="grid-margin">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <span className="fw-semibold">
            <i className="mdi mdi-trending-up text-success me-2" aria-hidden />
            Assets
          </span>
          <span className="fw-semibold text-success">
            ${formatMoney(summary.upBankCents + summary.manualAssetsCents)}
          </span>
        </Card.Header>
        <Card.Body className="p-0">
          {/* Up Bank live section */}
          <div className="px-3 pt-3 pb-1">
            <div className="d-flex align-items-center gap-2 mb-2">
              <span
                className="badge rounded-pill"
                style={{
                  background: 'var(--vantura-success, #a5d6a7)',
                  color: '#1a2e1a',
                  fontSize: '0.7rem',
                }}
              >
                UP BANK · LIVE
              </span>
              <span className="fw-semibold">
                ${formatMoney(summary.upBankCents)}
              </span>
            </div>
            {upAccounts.length === 0 ? (
              <p className="text-muted small mb-2">No accounts synced yet.</p>
            ) : (
              upAccounts.map((a) => (
                <div
                  key={a.id}
                  className="d-flex justify-content-between align-items-center py-1 px-1"
                >
                  <span className="text-muted small">{a.display_name}</span>
                  <span className="small">${formatMoney(a.balance)}</span>
                </div>
              ))
            )}
          </div>

          {/* Manual assets */}
          {manualAssets.length > 0 && (
            <>
              <hr className="my-2 mx-3" />
              <div className="px-3 pb-1">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span
                    className="badge rounded-pill bg-secondary"
                    style={{ fontSize: '0.7rem' }}
                  >
                    MANUAL
                  </span>
                  <span className="fw-semibold">
                    ${formatMoney(summary.manualAssetsCents)}
                  </span>
                </div>
                {manualAssets.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    onQuickUpdate={openQuickUpdate}
                  />
                ))}
              </div>
            </>
          )}

          <div className="px-3 pb-3 pt-2">
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-muted"
              onClick={() => {
                setAddInitialType('SAVINGS')
                setShowAddModal(true)
              }}
            >
              <i className="mdi mdi-plus me-1" aria-hidden />
              Add asset account
            </button>
          </div>
        </Card.Body>
      </Card>

      {/* ── Liabilities ──────────────────────────────────────────────────── */}
      <Card className="grid-margin">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <span className="fw-semibold">
            <i className="mdi mdi-trending-down text-danger me-2" aria-hidden />
            Liabilities
          </span>
          <span className="fw-semibold text-danger">
            ${formatMoney(summary.manualLiabilitiesCents)}
          </span>
        </Card.Header>
        <Card.Body className="p-0">
          {manualLiabilities.length === 0 && ccAccounts.length === 0 ? (
            <p className="text-muted small px-3 py-3 mb-0">
              No liabilities added yet.
            </p>
          ) : (
            <div className="px-3 pt-2 pb-1">
              {manualLiabilities.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  onQuickUpdate={openQuickUpdate}
                />
              ))}
            </div>
          )}

          {ccAccounts.length > 0 && (
            <>
              <hr className="my-2 mx-3" />
              <div className="px-3 pb-1">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span
                    className="badge rounded-pill bg-info-subtle text-info-emphasis"
                    style={{ fontSize: '0.7rem' }}
                  >
                    IMPORTED
                  </span>
                </div>
                {ccAccounts.map((a) => (
                  <div key={a.id} className="py-1 px-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <span
                        role="button"
                        className="d-flex align-items-center gap-2 min-w-0"
                        onClick={() =>
                          navigate(`/transactions?linkedAccountId=${a.id}`)
                        }
                      >
                        <i
                          className="mdi mdi-credit-card-outline text-muted flex-shrink-0"
                          aria-hidden
                        />
                        <span className="fw-medium">{a.display_name}</span>
                      </span>
                      <span className="d-flex align-items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0"
                          onClick={() => setImportAccount(a)}
                        >
                          Import statement
                        </button>
                        <span className="small text-danger">
                          ${formatMoney(Math.abs(a.balance))}
                        </span>
                      </span>
                    </div>
                    <CreditCardImportStatus
                      accountId={a.id}
                      refresh={refresh}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="px-3 pb-3 pt-1 d-flex gap-3">
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-muted"
              onClick={() => {
                setAddInitialType('CREDIT_CARD')
                setShowAddModal(true)
              }}
            >
              <i className="mdi mdi-plus me-1" aria-hidden />
              Add liability account
            </button>
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-muted"
              onClick={() => setShowAddCreditCard(true)}
            >
              <i className="mdi mdi-plus me-1" aria-hidden />
              Add credit card (statement import)
            </button>
          </div>
        </Card.Body>
      </Card>

      {/* ── Add account primary button ────────────────────────────────────── */}
      <div className="d-flex gap-2 mb-4">
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setAddInitialType(null)
            setShowAddModal(true)
          }}
        >
          <i className="mdi mdi-plus me-1" aria-hidden />
          Add account
        </Button>
      </div>

      {/* ── Trend chart ──────────────────────────────────────────────────── */}
      {snapshots.length >= 2 && (
        <Card className="grid-margin">
          <Card.Body>
            <h6 className="text-muted mb-3">Net Worth trend</h6>
            <div style={{ width: '100%', height: 220 }}>
              <NetWorthTrendChart
                data={snapshots}
                aria-label="Net worth trend over time"
              />
            </div>
            <p className="text-muted mt-2 mb-0" style={{ fontSize: '0.72rem' }}>
              Up Bank data is live on each sync. Manual account values are as of
              their last update.
            </p>
          </Card.Body>
        </Card>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {quickUpdateAccount && (
        <QuickUpdateModal
          account={quickUpdateAccount}
          onSave={handleQuickSave}
          onClose={() => setQuickUpdateAccount(null)}
          onFullEdit={() => openFullEdit(quickUpdateAccount)}
        />
      )}

      {(showAddModal || editAccount) && (
        <AccountModal
          editingAccount={editAccount}
          initialType={addInitialType}
          onSave={handleModalSave}
          onDelete={editAccount ? handleDeleteAccount : undefined}
          onClose={() => {
            setShowAddModal(false)
            setEditAccount(null)
            setAddInitialType(null)
          }}
        />
      )}

      {showAddCreditCard && (
        <AddCreditCardModal
          onSave={() => {
            setShowAddCreditCard(false)
            toast.success('Credit card added.')
            bump()
          }}
          onClose={() => setShowAddCreditCard(false)}
        />
      )}

      {importAccount && (
        <StatementImportModal
          accountId={importAccount.id}
          accountName={importAccount.display_name}
          onClose={() => setImportAccount(null)}
          onImported={() => {
            setImportAccount(null)
            bump()
          }}
        />
      )}
    </div>
  )
}
