import { test, expect, type Page } from '@playwright/test'
import {
  closeDashboardTour,
  goToBudgetPlan,
  startWithSampleData,
} from './helpers'

// #282: a Month without a plan on the Budget Plan. Sample data's Spending
// account opened 180 days before today, so on 20 January 2027 the Months
// without a plan run July–November 2026 (the First plannable month is
// December): July is the opening month (a Part month), August has no
// Confirmed pay, September is Overspent and October–November are Saved.

const summary = (page: Page) => page.getByTestId('plan-summary')
const byCategory = (page: Page) => page.getByTestId('plan-spending-by-category')

async function openOn20January(page: Page) {
  await page.clock.install({ time: new Date(2027, 0, 20, 10, 0, 0) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
  await goToBudgetPlan(page)
}

async function showMonth(page: Page, month: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, `/analytics/budget?month=${month}`)
}

/** `$1,234.56` as cents. */
function cents(text: string | null): number {
  const digits = (text ?? '').replace(/[^0-9.]/g, '')
  return Math.round(Number(digits) * 100)
}

test.describe('a Month without a plan (#282)', () => {
  test('shows Saved, Income · Actual, the note and Spending by category, with nothing from a plan', async ({
    page,
  }) => {
    await openOn20January(page)
    await showMonth(page, '2026-10')

    await expect(page.getByTestId('plan-month')).toHaveText('October 2026')
    await expect(page.getByTestId('plan-headline-label')).toHaveText('Saved')
    await expect(page.getByTestId('income-bar')).toBeVisible()
    await expect(page.getByTestId('plan-no-plan-note')).toHaveText(
      'No plan for this month · Saved uses the pay you confirmed'
    )

    const figures = page.getByTestId('plan-figures')
    await expect(figures).toContainText('Income')
    await expect(figures).toContainText('Actual')
    for (const label of ['Committed', 'Unallocated'])
      await expect(figures).not.toContainText(label)

    await expect(
      byCategory(page).getByRole('heading', { name: 'Spending by category' })
    ).toBeVisible()
    // Spending by category adds up to Actual spending.
    expect(
      cents(
        await page.getByTestId('plan-spending-by-category-total').textContent()
      )
    ).toBe(cents(await page.getByTestId('plan-actual').textContent()))

    await expect(page.getByTestId('plan-bucket')).toHaveCount(0)
    await expect(page.getByTestId('plan-not-in-a-bucket')).toHaveCount(0)
    await expect(page.getByTestId('plan-unplanned')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add bucket' })).toHaveCount(
      0
    )
    await expect(page.getByText('Create a bucket')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(/unplanned/i)
    await expect(summary(page)).not.toContainText('Spent on plan')
  })

  test('an Overspent month reads Overspent in the over colour, with a full bar', async ({
    page,
  }) => {
    await openOn20January(page)
    await showMonth(page, '2026-09')

    await expect(page.getByTestId('plan-headline-label')).toHaveText(
      'Overspent'
    )
    await expect(page.getByTestId('plan-headline')).toHaveClass(/plan-over/)
    await expect(page.getByTestId('income-bar')).toBeVisible()
  })

  test('the opening month shows its spending but no Saved: a Part month', async ({
    page,
  }) => {
    await openOn20January(page)
    await showMonth(page, '2026-07')

    await expect(page.getByTestId('plan-no-saved')).toHaveText(
      /^Your account opened on .+ · Saved isn’t worked out for a part month$/
    )
    await expect(page.getByTestId('plan-headline')).toHaveCount(0)
    await expect(page.getByTestId('income-bar')).toHaveCount(0)
    await expect(byCategory(page)).toBeVisible()
  })

  test('a month without a Confirmed pay asks for it in place of Saved', async ({
    page,
  }) => {
    await openOn20January(page)
    await showMonth(page, '2026-08')

    await expect(page.getByTestId('plan-pay-prompt')).toContainText(
      'Confirm your pay for months before December 2026 to see Saved'
    )
    await expect(page.getByTestId('plan-headline')).toHaveCount(0)
    await expect(page.getByTestId('income-bar')).toHaveCount(0)
    await expect(byCategory(page)).toBeVisible()
  })

  test('has no horizontal scroll at phone width', async ({ page }) => {
    await openOn20January(page)
    await page.setViewportSize({ width: 375, height: 812 })
    for (const month of ['2026-07', '2026-08', '2026-09', '2026-10']) {
      await showMonth(page, month)
      await expect(byCategory(page)).toBeVisible()
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      )
      expect(overflow).toBeLessThanOrEqual(0)
    }
  })
})
