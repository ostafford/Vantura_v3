import { type Page, expect } from '@playwright/test'

/**
 * Completes onboarding via the no-auth "Try with sample data" path and waits
 * for the dashboard to load. Session unlock state is in-memory only, so all
 * further navigation in a test must use in-app links, never page.goto() —
 * a full reload re-locks the demo session.
 */
export async function startWithSampleData(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try with sample data' }).click()
  await expect(page.getByLabel(/Spendable balance/i)).toBeVisible({
    timeout: 15_000,
  })
}

/**
 * Waits for the first-run dashboard tour (which always opens ~400ms after the
 * dashboard mounts on a fresh DB) and closes it, so its overlay can't
 * intercept later clicks. driver.js only records a close (onDestroyed, which
 * marks the tour completed) once its 400ms step-entry transition has
 * finished; closing earlier isn't recorded and the tour reopens on the next
 * dashboard visit. Nothing in the DOM marks the end of that transition, so
 * wait it out.
 */
export async function closeDashboardTour(page: Page): Promise<void> {
  await expect(page.locator('.driver-popover')).toBeVisible()
  await page.waitForTimeout(500)
  await page.locator('.driver-popover-close-btn').click()
  await expect(page.locator('.driver-overlay')).toHaveCount(0)
}

/**
 * Switches to the light theme through Settings → Appearance, then returns to
 * the dashboard. A fresh DB defaults to dark, and the theme is read from the
 * DB, so this has to go through the UI rather than localStorage.
 */
export async function switchToLightTheme(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'light')
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByLabel(/Spendable balance/i)).toBeVisible()
}

export async function goToTrackers(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await page.getByRole('link', { name: /View trackers/ }).click()
  await expect(page).toHaveURL(/\/analytics\/trackers$/)
}

export async function goToBudgetPlan(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Analytics', exact: true }).click()
  await page.getByRole('link', { name: /View budget plan/ }).click()
  await expect(page).toHaveURL(/\/analytics\/budget$/)
}
