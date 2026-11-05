import { test, expect } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

const LAST_SEEN_KEY = 'vantura_last_seen_version'

test.describe('Notifications are cut (#208)', () => {
  test('What’s New still opens after an update, and closing it records the version', async ({
    page,
  }) => {
    // An update: the browser last saw an older build.
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, '0.0.1')
        sessionStorage.setItem('seeded', '1')
      }
    }, LAST_SEEN_KEY)
    await startWithSampleData(page)

    const modal = page
      .getByRole('dialog')
      .filter({ hasText: /What.s new in v/ })
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: 'Got it' }).click()
    await expect(modal).toHaveCount(0)

    const lastSeen = await page.evaluate(
      (key) => localStorage.getItem(key),
      LAST_SEEN_KEY
    )
    expect(lastSeen).not.toBe('0.0.1')
    expect(lastSeen).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test('there is no notification bell and no Notifications settings section', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    await expect(
      page.getByRole('button', { name: /^Notifications/ })
    ).toHaveCount(0)
    await expect(page.locator('.notif-bell')).toHaveCount(0)

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Security', exact: true }).first()
    ).toBeVisible()
    await expect(page.getByText('Notifications', { exact: true })).toHaveCount(
      0
    )
  })
})
