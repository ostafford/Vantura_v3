import { test, expect } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

test.describe('the payday date is cut (#195)', () => {
  test('Settings → Pay has the amount and Pay frequency only', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Payday', exact: true })
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Pay', exact: true }).click()

    const amount = page.getByRole('spinbutton', {
      name: 'Take-home pay amount ($)',
      exact: true,
    })
    const frequency = page.getByRole('combobox', {
      name: 'Pay frequency',
      exact: true,
    })
    // The sample data's pay: $4,500 monthly.
    await expect(amount).toHaveValue('4500.00')
    await expect(frequency).toHaveValue('MONTHLY')
    await expect(page.locator('input[type="date"]')).toHaveCount(0)
    await expect(page.getByText('Next payday')).toHaveCount(0)

    await frequency.selectOption('FORTNIGHTLY')
    await page.getByRole('button', { name: 'Save pay settings' }).click()
    await expect(
      page.getByRole('status').getByText('Pay settings updated.')
    ).toBeVisible()
  })
})
