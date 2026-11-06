import { test, expect } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

test.describe('Spendable is cut (#211)', () => {
  test('the Dashboard has no Spendable, Available or Forecast card, and no alert', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    await expect(page.getByRole('region', { name: 'Headroom' })).toBeVisible()
    await expect(page.getByLabel(/Spendable balance/i)).toHaveCount(0)
    for (const label of ['Spendable', 'Available', 'Forecast']) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0)
    }
    await expect(page.getByText(/reserved for Regulars/)).toHaveCount(0)
    await expect(page.getByText('Spendable alert threshold')).toHaveCount(0)
  })

  test('the tour opens on Headroom, not the balance cards', async ({
    page,
  }) => {
    await startWithSampleData(page)
    const popover = page.locator('.driver-popover')
    await expect(popover).toContainText('1 of 7')
    await page.locator('.driver-popover-next-btn').click()
    await expect(popover).toContainText('2 of 7')
    await expect(page.locator('.driver-popover-title')).toHaveText('Headroom')
  })

  test('the Regular form has no Include in Spendable toggle', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    // Editing opens the full form (adding starts on a payment search).
    await page
      .locator('#dashboard-section-upcoming')
      .getByRole('button', { name: /Netflix/ })
      .first()
      .click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Edit Regular')).toBeVisible()
    await expect(dialog.getByLabel('Next charge date')).toBeVisible()
    await expect(dialog.getByText(/Include in Spendable/)).toHaveCount(0)
  })

  test('Settings has no Essentials section', async ({ page }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Security', exact: true }).first()
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Essentials', exact: true })
    ).toHaveCount(0)
  })
})
