import { test, expect } from '@playwright/test'
import {
  startWithSampleData,
  closeDashboardTour,
  goToTrackers,
} from './helpers'

// #164 (Dashboard) and #167 (Analytics): a page left open across midnight follows the new day by itself.
// Starts 30s before midnight so the run stays inside the inactivity lock.
test('the Dashboard moves to the new day at midnight with no interaction', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Sunday 31 Jan 2027: midnight starts a new month.
  await page.clock.install({ time: new Date(2027, 0, 31, 23, 59, 30) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
  await expect(page.getByText('January at a glance')).toBeVisible()

  await page.clock.runFor(40_000)

  await expect(page.getByText('February at a glance')).toBeVisible()
  await expect(
    page.getByText('February 2027', { exact: true }).first()
  ).toBeVisible()
  expect(errors).toEqual([])
})

// Sunday 31 Jan 2027, 30s before a new week and a new month (see above).
async function openAt2359(page: import('@playwright/test').Page) {
  await page.clock.install({ time: new Date(2027, 0, 31, 23, 59, 30) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
}

test('the Trackers list moves to the new period at midnight', async ({
  page,
}) => {
  await openAt2359(page)
  await goToTrackers(page)
  await expect(page.getByText('Fri, Jan 1 – Sun, Jan 31').first()).toBeVisible()

  await page.clock.runFor(40_000)

  await expect(page.getByText('Mon, Feb 1 – Sun, Feb 28').first()).toBeVisible()
  await expect(page.getByText('Fri, Jan 1 – Sun, Jan 31')).toHaveCount(0)
})
