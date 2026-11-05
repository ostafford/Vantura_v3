import { test, expect } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

test.describe('Weekly Insights is cut (#206)', () => {
  test('the tour has no Weekly insights step', async ({ page }) => {
    await startWithSampleData(page)
    const popover = page.locator('.driver-popover')
    await expect(popover).toBeVisible()
    // Intro, Balance cards, three sections, Navigation, Lock
    await expect(popover).toContainText('1 of 7')

    const titles: string[] = []
    for (let step = 1; step <= 7; step++) {
      await expect(popover).toContainText(`${step} of 7`)
      titles.push(
        (await page.locator('.driver-popover-title').textContent()) ?? ''
      )
      await page.locator('.driver-popover-next-btn').click()
    }
    expect(titles).not.toContain('Weekly insights')
    expect(titles).toContain('Month at a glance')
  })

  test('the Dashboard has no Weekly insights section', async ({ page }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    await expect(page.locator('[data-tour="month-summary"]')).toBeVisible()
    await expect(page.locator('[data-tour="insights"]')).toHaveCount(0)
    await expect(page.getByText('Weekly insights')).toHaveCount(0)
  })
})
