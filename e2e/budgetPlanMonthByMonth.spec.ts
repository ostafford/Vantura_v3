import { test, expect, type Page } from '@playwright/test'
import {
  closeDashboardTour,
  goToBudgetPlan,
  startWithSampleData,
} from './helpers'

// #282 (slice 3): the Month by month card. On 20 January 2027 sample data's
// finished months run July–December 2026: July is the opening month (a Part
// month), August has no Confirmed pay, September is Overspent, October and
// November are Saved (all Months without a plan), and December is the First
// plannable month, judged against its Month-end plan. January 2027 is the
// current month, so it's never on the card.

const card = (page: Page) => page.getByTestId('month-by-month')
const chart = (page: Page) => card(page).getByTestId('month-by-month-chart')
const column = (page: Page, name: RegExp) =>
  chart(page).getByRole('button', { name })
const selection = (page: Page) =>
  card(page).getByTestId('month-by-month-selection')

async function openOn20January(page: Page) {
  await page.clock.install({ time: new Date(2027, 0, 20, 10, 0, 0) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
  await goToBudgetPlan(page)
}

test.describe('the Month by month card (#282)', () => {
  test('shows every finished month as a column, oldest to newest, leaving out this month', async ({
    page,
  }) => {
    await openOn20January(page)

    await expect(
      card(page).getByRole('heading', { name: 'Month by month' })
    ).toBeVisible()
    await expect(card(page)).toContainText(
      'What each finished month saved or overspent.'
    )
    const names = await chart(page)
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
    expect(names).toHaveLength(6)
    expect(names[0]).toBe('July 2026: Part month')
    expect(names[1]).toBe('August 2026: Pay not confirmed')
    expect(names[2]).toMatch(/^September 2026: Overspent \$[\d,]+\.\d\d$/)
    expect(names[3]).toMatch(/^October 2026: Saved \$[\d,]+\.\d\d$/)
    expect(names[4]).toMatch(/^November 2026: Saved \$[\d,]+\.\d\d$/)
    expect(names[5]).toMatch(/^December 2026: (Saved|Overspent) \$/)
    await expect(chart(page)).not.toContainText('Jan')

    // Saved rises in green, Overspent hangs in red; no figure, no column.
    await expect(column(page, /^October 2026/)).toHaveAttribute(
      'data-tone',
      'saved'
    )
    await expect(column(page, /^September 2026/)).toHaveAttribute(
      'data-tone',
      'over'
    )
    await expect(column(page, /^August 2026/)).toHaveAttribute(
      'data-tone',
      'none'
    )
  })

  test('is on every month the Budget Plan shows, past months and Months without a plan included', async ({
    page,
  }) => {
    await openOn20January(page)
    await expect(card(page)).toBeVisible()
    await column(page, /^October 2026/).click()
    await column(page, /^October 2026/).click()
    await expect(page.getByTestId('plan-month')).toHaveText('October 2026')
    await expect(card(page)).toBeVisible()
  })

  test('opens scrolled to the newest month at phone width', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(2027, 0, 20, 10, 0, 0) })
    await startWithSampleData(page)
    await closeDashboardTour(page)
    // The Budget Plan mounts at phone width (the sidebar link is hidden there).
    await page.setViewportSize({ width: 320, height: 720 })
    await page.evaluate(() => {
      window.history.pushState({}, '', '/analytics/budget')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(card(page)).toBeVisible()

    const scroll = await chart(page).evaluate((el) => ({
      left: el.scrollLeft,
      width: el.scrollWidth,
      client: el.clientWidth,
    }))
    // Six months are wider than a 320px phone, so the chart scrolls…
    expect(scroll.width).toBeGreaterThan(scroll.client)
    // …and it opens at the newest end.
    expect(scroll.left).toBeGreaterThanOrEqual(scroll.width - scroll.client - 1)
    // Bring the card up the page (it's the last card); this never scrolls
    // the chart itself sideways.
    await chart(page).scrollIntoViewIfNeeded()
    await expect(column(page, /^December 2026/)).toBeInViewport()
    await expect(column(page, /^July 2026/)).not.toBeInViewport({ ratio: 1 })

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('the first tap selects a month and the second opens it', async ({
    page,
  }) => {
    await openOn20January(page)
    await expect(selection(page)).toHaveText('Tap a month to see it')

    const october = column(page, /^October 2026/)
    await october.click()
    await expect(october).toHaveAttribute('aria-pressed', 'true')
    await expect(selection(page)).toHaveText(
      /^October 2026 · Saved \$[\d,]+\.\d\d · Open$/
    )
    // Still on January: a stray tap never jumps off the page.
    await expect(page.getByTestId('plan-month')).toHaveText('January 2027')

    await october.click()
    await expect(page).toHaveURL(/\?month=2026-10$/)
    await expect(page.getByTestId('plan-month')).toHaveText('October 2026')
  })

  test('"Open" on the selection line opens the month; a month with no figure gives its reason', async ({
    page,
  }) => {
    await openOn20January(page)
    await column(page, /^August 2026/).click()
    await expect(selection(page)).toHaveText(
      'August 2026 · Pay not confirmed · Open'
    )
    await selection(page).getByRole('link', { name: 'Open' }).click()
    await expect(page).toHaveURL(/\?month=2026-08$/)
    await expect(page.getByTestId('plan-pay-prompt')).toBeVisible()
  })

  test('the year rows total the counted months and fold open to them, newest first', async ({
    page,
  }) => {
    await openOn20January(page)
    const years = card(page).getByTestId('month-by-month-year')
    // 2027 has no finished month yet, so 2026 is the only year.
    await expect(years).toHaveCount(1)

    const year = years.first()
    const toggle = year.getByRole('button', { name: /^2026/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(year).toContainText('across 4 of 6 months · 2 not counted')
    await expect(year).toContainText(/Average (Saved|Overspent) \$[\d,]+\.\d\d/)
    await expect(year.getByTestId('month-by-month-row')).toHaveCount(0)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const rows = year.getByTestId('month-by-month-row')
    await expect(rows).toHaveText([
      /^December 2026(Saved|Overspent) \$/,
      /^November 2026No planSaved \$/,
      /^October 2026No planSaved \$/,
      /^September 2026No planOverspent \$/,
      /^August 2026No planPay not confirmed$/,
      /^July 2026No planPart month$/,
    ])

    await rows.filter({ hasText: 'September 2026' }).click()
    await expect(page).toHaveURL(/\?month=2026-09$/)
    await expect(page.getByTestId('plan-headline-label')).toHaveText(
      'Overspent'
    )
  })
})
