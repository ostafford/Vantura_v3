import { test, expect, type Page } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

// #244: the Month review card at the top of the Dashboard, for the latest
// finished month (sample data seeds a Month-end plan for last month).

const card = (page: Page) => page.getByTestId('month-review')

async function openOn20January(page: Page) {
  await page.clock.install({ time: new Date(2027, 0, 20, 10, 0, 0) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
}

test.describe('Month review (#244)', () => {
  test('shows last month’s result above Headroom, and opens the Budget Plan on that month', async ({
    page,
  }) => {
    await openOn20January(page)

    await expect(card(page)).toHaveText(
      /December: you (saved|overspent) \$[\d,]+\.\d\d\s*·\s*Mark reviewed/
    )
    // It sits above Headroom.
    const cardBox = await card(page).boundingBox()
    const headroomBox = await page
      .getByRole('region', { name: 'Headroom' })
      .boundingBox()
    expect(cardBox!.y).toBeLessThan(headroomBox!.y)

    await page.getByTestId('month-review-open').click()
    await expect(page).toHaveURL(/\/analytics\/budget\?month=2026-12$/)
    await expect(page.getByTestId('plan-month')).toHaveText('December 2026')
    await expect(page.getByTestId('plan-progress')).toHaveText('Month finished')
  })

  test('Mark reviewed hides it, and it stays hidden', async ({ page }) => {
    await openOn20January(page)
    await expect(card(page)).toBeVisible()

    await card(page).getByRole('button', { name: 'Mark reviewed' }).click()
    await expect(card(page)).toHaveCount(0)

    // Leave and come back: still reviewed, and December is still reachable.
    await page.getByRole('link', { name: 'Analytics', exact: true }).click()
    await page.getByRole('link', { name: /View budget plan/ }).click()
    await page.getByTestId('plan-month-prev').click()
    await expect(page.getByTestId('plan-month')).toHaveText('December 2026')
    await page
      .getByRole('link', { name: 'Dashboard', exact: true })
      .first()
      .click()
    await expect(page.getByRole('region', { name: 'Headroom' })).toBeVisible()
    await expect(card(page)).toHaveCount(0)
  })
})
