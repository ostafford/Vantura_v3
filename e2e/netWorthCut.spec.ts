import { test, expect, type Page } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

/**
 * In-app navigation: a full reload re-locks the demo session (see helpers),
 * so the old URL is reached the way a stale bookmark-in-tab would be,
 * through the router.
 */
async function goInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

test.describe('Net Worth is cut (#209)', () => {
  test('the old Net Worth URL, and its ?repay= deep link, land on Page not found', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    for (const path of [
      '/analytics/net-worth',
      '/analytics/net-worth?repay=1',
    ]) {
      await goInApp(page, path)
      await expect(
        page.getByRole('heading', { name: 'Page not found' })
      ).toBeVisible()
    }
  })

  test('the Analytics hub has no Net Worth tile', async ({ page }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)
    await page.getByRole('link', { name: 'Analytics', exact: true }).click()
    await expect(
      page.getByRole('link', { name: /View trackers/ })
    ).toBeVisible()

    await expect(page.locator('a[href$="/analytics/net-worth"]')).toHaveCount(0)
    await expect(page.getByText('Net Worth', { exact: true })).toHaveCount(0)
  })

  test('the Regular editor has no charge type or liability account picker', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    await page.getByRole('button', { name: 'Add Regular' }).click()
    await page.getByRole('button', { name: 'Add manually instead' }).click()
    await page.getByRole('button', { name: 'More options' }).click()
    await expect(
      page.getByRole('button', { name: 'Fewer options' })
    ).toBeVisible()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Charge type')).toHaveCount(0)
    await expect(dialog.getByText(/Liability repayment/)).toHaveCount(0)
    await expect(dialog.getByText('Link to account')).toHaveCount(0)
    await expect(dialog.getByText(/net worth/i)).toHaveCount(0)
  })
})
