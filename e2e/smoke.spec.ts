import { test, expect } from '@playwright/test'
import { startWithSampleData, goToTrackers, goToBudgetPlan } from './helpers'

test.describe('onboarding', () => {
  test('shows the welcome screen with a way in that needs no Up Bank credentials', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Welcome to Vantura' })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Try with sample data' })
    ).toBeVisible()
  })
})

test.describe('golden path: sample data → dashboard', () => {
  test('loading sample data lands on the dashboard with a spendable balance', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await expect(page.getByText('Spendable', { exact: true })).toBeVisible()
  })
})

test.describe('trackers', () => {
  test('tracker list shows seeded trackers with budget progress', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await goToTrackers(page)
    await expect(page.getByRole('heading', { name: 'Trackers' })).toBeVisible()
    await expect(page.getByText('Groceries')).toBeVisible()
  })

  test('opening a tracker shows its detail page', async ({ page }) => {
    await startWithSampleData(page)
    await goToTrackers(page)
    await page.getByText('Groceries').click()
    await expect(page).toHaveURL(/\/analytics\/trackers\/\d+/)
    await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible()
  })
})

test.describe('budget plan', () => {
  test('budget plan page loads and can create a new bucket', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await goToBudgetPlan(page)
    await expect(
      page.getByRole('heading', { name: 'Budget Plan', exact: true })
    ).toBeVisible()

    // Sample data seeds no buckets, so the empty-state CTA is shown first.
    await page.getByRole('button', { name: 'Create your first bucket' }).click()
    await page.getByPlaceholder('e.g. Household').fill('Household bills')
    await page.getByRole('button', { name: 'Create bucket' }).click()

    await expect(page.getByText('Household bills')).toBeVisible()
  })
})
