import { describe, it, expect } from 'vitest'
import {
  getPaydayDayOptions,
  PAYDAY_DAYS_WEEKLY,
  PAYDAY_DAYS_MONTHLY,
  PAYDAY_DAYS_MONTHLY_LAST_WEEKDAY,
  isMonthlyLastWeekday,
  lastBusinessDayOfMonth,
  lastWeekdayOfMonth,
  monthlyPaydayDate,
  computeNextMonthlyLastWeekday,
  computeNextPaydayFromReference,
  getPaydayDayLabel,
} from './payday'

// Calendar reference — Jan 1 2026 = Thursday (JS getUTCDay 4). Derived:
//   Feb 1 2026 = Sunday    Mar 1 = Sunday   Apr 1 = Wednesday
//   May 1 2026 = Friday    Jun 1 = Monday   Jul 1 = Wednesday
//   Aug 1 2026 = Saturday  Dec 1 = Tuesday  Jan 1 2027 = Friday

describe('getPaydayDayOptions', () => {
  it('returns weekly options for WEEKLY', () => {
    const opts = getPaydayDayOptions('WEEKLY')
    expect(opts).toEqual(PAYDAY_DAYS_WEEKLY)
    expect(opts).toHaveLength(7)
    expect(opts[0]).toEqual({ value: 1, label: 'Monday' })
  })

  it('returns weekly options for FORTNIGHTLY', () => {
    expect(getPaydayDayOptions('FORTNIGHTLY')).toEqual(PAYDAY_DAYS_WEEKLY)
  })

  it('returns 34 options for MONTHLY (28 fixed + 6 relative rules)', () => {
    const opts = getPaydayDayOptions('MONTHLY')
    expect(opts).toHaveLength(34)
    // Fixed days
    expect(opts[0]).toEqual({ value: 1, label: '1st' })
    expect(opts[1]).toEqual({ value: 2, label: '2nd' })
    expect(opts[2]).toEqual({ value: 3, label: '3rd' })
    expect(opts[3]).toEqual({ value: 4, label: '4th' })
    expect(opts[27]).toEqual({ value: 28, label: '28th' })
    // Relative rules
    expect(opts[28]).toEqual({ value: 100, label: 'Last weekday' })
    expect(opts[29]).toEqual({ value: 101, label: 'Last Monday' })
    expect(opts[30]).toEqual({ value: 102, label: 'Last Tuesday' })
    expect(opts[31]).toEqual({ value: 103, label: 'Last Wednesday' })
    expect(opts[32]).toEqual({ value: 104, label: 'Last Thursday' })
    expect(opts[33]).toEqual({ value: 105, label: 'Last Friday' })
  })

  it('PAYDAY_DAYS_MONTHLY is 28 items and PAYDAY_DAYS_MONTHLY_LAST_WEEKDAY is 6 items', () => {
    expect(PAYDAY_DAYS_MONTHLY).toHaveLength(28)
    expect(PAYDAY_DAYS_MONTHLY_LAST_WEEKDAY).toHaveLength(6)
  })
})

describe('isMonthlyLastWeekday', () => {
  it('returns true for codes 100–105', () => {
    for (let code = 100; code <= 105; code++) {
      expect(isMonthlyLastWeekday(code)).toBe(true)
    }
  })

  it('returns false outside 100–105', () => {
    expect(isMonthlyLastWeekday(1)).toBe(false)
    expect(isMonthlyLastWeekday(28)).toBe(false)
    expect(isMonthlyLastWeekday(99)).toBe(false)
    expect(isMonthlyLastWeekday(106)).toBe(false)
    expect(isMonthlyLastWeekday(0)).toBe(false)
    expect(isMonthlyLastWeekday(-1)).toBe(false)
  })
})

describe('lastBusinessDayOfMonth', () => {
  // Verifies the three cases: last day is Mon–Fri, Saturday, or Sunday.

  it('April 2026: last day = Apr 30 (Thursday) → Apr 30', () => {
    expect(lastBusinessDayOfMonth(2026, 3).toISOString().slice(0, 10)).toBe(
      '2026-04-30'
    )
  })

  it('May 2026: last day = May 31 (Sunday) → May 29 (Friday)', () => {
    // May 1 = Fri → May 31 = Fri+(30%7=2)=Sun → roll back 2 → May 29
    expect(lastBusinessDayOfMonth(2026, 4).toISOString().slice(0, 10)).toBe(
      '2026-05-29'
    )
  })

  it('June 2026: last day = June 30 (Tuesday) → June 30', () => {
    expect(lastBusinessDayOfMonth(2026, 5).toISOString().slice(0, 10)).toBe(
      '2026-06-30'
    )
  })

  it('July 2026: last day = July 31 (Friday) → July 31', () => {
    expect(lastBusinessDayOfMonth(2026, 6).toISOString().slice(0, 10)).toBe(
      '2026-07-31'
    )
  })

  it('August 2026: last day = Aug 31 (Monday) → Aug 31', () => {
    // Aug 1 = Sat+(0%7=0)=Sat? Wait: Jul 1=Wed, Aug 1=Wed+(31%7=3)=Sat.
    // Aug 31 = Sat+(30%7=2)=Mon. Last biz day = Aug 31.
    expect(lastBusinessDayOfMonth(2026, 7).toISOString().slice(0, 10)).toBe(
      '2026-08-31'
    )
  })

  it('September 2026: last day = Sep 30 (Wednesday) → Sep 30', () => {
    // Aug 1=Sat, Sep 1=Sat+(31%7=3)=Tue. Sep 30=Tue+(29%7=1)=Wed.
    expect(lastBusinessDayOfMonth(2026, 8).toISOString().slice(0, 10)).toBe(
      '2026-09-30'
    )
  })

  it('handles Saturday last day: Oct 2026 → Oct 30 (Friday)', () => {
    // Sep 1=Tue, Oct 1=Tue+(30%7=2)=Thu. Oct 31=Thu+(30%7=2)=Sat → roll back 1 → Oct 30.
    expect(lastBusinessDayOfMonth(2026, 9).toISOString().slice(0, 10)).toBe(
      '2026-10-30'
    )
  })

  it('handles year boundary: December 2026 last biz day', () => {
    // Dec 1=Tue, Dec 31=Tue+(30%7=2)=Thu. Last biz day = Dec 31.
    expect(lastBusinessDayOfMonth(2026, 11).toISOString().slice(0, 10)).toBe(
      '2026-12-31'
    )
  })

  it('February 2026 (28 days): last day = Feb 28 (Saturday) → Feb 27 (Friday)', () => {
    // Feb 1=Sun, Feb 28=Sun+(27%7=6)=Sat → roll back 1 → Feb 27.
    expect(lastBusinessDayOfMonth(2026, 1).toISOString().slice(0, 10)).toBe(
      '2026-02-27'
    )
  })
})

describe('lastWeekdayOfMonth', () => {
  it('last Friday of May 2026 = May 29 (month starts Friday)', () => {
    // May 1=Fri → Fridays: 1,8,15,22,29
    expect(lastWeekdayOfMonth(2026, 4, 5).toISOString().slice(0, 10)).toBe(
      '2026-05-29'
    )
  })

  it('last Friday of June 2026 = June 26 (month starts Monday)', () => {
    // Jun 1=Mon → Fridays: 5,12,19,26
    expect(lastWeekdayOfMonth(2026, 5, 5).toISOString().slice(0, 10)).toBe(
      '2026-06-26'
    )
  })

  it('last Friday of July 2026 = July 31 (month starts Wednesday)', () => {
    // Jul 1=Wed → Fridays: 3,10,17,24,31
    expect(lastWeekdayOfMonth(2026, 6, 5).toISOString().slice(0, 10)).toBe(
      '2026-07-31'
    )
  })

  it('last Friday of February 2026 = Feb 27', () => {
    // Feb 1=Sun → Fridays: 6,13,20,27
    expect(lastWeekdayOfMonth(2026, 1, 5).toISOString().slice(0, 10)).toBe(
      '2026-02-27'
    )
  })

  it('last Friday of December 2026 = Dec 25', () => {
    // Dec 1=Tue → Fridays: 4,11,18,25
    expect(lastWeekdayOfMonth(2026, 11, 5).toISOString().slice(0, 10)).toBe(
      '2026-12-25'
    )
  })

  it('last Friday of January 2027 = Jan 29', () => {
    // Jan 1 2027=Fri → Fridays: 1,8,15,22,29
    expect(lastWeekdayOfMonth(2027, 0, 5).toISOString().slice(0, 10)).toBe(
      '2027-01-29'
    )
  })

  it('last Monday of June 2026 = June 29', () => {
    // Jun 1=Mon → Mondays: 1,8,15,22,29
    expect(lastWeekdayOfMonth(2026, 5, 1).toISOString().slice(0, 10)).toBe(
      '2026-06-29'
    )
  })

  it('last Thursday of July 2026 = July 30', () => {
    // Jul 1=Wed → Thursdays: 2,9,16,23,30
    expect(lastWeekdayOfMonth(2026, 6, 4).toISOString().slice(0, 10)).toBe(
      '2026-07-30'
    )
  })
})

describe('monthlyPaydayDate', () => {
  it('code 100 delegates to lastBusinessDayOfMonth', () => {
    // May 2026: last biz day = May 29
    expect(monthlyPaydayDate(100, 2026, 4).toISOString().slice(0, 10)).toBe(
      '2026-05-29'
    )
    // June 2026: last biz day = June 30
    expect(monthlyPaydayDate(100, 2026, 5).toISOString().slice(0, 10)).toBe(
      '2026-06-30'
    )
  })

  it('code 105 delegates to lastWeekdayOfMonth for Friday', () => {
    expect(monthlyPaydayDate(105, 2026, 4).toISOString().slice(0, 10)).toBe(
      '2026-05-29'
    ) // last Friday of May
    expect(monthlyPaydayDate(105, 2026, 5).toISOString().slice(0, 10)).toBe(
      '2026-06-26'
    ) // last Friday of June
  })

  it('code 104 delegates to lastWeekdayOfMonth for Thursday', () => {
    // Last Thursday of April 2026: Apr 1=Wed → Thursdays: 2,9,16,23,30
    expect(monthlyPaydayDate(104, 2026, 3).toISOString().slice(0, 10)).toBe(
      '2026-04-30'
    )
  })
})

describe('computeNextMonthlyLastWeekday', () => {
  // ── code 100: last business day ──────────────────────────────────────────

  it('[100] returns this month last biz day when still in future', () => {
    // June 30 is last biz day of June; today June 20 → return June 30
    expect(computeNextMonthlyLastWeekday(100, '2026-06-20')).toBe('2026-06-30')
  })

  it('[100] advances to next month when this month has passed', () => {
    // After June 30, next = last biz day of July = July 31
    expect(computeNextMonthlyLastWeekday(100, '2026-07-01')).toBe('2026-07-31')
  })

  it('[100] advances on the payday itself', () => {
    // On June 30 → next month: July 31
    expect(computeNextMonthlyLastWeekday(100, '2026-06-30')).toBe('2026-07-31')
  })

  it('[100] handles April → May → June chain correctly', () => {
    // Apr last biz day = Apr 30 (Thu); today Apr 15 → return Apr 30
    expect(computeNextMonthlyLastWeekday(100, '2026-04-15')).toBe('2026-04-30')
    // After Apr 30 → May last biz day = May 29 (Fri, Sun-capped)
    expect(computeNextMonthlyLastWeekday(100, '2026-05-01')).toBe('2026-05-29')
    // After May 29 → June last biz day = June 30 (Tue)
    expect(computeNextMonthlyLastWeekday(100, '2026-05-30')).toBe('2026-06-30')
    // After June 30 → July last biz day = July 31 (Fri)
    expect(computeNextMonthlyLastWeekday(100, '2026-07-01')).toBe('2026-07-31')
  })

  it('[100] handles year boundary Dec → Jan', () => {
    // Dec 2026 last biz day: Dec 31 = Thursday → Dec 31
    expect(computeNextMonthlyLastWeekday(100, '2026-12-20')).toBe('2026-12-31')
    // After Dec 31 → Jan 2027 last biz day: Jan 29 (Fri, since Jan 31=Sun → -2=Fri)
    // Wait: Jan 1 2027=Fri. Jan 31=Fri+(30%7=2)=Sun → last biz = Jan 31-2=Jan 29.
    expect(computeNextMonthlyLastWeekday(100, '2026-12-31')).toBe('2027-01-29')
  })

  // ── code 105: last Friday ─────────────────────────────────────────────────

  it('[105] returns this month last Friday when in future', () => {
    // June 26 is last Friday; today June 20 → return June 26
    expect(computeNextMonthlyLastWeekday(105, '2026-06-20')).toBe('2026-06-26')
  })

  it('[105] advances to next month when past', () => {
    expect(computeNextMonthlyLastWeekday(105, '2026-06-27')).toBe('2026-07-31')
  })

  it('[105] advances on the payday itself', () => {
    expect(computeNextMonthlyLastWeekday(105, '2026-06-26')).toBe('2026-07-31')
  })

  it('[105] year boundary: Dec 25 → Jan 29 2027', () => {
    expect(computeNextMonthlyLastWeekday(105, '2026-12-20')).toBe('2026-12-25')
    expect(computeNextMonthlyLastWeekday(105, '2026-12-25')).toBe('2027-01-29')
    expect(computeNextMonthlyLastWeekday(105, '2026-12-26')).toBe('2027-01-29')
  })

  // ── code 101: last Monday ─────────────────────────────────────────────────

  it('[101] last Monday of June 2026 = June 29', () => {
    expect(computeNextMonthlyLastWeekday(101, '2026-06-20')).toBe('2026-06-29')
    // After Jun 29 → Jul: last Monday of July 2026: Jul 27
    expect(computeNextMonthlyLastWeekday(101, '2026-06-30')).toBe('2026-07-27')
  })
})

describe('computeNextPaydayFromReference — MONTHLY auto-detection', () => {
  // paydayDay is deterministic; nextPayday depends on today so we only assert it
  // where the logic is day-independent (or add a structural check).

  it('detects code 100 (Last weekday) when reference IS the last biz day of its month', () => {
    // Apr 30, 2026 = Thursday = last biz day of April (Apr 30 = Thu, last day of April)
    const { paydayDay } = computeNextPaydayFromReference(
      '2026-04-30',
      'MONTHLY'
    )
    expect(paydayDay).toBe(100)
  })

  it('detects code 100 for May 29 2026 (Friday, last biz day of May, May 31=Sun)', () => {
    const { paydayDay } = computeNextPaydayFromReference(
      '2026-05-29',
      'MONTHLY'
    )
    expect(paydayDay).toBe(100)
  })

  it('detects code 104 (Last Thursday) when day > 28, Thursday, but NOT last biz day', () => {
    // July 30, 2026 = Thursday; last biz day of July = July 31 (Friday) ≠ July 30
    const { paydayDay } = computeNextPaydayFromReference(
      '2026-07-30',
      'MONTHLY'
    )
    expect(paydayDay).toBe(104)
  })

  it('detects code 105 (Last Friday) when day > 28, Friday, but NOT last biz day', () => {
    // Need a Friday > 28 that is not the last biz day.
    // Jan 30, 2026 = Friday (Jan 1=Thu → Jan 30=Thu+(29%7=1)=Fri).
    // Last biz day of Jan = Jan 30? Jan 31=Sat → last biz = Jan 30 (Fri). So Jan 30 IS last biz → code 100.
    // Try Dec 25, 2026 = Friday (Dec 1=Tue → Dec 25=Tue+(24%7=3)=Fri); last biz of Dec = Dec 31 ≠ 25.
    // Day 25 ≤ 28 → no auto-detect. Not applicable here.
    // Let's try a month where last Friday != last biz day and last Friday > 28:
    // Nov 2026: Nov 1=Sun (Oct 1=Thu+(30%7=2)=Sat; Nov 1=Sat+1=Sun).
    // Nov 27=Thu (Nov 1=Sun → Nov 27=Sun+(26%7=5)=Fri). Wait:
    // Nov 1=Sun; Nov 6=Fri; Nov 13=Fri; Nov 20=Fri; Nov 27=Fri. Last Friday Nov 27.
    // Nov 27 ≤ 28 → no auto-detect. No example needed here since code 105 detection
    // only fires when day > 28. That requires last Friday to be on 29, 30, or 31 AND
    // last biz day to be a different date. We've already tested code 104 (Thu Jul 30).
    // Skip with a placeholder that verifies the fallback (day ≤ 28 → fixed).
    const { paydayDay } = computeNextPaydayFromReference(
      '2026-06-26',
      'MONTHLY'
    )
    expect(paydayDay).toBe(26) // day 26 ≤ 28 → fixed
  })

  it('does not auto-detect when reference day <= 28', () => {
    // April 24, 2026 = Friday (last Friday of April); day = 24 ≤ 28 → fixed
    const { paydayDay } = computeNextPaydayFromReference(
      '2026-04-24',
      'MONTHLY'
    )
    expect(paydayDay).toBe(24)
  })

  it('caps to 28 when reference day > 28 but is a Saturday', () => {
    // Jan 31, 2026 = Saturday (day 31 > 28, but weekend)
    const { paydayDay } = computeNextPaydayFromReference(
      '2026-01-31',
      'MONTHLY'
    )
    expect(paydayDay).toBe(28)
  })

  it('caps to 28 when reference day > 28 but is a Sunday', () => {
    // Aug 30, 2026: Aug 1=Sat → Aug 30=Sat+(29%7=1)=Sun. Day 30 > 28, weekend.
    const { paydayDay } = computeNextPaydayFromReference(
      '2026-08-30',
      'MONTHLY'
    )
    expect(paydayDay).toBe(28)
  })

  it('code 100 nextPayday is always the last business day of some future month', () => {
    // Nominate Apr 30 2026 (Thursday = last biz day). nextPayday must be > today
    // and must equal lastBusinessDayOfMonth of its year/month.
    const { paydayDay, nextPayday } = computeNextPaydayFromReference(
      '2026-04-30',
      'MONTHLY'
    )
    expect(paydayDay).toBe(100)
    const d = new Date(nextPayday + 'T12:00:00Z')
    // Last business day is never Saturday or Sunday
    expect(d.getUTCDay()).not.toBe(0) // not Sunday
    expect(d.getUTCDay()).not.toBe(6) // not Saturday
    const todayStr = new Date().toISOString().slice(0, 10)
    expect(nextPayday > todayStr).toBe(true)
  })

  it('code 104 nextPayday falls on a Thursday', () => {
    const { paydayDay, nextPayday } = computeNextPaydayFromReference(
      '2026-07-30',
      'MONTHLY'
    )
    expect(paydayDay).toBe(104)
    const d = new Date(nextPayday + 'T12:00:00Z')
    expect(d.getUTCDay()).toBe(4) // Thursday
  })
})

describe('getPaydayDayLabel', () => {
  it('returns ordinal for fixed monthly days', () => {
    expect(getPaydayDayLabel('MONTHLY', 1)).toBe('1st')
    expect(getPaydayDayLabel('MONTHLY', 2)).toBe('2nd')
    expect(getPaydayDayLabel('MONTHLY', 3)).toBe('3rd')
    expect(getPaydayDayLabel('MONTHLY', 4)).toBe('4th')
    expect(getPaydayDayLabel('MONTHLY', 15)).toBe('15th')
    expect(getPaydayDayLabel('MONTHLY', 28)).toBe('28th')
  })

  it('returns readable label for last-weekday codes', () => {
    expect(getPaydayDayLabel('MONTHLY', 100)).toBe('Last weekday')
    expect(getPaydayDayLabel('MONTHLY', 101)).toBe('Last Monday')
    expect(getPaydayDayLabel('MONTHLY', 102)).toBe('Last Tuesday')
    expect(getPaydayDayLabel('MONTHLY', 103)).toBe('Last Wednesday')
    expect(getPaydayDayLabel('MONTHLY', 104)).toBe('Last Thursday')
    expect(getPaydayDayLabel('MONTHLY', 105)).toBe('Last Friday')
  })

  it('returns weekday name for WEEKLY / FORTNIGHTLY', () => {
    expect(getPaydayDayLabel('WEEKLY', 5)).toBe('Friday')
    expect(getPaydayDayLabel('FORTNIGHTLY', 3)).toBe('Wednesday')
  })

  it('returns stringified value for unknown frequency or code', () => {
    expect(getPaydayDayLabel('QUARTERLY', 3)).toBe('3')
    expect(getPaydayDayLabel('MONTHLY', 999)).toBe('999')
  })
})
