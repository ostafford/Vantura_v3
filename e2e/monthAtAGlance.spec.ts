import { test, expect } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

test.describe('Month at a glance', () => {
  test('the chart calls money that arrived "Money in", not "Income" (#200)', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    const toggle = page.getByRole('group', {
      name: 'Select metric for month comparison chart',
    })
    await toggle.getByRole('button', { name: 'Money in', exact: true }).click()

    await expect(page.getByText(/^Money in \S+ vs \S+$/)).toBeVisible()
    await expect(toggle.getByRole('button', { name: 'Income' })).toHaveCount(0)
  })
})
