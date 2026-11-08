import { expect, test } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

// Amount fields follow one rule (src/lib/amountInput.ts): plain digits with an
// optional single `.`; anything else is refused, never guessed.
test.describe('Amount fields', () => {
  test.beforeEach(async ({ page }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)
    await page.getByRole('link', { name: 'Transactions', exact: true }).click()
  })

  test('the Transactions Max filter applies exact cents', async ({ page }) => {
    const max = page.locator('#transactions-filter-amount-max')
    await expect(max).toHaveAttribute('inputmode', 'decimal')
    await max.fill('0.29')
    // 0.29 * 100 is 28.999999999999996 in floating point; the filter must be 29.
    await expect(page).toHaveURL(/[?&]amountMax=29(&|$)/)
  })

  test('a half-typed amount keeps its decimal point', async ({ page }) => {
    const max = page.locator('#transactions-filter-amount-max')
    await max.pressSequentially('12.')
    await expect(max).toHaveValue('12.')
    await expect(page).toHaveURL(/[?&]amountMax=1200(&|$)/)
    await max.pressSequentially('5')
    await expect(max).toHaveValue('12.5')
    await expect(page).toHaveURL(/[?&]amountMax=1250(&|$)/)
  })

  test('an ambiguous amount is refused, not applied', async ({ page }) => {
    const min = page.locator('#transactions-filter-amount-min')
    await min.fill('1,2')
    await expect(min).toHaveValue('1,2')
    await expect(min).toHaveClass(/is-invalid/)
    await expect(page).not.toHaveURL(/amountMin=/)
    await min.fill('')
    await expect(min).not.toHaveClass(/is-invalid/)
  })
})
