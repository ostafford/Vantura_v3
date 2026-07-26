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
