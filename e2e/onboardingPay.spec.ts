import { test, expect } from '@playwright/test'

/**
 * #203 — the onboarding pay step labels the Pay amount as take-home. The step
 * sits behind token validation, so Up's ping is stubbed and every other Up
 * request is aborted: nothing leaves the machine. Synthetic values only.
 */
test.describe('onboarding pay step', () => {
  test('labels the Pay amount as take-home pay', async ({ page }) => {
    await page.route('https://api.up.com.au/**', (route) =>
      route.request().url().endsWith('/api/v1/util/ping')
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              meta: { id: 'synthetic', statusEmoji: '⚡️' },
            }),
          })
        : route.abort()
    )

    await page.goto('/')
    await page.getByRole('button', { name: 'Get Started' }).click()

    const passphrase = 'synthetic-e2e-passphrase'
    await page.locator('#onboarding-passphrase').fill(passphrase)
    await page.locator('#onboarding-passphrase-confirm').fill(passphrase)
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.locator('#onboarding-api-token').fill('up:yeah:synthetic-e2e')
    await page.getByRole('button', { name: 'Continue' }).click()

    const payAmount = page.getByRole('textbox', {
      name: 'Take-home pay amount ($)',
      exact: true,
    })
    await expect(payAmount).toBeVisible()
    await expect(payAmount).toHaveAttribute('placeholder', 'Optional')
    await expect(
      page.getByText('What lands in your account each pay, after tax.', {
        exact: true,
      })
    ).toBeVisible()

    // #195 — the step is Pay amount and Pay frequency only: no payday date.
    await expect(
      page.getByRole('combobox', { name: 'Pay frequency', exact: true })
    ).toBeVisible()
    await expect(page.locator('input[type="date"]')).toHaveCount(0)
    await expect(page.getByText('Next payday')).toHaveCount(0)
    await expect(page.getByLabel('Day', { exact: true })).toHaveCount(0)
  })
})
