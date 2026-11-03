// PROTOTYPE — throwaway. Wayfinder ticket #174 (map #169): plan vs actual.
// Three variants of plan vs actual, switchable via ?variant=A|B|C, on the
// existing /analytics/budget route. Fixture month only (fake, generic data —
// no real Up data); ?month=live|done flips between day 10 of 30 and a
// finished month. Rules follow the resolutions on #171 / #172 / #173.

export type MonthState = 'live' | 'done'

export type RegularStatus =
  | 'paid' // ≥1 Linked payment in the month
  | 'not-paid' // due later this month
  | 'overdue' // due date passed, no Linked payment / Mark paid
  | 'no-link' // no linked description → no actual figure (never a fake $0)

export interface PvaItem {
  id: string
  name: string
  kind: 'regular' | 'tracker'
  detail: string // cadence / due line
  plannedCents: number
  actualCents: number | null // null = no actual figure (no-link Regular)
  status?: RegularStatus
}

export interface PvaBucket {
  id: string
  name: string
  icon: string
  color: string
  items: PvaItem[]
  notInBucket?: boolean
}

export interface UnplannedRow {
  id: string
  name: string
  cents: number // may be negative (refunds)
  children?: { name: string; cents: number }[]
}

export interface PvaMonth {
  state: MonthState
  label: string
  day: number
  daysInMonth: number
  incomeCents: number
  buckets: PvaBucket[]
  unplanned: UnplannedRow[]
}

type Live<T> = { live: T; done: T }

interface ItemSeed extends Omit<PvaItem, 'actualCents' | 'status'> {
  actual: Live<number | null>
  status?: Live<RegularStatus>
}

const seeds: {
  id: string
  name: string
  icon: string
  color: string
  notInBucket?: boolean
  items: ItemSeed[]
}[] = [
  {
    id: 'household',
    name: 'Household',
    icon: 'mdi-home-outline',
    color: '#4f7cff',
    items: [
      {
        id: 'rent',
        name: 'Rent',
        kind: 'regular',
        detail: 'Monthly · due 1st',
        plannedCents: 200000,
        actual: { live: 200000, done: 200000 },
        status: { live: 'paid', done: 'paid' },
      },
      {
        id: 'power',
        name: 'Electricity',
        kind: 'regular',
        detail: 'Quarterly · due 18th',
        plannedCents: 24000,
        actual: { live: 0, done: 26240 },
        status: { live: 'not-paid', done: 'paid' },
      },
      {
        id: 'internet',
        name: 'Internet',
        kind: 'regular',
        detail: 'Monthly · due 5th',
        plannedCents: 7500,
        actual: { live: 7500, done: 7500 },
        status: { live: 'paid', done: 'paid' },
      },
      {
        id: 'groceries',
        name: 'Groceries',
        kind: 'tracker',
        detail: 'Tracker · $150/week',
        plannedCents: 65000,
        actual: { live: 22815, done: 61280 },
      },
    ],
  },
  {
    id: 'subs',
    name: 'Subscriptions',
    icon: 'mdi-play-box-outline',
    color: '#a35cff',
    items: [
      {
        id: 'streaming',
        name: 'Streaming',
        kind: 'regular',
        detail: 'Monthly · due 3rd',
        plannedCents: 1699,
        actual: { live: 1699, done: 1699 },
        status: { live: 'paid', done: 'paid' },
      },
      {
        id: 'music',
        name: 'Music',
        kind: 'regular',
        detail: 'Monthly · due 14th',
        plannedCents: 1299,
        actual: { live: 0, done: 1299 },
        status: { live: 'not-paid', done: 'paid' },
      },
      {
        id: 'phone',
        name: 'Phone',
        kind: 'regular',
        detail: 'Monthly · due 8th · no linked description',
        plannedCents: 4500,
        actual: { live: null, done: null },
        status: { live: 'no-link', done: 'no-link' },
      },
      {
        id: 'gym',
        name: 'Gym',
        kind: 'regular',
        detail: 'Weekly · 4 this month',
        plannedCents: 6380,
        actual: { live: 1595, done: 6380 },
        status: { live: 'overdue', done: 'paid' },
      },
    ],
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle',
    icon: 'mdi-glass-cocktail',
    color: '#ff8a3d',
    items: [
      {
        id: 'eating',
        name: 'Eating out',
        kind: 'tracker',
        detail: 'Tracker · $250/month',
        plannedCents: 25000,
        actual: { live: 14250, done: 31820 },
      },
      {
        id: 'fuel',
        name: 'Fuel',
        kind: 'tracker',
        detail: 'Tracker · $90/fortnight',
        plannedCents: 19500,
        actual: { live: 6100, done: 17140 },
      },
    ],
  },
  {
    id: 'none',
    name: 'Not in a bucket',
    icon: 'mdi-tray-alert',
    color: '#8a8f98',
    notInBucket: true,
    items: [
      {
        id: 'parking',
        name: 'Parking',
        kind: 'tracker',
        detail: 'Tracker · not in any bucket',
        plannedCents: 0,
        actual: { live: 1800, done: 4200 },
      },
    ],
  },
]

const unplannedSeed: Live<UnplannedRow[]> = {
  live: [
    {
      id: 'shopping',
      name: 'Shopping',
      cents: 7995,
      children: [{ name: 'Clothing & accessories', cents: 7995 }],
    },
    {
      id: 'personal',
      name: 'Personal care',
      cents: -2000,
      children: [{ name: 'Hair & beauty (refund)', cents: -2000 }],
    },
    { id: 'uncat', name: 'Uncategorised', cents: 1200 },
  ],
  done: [
    {
      id: 'shopping',
      name: 'Shopping',
      cents: 11395,
      children: [
        { name: 'Clothing & accessories', cents: 7995 },
        { name: 'Homeware & appliances', cents: 3400 },
      ],
    },
    {
      id: 'health',
      name: 'Health & medical',
      cents: 4500,
      children: [{ name: 'Pharmacy', cents: 4500 }],
    },
    {
      id: 'personal',
      name: 'Personal care',
      cents: -2000,
      children: [{ name: 'Hair & beauty (refund)', cents: -2000 }],
    },
    { id: 'uncat', name: 'Uncategorised', cents: 2750 },
  ],
}

export function getFixtureMonth(state: MonthState): PvaMonth {
  return {
    state,
    label: 'September 2026',
    day: state === 'live' ? 10 : 30,
    daysInMonth: 30,
    incomeCents: 520000,
    buckets: seeds.map((b) => ({
      id: b.id,
      name: b.name,
      icon: b.icon,
      color: b.color,
      notInBucket: b.notInBucket,
      items: b.items.map(({ actual, status, ...rest }) => ({
        ...rest,
        actualCents: actual[state],
        status: status?.[state],
      })),
    })),
    unplanned: unplannedSeed[state],
  }
}

// ─── Derived figures ─────────────────────────────────────────────────────────

export function bucketPlanned(b: PvaBucket) {
  return b.items.reduce((s, i) => s + i.plannedCents, 0)
}
export function bucketActual(b: PvaBucket) {
  return b.items.reduce((s, i) => s + (i.actualCents ?? 0), 0)
}
export function unplannedTotal(m: PvaMonth) {
  return m.unplanned.reduce((s, r) => s + r.cents, 0)
}

/** Planned money not yet spent, floored per item (an overspend never cancels another item). */
export function stillPlanned(m: PvaMonth) {
  return m.buckets
    .flatMap((b) => b.items)
    .reduce(
      (s, i) => s + Math.max(0, i.plannedCents - (i.actualCents ?? 0)),
      0
    )
}

export function totals(m: PvaMonth) {
  const committed = m.buckets.reduce((s, b) => s + bucketPlanned(b), 0)
  const plannedActual = m.buckets.reduce((s, b) => s + bucketActual(b), 0)
  const unplanned = unplannedTotal(m)
  const actual = plannedActual + unplanned
  return {
    income: m.incomeCents,
    committed,
    plannedActual,
    unplanned,
    actual,
    freeSpending: m.incomeCents - actual, // "so far" while live, "saved" when done
    unallocated: m.incomeCents - committed,
    stillPlanned: stillPlanned(m),
    // PROTOTYPE-ONLY idea (variant C): not a decided term.
    onTrackToSave: m.incomeCents - actual - stillPlanned(m),
  }
}

export const money = (cents: number) =>
  `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
