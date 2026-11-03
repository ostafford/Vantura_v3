// PROTOTYPE — Variant D "Sum + week" (Okky's mix after A–C): B's
// On hand − Still to go out = Headroom, with colour; C's week strip with
// Regulars on their day; A/C's full Month review card. No net worth.
import { createContext, useContext } from 'react'
import { Card } from 'react-bootstrap'
import { useSearchParams } from 'react-router-dom'
import { headroom, money, type DashFixture, type ToGo } from './fixture'
import { MonthReviewCard, Stub, WeekBars, danger, muted, warning } from './bits'

export const variantDName = 'Sum + week (mix)'

const ON_HAND = 'var(--vantura-primary)'
const TO_GO = 'var(--bs-warning)'
// Readable text versions of each card's tone (amber needs the darker -text token).
const INK = {
  onHand: 'var(--vantura-primary)',
  toGo: 'var(--vantura-warning-text)',
  ok: 'var(--vantura-success-text)',
  bad: 'var(--vantura-danger-text)',
}
type InkLevel = 'off' | 'figures' | 'all'
const InkCtx = createContext<{ level: InkLevel; ink?: string }>({
  level: 'off',
})
/** colour for a figure (amount) */
function useFig() {
  const c = useContext(InkCtx)
  return c.level === 'off' ? undefined : c.ink
}
/** colour for a name/label */
function useName() {
  const c = useContext(InkCtx)
  return c.level === 'all' ? c.ink : undefined
}
const Fig = ({ cents }: { cents: number }) => (
  <span style={{ color: useFig() }}>{money(cents)}</span>
)
const Name = ({ children }: { children: React.ReactNode }) => (
  <span style={{ color: useName() }}>{children}</span>
)

function SumCard({
  tone,
  ink,
  level,
  icon,
  label,
  cents,
  big,
  children,
}: {
  tone: string
  ink: string
  level: InkLevel
  icon: string
  label: string
  cents: number
  big?: boolean
  children?: React.ReactNode
}) {
  return (
    <InkCtx.Provider value={{ level, ink }}>
      <Card
        className="flex-grow-1 overflow-hidden"
        style={{
          flexBasis: 0,
          borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`,
        }}
      >
        <div
          className="px-3 pt-3 pb-2"
          style={{
            background: `color-mix(in srgb, ${tone} 14%, transparent)`,
            borderTop: `4px solid ${tone}`,
          }}
        >
          <div
            className="d-flex align-items-center gap-2"
            style={{ fontSize: '0.8rem' }}
          >
            <span
              className="d-inline-flex align-items-center justify-content-center"
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: tone,
                color: '#fff',
              }}
            >
              <i className={`mdi ${icon}`} aria-hidden />
            </span>
            <span
              className="fw-semibold"
              style={{ color: level === 'all' ? ink : undefined }}
            >
              {label}
            </span>
          </div>
          <div
            className="fw-bold"
            style={{
              fontSize: big ? '2.2rem' : '1.6rem',
              lineHeight: 1.2,
              color: level === 'off' ? undefined : ink,
            }}
          >
            {money(cents)}
          </div>
        </div>
        {children && <div className="px-3 py-2 small">{children}</div>}
      </Card>
    </InkCtx.Provider>
  )
}

const Op = ({ c }: { c: string }) => (
  <div
    className="d-none d-md-flex align-items-center justify-content-center fs-3 fw-light"
    style={{ color: muted, width: 20 }}
  >
    {c}
  </div>
)

function RegularRow({ t }: { t: ToGo }) {
  const overdue = t.status === 'overdue'
  return (
    <div className="d-flex justify-content-between align-items-center py-1 gap-2">
      <span className="d-flex align-items-center gap-2">
        <i
          className="mdi mdi-calendar-sync-outline"
          style={{ color: TO_GO }}
          aria-hidden
        />
        <Name>{t.name}</Name>
        <span
          className="px-2 rounded-pill"
          style={{
            fontSize: '0.68rem',
            background: overdue
              ? 'color-mix(in srgb, var(--vantura-danger) 18%, transparent)'
              : 'var(--bs-tertiary-bg)',
            color: overdue ? danger : muted,
          }}
        >
          {overdue ? 'overdue · Mark paid' : `${t.day} Nov`}
        </span>
      </span>
      <Fig cents={t.cents} />
    </div>
  )
}

export function VariantD({ f }: { f: DashFixture }) {
  const h = headroom(f)
  const neg = h.headroom < 0
  const hTone = neg ? 'var(--vantura-danger)' : 'var(--vantura-success)'
  const [params] = useSearchParams()
  const level: InkLevel =
    (['off', 'figures', 'all'] as const).find((v) => v === params.get('ink')) ??
    'figures'
  return (
    <div>
      <MonthReviewCard f={f} />

      <div className="d-flex flex-column flex-md-row gap-2 mb-3 align-items-stretch">
        <SumCard
          tone={ON_HAND}
          ink={INK.onHand}
          level={level}
          icon="mdi-wallet-outline"
          label="On hand"
          cents={h.onHand}
        >
          {f.accounts
            .filter((a) => a.inHeadroom)
            .map((a) => (
              <div key={a.name} className="d-flex justify-content-between py-1">
                <span className="d-flex align-items-center gap-2">
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: ON_HAND,
                      display: 'inline-block',
                    }}
                  />
                  <Name>{a.name}</Name>
                </span>
                <Fig cents={a.cents} />
              </div>
            ))}
          <div className="pt-1" style={{ fontSize: '0.7rem', color: muted }}>
            Savers switched off aren’t counted · <a href="#">Choose</a>
          </div>
        </SumCard>
        <Op c="−" />
        <SumCard
          tone={TO_GO}
          ink={INK.toGo}
          level={level}
          icon="mdi-arrow-top-right"
          label="Still to go out · Nov"
          cents={h.toGo}
        >
          <div
            className="fw-semibold"
            style={{ fontSize: '0.72rem', color: warning }}
          >
            Regulars not paid yet
          </div>
          {f.stillToGo
            .filter((t) => t.kind === 'regular')
            .map((t) => (
              <RegularRow key={t.name} t={t} />
            ))}
          <div
            className="fw-semibold mt-2"
            style={{ fontSize: '0.72rem', color: warning }}
          >
            Left in trackers
          </div>
          {f.stillToGo
            .filter((t) => t.kind === 'tracker')
            .map((t) => (
              <div
                key={t.name}
                className="d-flex justify-content-between align-items-center py-1"
                style={{ opacity: t.cents === 0 ? 0.5 : 1 }}
              >
                <span className="d-flex align-items-center gap-2">
                  <i
                    className="mdi mdi-target"
                    style={{ color: TO_GO }}
                    aria-hidden
                  />
                  <Name>{t.name}</Name>
                </span>
                <Fig cents={t.cents} />
              </div>
            ))}
        </SumCard>
        <Op c="=" />
        <SumCard
          tone={hTone}
          ink={neg ? INK.bad : INK.ok}
          level={level}
          icon={neg ? 'mdi-alert-outline' : 'mdi-check'}
          label="Headroom"
          cents={h.headroom}
          big
        >
          <div style={{ color: neg ? danger : muted }}>
            {neg
              ? 'Short of what’s still going out this month.'
              : 'Yours after everything still going out this month.'}
          </div>
        </SumCard>
      </div>

      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex justify-content-between mb-2 flex-wrap gap-2">
            <span className="fw-semibold">This week</span>
            <span className="small" style={{ color: muted }}>
              bars = spending ·{' '}
              <i
                className="mdi mdi-calendar-sync-outline"
                style={{ color: TO_GO }}
                aria-hidden
              />{' '}
              = Regulars due
            </span>
          </div>
          <WeekBars f={f} height={80} ghost={false} bills />
        </Card.Body>
      </Card>

      <div className="dashboard-grid">
        <Stub label="Month at a glance (chart + money in/out)" />
        <Stub label="Trackers" />
        <Stub label="Upcoming (Overdue / This month / Later)" />
      </div>
    </div>
  )
}
