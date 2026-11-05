import { test, expect, type Page } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

/**
 * In-app navigation: a full reload re-locks the demo session (see helpers),
 * so old URLs are reached the way a stale bookmark-in-tab or pin would be,
 * through the router.
 */
async function goInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

test.describe('Reports and the Analytics landing card are cut (#205)', () => {
  test('old Reports URLs land on the working Page not found screen', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    for (const path of [
      '/analytics/reports',
      '/analytics/insights',
      '/analytics/monthly-review',
    ]) {
      await goInApp(page, path)
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(
        page.getByRole('heading', { name: 'Page not found' })
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Go to Dashboard', exact: true })
      ).toBeVisible()
    }
  })

  test('the Analytics hub has no Reports tile and no at-a-glance card', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)
    await page.getByRole('link', { name: 'Analytics', exact: true }).click()
    await expect(
      page.getByRole('link', { name: /View trackers/ })
    ).toBeVisible()

    await expect(page.locator('a[href$="/analytics/reports"]')).toHaveCount(0)
    await expect(
      page.getByRole('group', { name: 'Period for at a glance' })
    ).toHaveCount(0)
    await expect(page.getByLabel('Period for at a glance')).toHaveCount(0)
  })
})
