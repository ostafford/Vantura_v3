// PROTOTYPE — fake fixture data for the Dashboard-after-the-cuts variants
// (#181). No real Up data. Figures in cents.
export const money = (c: number) =>
  `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export interface Account {
  name: string
  kind: 'spending' | 'saver'
  cents: number
  inHeadroom: boolean
}
export interface ToGo {
  name: string
  kind: 'regular' | 'tracker'
  cents: number
  /** Regulars only: due date (day of month) and status */
  day?: number
  status?: 'overdue' | 'due'
}

export interface DashFixture {
  monthLabel: string
  day: number
  daysInMonth: number
  accounts: Account[]
  stillToGo: ToGo[]
  freeSoFarCents: number
  incomeCents: number
  moneyInCents: number
  moneyOutCents: number
  /** Mon..Sun this week, null = future day */
  week: (number | null)[]
  lastWeek: number[]
  /** savedCents < 0 = overspent */
  review: { month: string; savedCents: number } | null
}

export function getFixture(opts: {
  neg: boolean
  review: 'saved' | 'over' | 'off'
}): DashFixture {
  const accounts: Account[] = [
    {
      name: 'Spending',
      kind: 'spending',
      cents: opts.neg ? 41_250 : 186_420,
      inHeadroom: true,
    },
    { name: 'Bills saver', kind: 'saver', cents: 92_000, inHeadroom: true },
    {
      name: 'Emergency fund',
      kind: 'saver',
      cents: 850_000,
      inHeadroom: false,
    },
    { name: 'Holiday', kind: 'saver', cents: 214_030, inHeadroom: false },
  ]
  const stillToGo: ToGo[] = [
    { name: 'Phone', kind: 'regular', cents: 4_500, day: 2, status: 'overdue' },
    { name: 'Streaming', kind: 'regular', cents: 1_899, day: 5, status: 'due' },
    { name: 'Insurance', kind: 'regular', cents: 8_740, day: 6, status: 'due' },
    { name: 'Rent', kind: 'regular', cents: 120_000, day: 15, status: 'due' },
    { name: 'Gym', kind: 'regular', cents: 2_990, day: 22, status: 'due' },
    { name: 'Groceries', kind: 'tracker', cents: 31_200 },
    { name: 'Eating out', kind: 'tracker', cents: 8_450 },
    { name: 'Transport', kind: 'tracker', cents: 0 },
  ]
  return {
    monthLabel: 'November 2026',
    day: 4,
    daysInMonth: 30,
    accounts,
    stillToGo,
    freeSoFarCents: opts.neg ? -6_210 : 312_640,
    incomeCents: 520_000,
    moneyInCents: 0,
    moneyOutCents: opts.neg ? 526_210 : 207_360,
    week: [4_210, 1_850, 9_920, 2_300, null, null, null],
    lastWeek: [3_100, 2_400, 6_500, 1_200, 15_800, 8_200, 4_400],
    review:
      opts.review === 'off'
        ? null
        : {
            month: 'October',
            savedCents: opts.review === 'over' ? -21_380 : 48_215,
          },
  }
}

export function headroom(f: DashFixture) {
  const onHand = f.accounts
    .filter((a) => a.inHeadroom)
    .reduce((s, a) => s + a.cents, 0)
  const toGo = f.stillToGo.reduce((s, t) => s + t.cents, 0)
  const netWorth = f.accounts.reduce((s, a) => s + a.cents, 0)
  return { onHand, toGo, headroom: onHand - toGo, netWorth }
}

/** Regulars due in the next 7 days (or overdue) — the due-soon set. */
export const dueSoon = (f: DashFixture) =>
  f.stillToGo.filter(
    (t) => t.kind === 'regular' && t.day != null && t.day <= f.day + 7
  )
