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

  test('shows only Money in, Money out and the chart: no narratives or deltas (#207)', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)

    const card = page.locator('[data-tour="month-summary"]')
    const figureLabels = card.locator('span.small.text-muted')
    await expect(figureLabels).toHaveText(['Money in', 'Money out'])
    await expect(card.locator('svg').first()).toBeVisible()

    await expect(card.getByText('Charges', { exact: true })).toHaveCount(0)
    await expect(card.getByText('Top category')).toHaveCount(0)
    // Delta badges carry an "up …" / "down …" aria-label and an arrow icon
    await expect(
      card.locator('[aria-label^="up "], [aria-label^="down "]')
    ).toHaveCount(0)
    await expect(card.locator('.mdi-arrow-up, .mdi-arrow-down')).toHaveCount(0)
    // Narrative sentences
    await expect(
      card.getByText(/^(Spending|Money in) is (up|down)/)
    ).toHaveCount(0)
    await expect(card.getByText(/(more|fewer) purchases than/)).toHaveCount(0)
  })
})
