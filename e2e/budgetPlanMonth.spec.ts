import { test, expect, type Page } from '@playwright/test'
import {
  closeDashboardTour,
  goToBudgetPlan,
  startWithSampleData,
} from './helpers'

// #241: the Budget Plan is plan vs actual for the current month; the
// Weekly / Monthly / Yearly toggle and the footer card are cut.
async function open(page: Page) {
  await page.clock.install({ time: new Date(2027, 0, 20, 10, 0, 0) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
  await goToBudgetPlan(page)
}

const summary = (page: Page) => page.getByTestId('plan-summary')

/** Navigates in-app (a reload re-locks the demo session). */
async function pushUrl(page: Page, url: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, url)
}

test.describe('Budget Plan month view (#241)', () => {
  test('shows the month, headline, Income bar and figures line, with no toggle or footer', async ({
    page,
  }) => {
    await open(page)

    await expect(summary(page)).toContainText('January 2027')
    await expect(summary(page)).toContainText('Day 20 of 31')
    await expect(summary(page)).toContainText('Free spending so far')
    await expect(page.getByTestId('income-bar')).toBeVisible()
    for (const label of [
      'Spent on plan',
      'Spent unplanned',
      'Still to go out',
      'If the rest goes to plan',
    ]) {
      await expect(summary(page)).toContainText(label)
    }
    const figures = page.getByTestId('plan-figures')
    for (const label of ['Income', 'Committed', 'Unallocated', 'Actual so far'])
      await expect(figures).toContainText(label)

    // The period toggle and footer card are gone.
    await expect(
      page.getByRole('group', { name: 'Select display period' })
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Yearly' })).toHaveCount(0)
    await expect(page.getByText(/^Income \(/)).toHaveCount(0)

    // The bar's segments never pass Income.
    const total = await page
      .locator('[data-segment]')
      .evaluateAll((els) =>
        els.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0)
      )
    const barWidth = await page
      .getByTestId('income-bar')
      .evaluate((el) => el.getBoundingClientRect().width)
    expect(total).toBeLessThanOrEqual(barWidth + 0.5)
  })

  test('ignores ?period= and opens the month view', async ({ page }) => {
    await open(page)
    await pushUrl(page, '/analytics/budget?period=YEARLY')

    await expect(summary(page)).toContainText('January 2027')
    await expect(page.getByRole('button', { name: 'Yearly' })).toHaveCount(0)
  })

  test('lists items Not in a bucket and in a bucket, with Tracker pace ticks and Regular chips', async ({
    page,
  }) => {
    await open(page)

    // Sample data seeds no buckets: everything is Not in a bucket.
    const notInABucket = page.getByTestId('plan-not-in-a-bucket')
    await expect(notInABucket).toContainText('Not in a bucket')
    await expect(notInABucket).toContainText('Groceries')
    await expect(notInABucket.locator('.plan-bar__pace').first()).toBeVisible()
    await expect(notInABucket).toContainText('overdue')

    await page.getByRole('button', { name: 'Create your first bucket' }).click()
    await page.getByPlaceholder('e.g. Household').fill('Food')
    await page.getByRole('button', { name: 'Create bucket' }).click()
    await page.getByRole('link', { name: 'Food', exact: true }).click()
    await page.getByRole('button', { name: 'Add tracker' }).click()
    await page.getByRole('dialog').getByText('Groceries').click()

    const bucket = page.getByTestId('plan-bucket')
    await expect(bucket).toContainText('Groceries')
    await expect(bucket).toContainText(/left|over/)
    await expect(
      page.getByRole('group', { name: 'Select display period' })
    ).toHaveCount(0)

    await page.getByRole('link', { name: 'Budget Plan', exact: true }).click()
    await expect(page.getByTestId('plan-bucket')).toContainText('Groceries')
    await expect(notInABucket).not.toContainText('Groceries')
  })

  test('tapping Spent unplanned reaches the Unplanned card', async ({
    page,
  }) => {
    await open(page)
    await page.getByRole('button', { name: /Spent unplanned/ }).click()

    const unplanned = page.getByTestId('plan-unplanned')
    await expect(unplanned).toBeFocused()
    await expect(unplanned).toBeInViewport()
  })

  test('shows "Set your pay" when no pay amount is set', async ({ page }) => {
    await open(page)
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Pay', exact: true }).click()
    await page
      .getByRole('spinbutton', {
        name: 'Take-home pay amount ($)',
        exact: true,
      })
      .fill('')
    await page.getByRole('button', { name: 'Save pay settings' }).click()
    await goToBudgetPlan(page)

    await expect(page.getByTestId('plan-set-pay')).toBeVisible()
    await expect(page.getByTestId('income-bar')).toHaveCount(0)
    await expect(page.getByTestId('plan-headline')).toHaveCount(0)
    const figures = page.getByTestId('plan-figures')
    await expect(figures).toContainText('Committed')
    await expect(figures).toContainText('Actual so far')
    await expect(
      figures.getByRole('link', { name: 'Set your pay' })
    ).toHaveCount(2)
  })

  test('has no horizontal scroll at phone width', async ({ page }) => {
    // The sidebar's Analytics link isn't reachable at phone width, so open the
    // page first and then narrow the viewport.
    await open(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(summary(page)).toBeVisible()
    await expect(page.getByTestId('plan-unplanned')).toBeVisible()

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
