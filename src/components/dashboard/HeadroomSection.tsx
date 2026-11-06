/**
 * The Dashboard's Headroom section (#212, #216): three cards,
 * **On hand − Still to go out = Headroom**, per #181 variant D. It's the
 * safety net, so it sits at the top and isn't hideable or reorderable.
 *
 * `HeadroomCards` only renders what it's given; `HeadroomSection` does the
 * reads (`getHeadroom`, `getOnHandAccounts`, `getOnHandSavers`) and the writes
 * (Mark paid + Undo, the Saver switches), re-reading after each.
 */

import { useCallback, useMemo, useState } from 'react'
import type React from 'react'
import { Card, Form, Modal } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { formatSignedMoney } from '@/lib/format'
import { MONTH_NAMES } from '@/lib/constants'
import {
  getOnHandAccounts,
  getOnHandSavers,
  setSaverCountsOnHand,
  type OnHandAccount,
  type OnHandSaver,
} from '@/services/accounts'
import { getHeadroom, type Headroom } from '@/services/headroom'
import { markOccurrencePaid, unmarkOccurrencePaid } from '@/services/regulars'
import { toast } from '@/stores/toastStore'
import { HEADROOM_CAPTION, splitBar } from './headroomBar'

const money = (cents: number | null) =>
  cents === null ? '—' : formatSignedMoney(cents)

function shortMonth(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1].slice(0, 3)
}

/** `YYYY-MM-DD` → "28 Nov". */
function dayPill(date: string): string {
  return `${Number(date.slice(8, 10))} ${shortMonth(date.slice(0, 7))}`
}

function SumCard({
  tone,
  icon,
  label,
  total,
  testId,
  children,
}: {
  tone: 'on-hand' | 'to-go' | 'ok' | 'bad' | 'none'
  icon: string
  label: string
  total: string
  testId: string
  children: React.ReactNode
}) {
  return (
    <Card
      className={`headroom-card headroom-card--${tone}`}
      data-testid={testId}
    >
      <div className="headroom-card__head">
        <div className="headroom-card__label">
          <span className="headroom-card__icon">
            <i className={`mdi ${icon}`} aria-hidden />
          </span>
          <span>{label}</span>
        </div>
        <div className="headroom-card__total">{total}</div>
      </div>
      <div className="headroom-card__body">{children}</div>
    </Card>
  )
}

export interface HeadroomCardsProps {
  headroom: Headroom
  accounts: OnHandAccount[]
  onMarkPaid: (regularId: number, date: string, name: string) => void
  onChooseSavers: () => void
}

export function HeadroomCards({
  headroom: h,
  accounts,
  onMarkPaid,
  onChooseSavers,
}: HeadroomCardsProps) {
  const declined = h.headroomCents === null || h.stillToGoOutCents === null
  const negative = h.headroomCents !== null && h.headroomCents < 0
  const bar =
    h.headroomCents !== null && h.stillToGoOutCents !== null
      ? splitBar(h.onHandCents, h.stillToGoOutCents, h.headroomCents)
      : null
  const free = h.freeSpendingSoFarCents

  return (
    <section className="headroom" aria-label="Headroom">
      <div className="headroom__row">
        <SumCard
          tone="on-hand"
          icon="mdi-wallet-outline"
          label="On hand"
          total={money(h.onHandCents)}
          testId="headroom-on-hand"
        >
          {accounts.map((a) => (
            <div key={a.id} className="headroom-line">
              <span className="headroom-line__name">
                <span className="headroom-dot" aria-hidden />
                <span>{a.display_name}</span>
              </span>
              <span className="headroom-line__fig">{money(a.balance)}</span>
            </div>
          ))}
          <div className="headroom-note pt-1">
            Savers switched off aren’t counted ·{' '}
            <button
              type="button"
              className="headroom-link"
              onClick={onChooseSavers}
            >
              Choose
            </button>
          </div>
        </SumCard>

        <div className="headroom__op" aria-hidden>
          −
        </div>

        <SumCard
          tone="to-go"
          icon="mdi-arrow-top-right"
          label={`Still to go out · ${shortMonth(h.month)}`}
          total={money(h.stillToGoOutCents)}
          testId="headroom-to-go"
        >
          <div className="headroom-subhead">Regulars not paid yet</div>
          {h.regularsNotPaidYet.length === 0 && (
            <div className="headroom-note py-1">None left this month</div>
          )}
          {h.regularsNotPaidYet.map((r) => (
            <div key={`${r.regularId}-${r.date}`} className="headroom-line">
              <span className="headroom-line__name">
                <span>{r.name}</span>
                {r.overdue ? (
                  <button
                    type="button"
                    className="headroom-pill headroom-pill--overdue"
                    onClick={() => onMarkPaid(r.regularId, r.date, r.name)}
                    aria-label={`${r.name}, due ${dayPill(r.date)}, overdue. Mark paid`}
                  >
                    overdue · Mark paid
                  </button>
                ) : (
                  <span className="headroom-pill">{dayPill(r.date)}</span>
                )}
              </span>
              <span className="headroom-line__fig">{money(r.amountCents)}</span>
            </div>
          ))}
          <div className="headroom-subhead">Left in trackers</div>
          {h.trackersLeft.length === 0 && (
            <div className="headroom-note py-1">No active trackers</div>
          )}
          {h.trackersLeft.map((t) => (
            <div
              key={t.trackerId}
              className={`headroom-line${t.leftCents === 0 ? ' headroom-line--dim' : ''}`}
            >
              <span className="headroom-line__name">
                <span>{t.name}</span>
              </span>
              <span className="headroom-line__fig">{money(t.leftCents)}</span>
            </div>
          ))}
        </SumCard>

        <div className="headroom__op" aria-hidden>
          =
        </div>

        <SumCard
          tone={declined ? 'none' : negative ? 'bad' : 'ok'}
          icon={
            declined ? 'mdi-help' : negative ? 'mdi-alert-outline' : 'mdi-check'
          }
          label="Headroom"
          total={money(h.headroomCents)}
          testId="headroom-headroom"
        >
          {declined ? (
            <div className="headroom-note">
              A tracker’s budget can’t be worked out for this month, so Still to
              go out and Headroom aren’t shown.
            </div>
          ) : (
            bar && (
              <>
                <div
                  className="headroom-bar"
                  role="img"
                  aria-label={bar.caption}
                >
                  <div
                    className="headroom-bar__to-go"
                    style={{ flexBasis: `${bar.toGoPct}%` }}
                  />
                  {!negative && <div className="headroom-bar__left" />}
                </div>
                <div className="headroom-note mt-1">{bar.caption}</div>
              </>
            )
          )}
          <div className="headroom-note mt-2">{HEADROOM_CAPTION}</div>
          <div className="headroom-line headroom-line--divided">
            <span className="headroom-line__name">
              <span>Free spending so far</span>
              {free !== null && (
                <Link to="/analytics/budget" className="headroom-link">
                  Budget Plan →
                </Link>
              )}
            </span>
            {free === null ? (
              <Link to="/settings" className="headroom-link">
                Set your pay
              </Link>
            ) : (
              <span
                className={`headroom-line__fig${free < 0 ? ' headroom-fig--bad' : ''}`}
              >
                {money(free)}
              </span>
            )}
          </div>
        </SumCard>
      </div>
    </section>
  )
}

function SaverPicker({
  show,
  savers,
  onToggle,
  onClose,
}: {
  show: boolean
  savers: OnHandSaver[]
  onToggle: (id: string, on: boolean) => void
  onClose: () => void
}) {
  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5">Savers in On hand</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted mb-3">
          Switch on the Savers you spend or pay bills from. Leave emergency and
          goal money off.
        </p>
        {savers.length === 0 ? (
          <div className="small text-muted">No Savers to choose from.</div>
        ) : (
          savers.map((s) => (
            <Form.Check
              key={s.id}
              type="switch"
              role="switch"
              id={`on-hand-${s.id}`}
              className="mb-2"
              checked={s.countsOnHand}
              onChange={(e) => onToggle(s.id, e.target.checked)}
              label={`${s.display_name} · ${formatSignedMoney(s.balance)}`}
            />
          ))
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </Modal.Footer>
    </Modal>
  )
}

/**
 * Re-reads whenever `refreshKey` changes: a sync, a new day, or any
 * section's write. `onChange` is called after this section writes, and must
 * change `refreshKey`.
 */
export function HeadroomSection({
  refreshKey,
  onChange,
}: {
  refreshKey: string
  onChange: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const bump = onChange

  const { headroom, accounts, savers } = useMemo(
    () => ({
      headroom: getHeadroom(),
      accounts: getOnHandAccounts(),
      savers: getOnHandSavers(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshKey]
  )

  const handleMarkPaid = useCallback(
    (regularId: number, date: string, name: string) => {
      if (!markOccurrencePaid(regularId, date)) {
        toast.error(`Couldn’t mark ${name} paid.`)
        bump()
        return
      }
      bump()
      toast.success(`${name} marked paid`, {
        action: {
          label: 'Undo',
          onClick: () => {
            unmarkOccurrencePaid(regularId, date)
            bump()
          },
        },
      })
    },
    [bump]
  )

  const handleToggle = useCallback(
    (id: string, on: boolean) => {
      setSaverCountsOnHand(id, on)
      bump()
    },
    [bump]
  )

  return (
    <>
      <HeadroomCards
        headroom={headroom}
        accounts={accounts}
        onMarkPaid={handleMarkPaid}
        onChooseSavers={() => setPickerOpen(true)}
      />
      <SaverPicker
        show={pickerOpen}
        savers={savers}
        onToggle={handleToggle}
        onClose={() => setPickerOpen(false)}
      />
    </>
  )
}
