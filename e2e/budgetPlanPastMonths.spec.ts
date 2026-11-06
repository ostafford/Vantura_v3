import { test, expect, type Page } from '@playwright/test'
import {
  closeDashboardTour,
  goToBudgetPlan,
  startWithSampleData,
} from './helpers'

// #243: finished months on the Budget Plan, judged against their Month-end
// plan (#242). Sample data seeds a plan for last month and sets it as the
// first plannable month.

const summary = (page: Page) => page.getByTestId('plan-summary')
const prev = (page: Page) => page.getByTestId('plan-month-prev')
const next = (page: Page) => page.getByTestId('plan-month-next')

async function openOn20January(page: Page) {
  await page.clock.install({ time: new Date(2027, 0, 20, 10, 0, 0) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
  await goToBudgetPlan(page)
}

test.describe('Budget Plan past months (#243)', () => {
  test('opens on the current month; ‹ / › stop at the first plannable month and the current month', async ({
    page,
  }) => {
    await openOn20January(page)

    await expect(page.getByTestId('plan-month')).toHaveText('January 2027')
    await expect(next(page)).toBeDisabled()
    await expect(prev(page)).toBeEnabled()

    await prev(page).click()
    await expect(page).toHaveURL(/\/analytics\/budget\?month=2026-12$/)
    await expect(page.getByTestId('plan-month')).toHaveText('December 2026')
    // December is the first plannable month (sample data).
    await expect(prev(page)).toBeDisabled()
    await expect(next(page)).toBeEnabled()

    await next(page).click()
    await expect(page).toHaveURL(/\/analytics\/budget$/)
    await expect(page.getByTestId('plan-month')).toHaveText('January 2027')
  })

  test('a finished month shows its finished state', async ({ page }) => {
    await openOn20January(page)
    await prev(page).click()

    await expect(page.getByTestId('plan-progress')).toHaveText('Month finished')
    await expect(page.getByTestId('plan-headline-label')).toHaveText(
      /^(Saved|Overspent)$/
    )
    for (const label of ['Spent on plan', 'Spent unplanned'])
      await expect(summary(page)).toContainText(label)
    for (const label of [
      'Free spending so far',
      'Still to go out',
      'If the rest goes to plan',
    ])
      await expect(summary(page)).not.toContainText(label)
    const figures = page.getByTestId('plan-figures')
    await expect(figures).toContainText('Actual')
    await expect(figures).not.toContainText('Actual so far')

    // No pace ticks, no "left", and no live-plan editing.
    await expect(page.locator('.plan-bar__pace')).toHaveCount(0)
    await expect(page.getByTestId('plan-not-in-a-bucket')).not.toContainText(
      / left$/m
    )
    await expect(page.getByRole('button', { name: 'Add bucket' })).toHaveCount(
      0
    )
    await expect(
      page.getByRole('button', { name: 'Create your first bucket' })
    ).toHaveCount(0)
  })

  test('a finished month has no horizontal scroll at phone width', async ({
    page,
  }) => {
    await openOn20January(page)
    await prev(page).click()
    await expect(page.getByTestId('plan-progress')).toHaveText('Month finished')
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.getByTestId('plan-month')).toBeVisible()
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('shows the current month for a ?month= it can’t judge', async ({
    page,
  }) => {
    await openOn20January(page)
    for (const month of ['2026-11', '2027-02', 'nope']) {
      await page.evaluate((to) => {
        window.history.pushState({}, '', to)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, `/analytics/budget?month=${month}`)
      await expect(page.getByTestId('plan-month')).toHaveText('January 2027')
    }
  })
})

// Starts a minute before the month ends, so the run stays inside the
// inactivity lock: December is frozen by the day-change watcher at midnight,
// with the bucket made just before it.
test('the bucket page follows the month, and Mark paid on a finished month writes to its plan', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(2026, 11, 31, 23, 59, 0) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
  await goToBudgetPlan(page)

  await page.getByRole('button', { name: 'Create your first bucket' }).click()
  await page.getByPlaceholder('e.g. Household').fill('Bills')
  await page.getByRole('button', { name: 'Create bucket' }).click()
  await page.getByRole('link', { name: 'Bills', exact: true }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('dialog').getByText('Phone', { exact: true }).click()
  await expect(page.getByTestId('plan-bucket')).toContainText('Phone')

  await page.clock.runFor(70_000)
  await expect(page.getByTestId('plan-month')).toHaveText('January 2027')

  // ‹ on the bucket page: December, as frozen.
  await prev(page).click()
  await expect(page).toHaveURL(/\/analytics\/budget\/\d+\?month=2026-12$/)
  await expect(page.getByTestId('plan-month')).toHaveText('December 2026')
  await expect(page.getByTestId('plan-progress')).toHaveText('Month finished')
  await expect(page.getByTestId('bucket-finished-note')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add tracker' })).toHaveCount(0)

  // Phone has no payment link, so nothing was found for it in December.
  const phone = page.getByTestId('plan-item').filter({ hasText: 'Phone' })
  await expect(phone).toContainText('No payment found')
  await phone.getByRole('button', { name: /Mark Phone paid for/ }).click()
  await expect(phone).not.toContainText('No payment found')
  const toast = page.locator('.vantura-toast')
  await expect(toast).toContainText('Phone marked paid')
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(phone).toContainText('No payment found')

  // The breadcrumb carries the month back to the Budget Plan.
  await page.getByRole('link', { name: 'Budget Plan', exact: true }).click()
  await expect(page).toHaveURL(/\/analytics\/budget\?month=2026-12$/)
  await expect(page.getByTestId('plan-bucket')).toContainText('Phone')

  // November (sample data's frozen month) had no buckets, so the bucket page
  // says so there.
  await page.getByRole('link', { name: 'Bills', exact: true }).click()
  await prev(page).click()
  await expect(page.getByTestId('bucket-not-in-month')).toContainText(
    'wasn’t in November 2026’s plan'
  )
})
