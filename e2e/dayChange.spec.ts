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
  // Sunday 31 Jan 2027: midnight starts a new week and a new month.
  await page.clock.install({ time: new Date(2027, 0, 31, 23, 59, 30) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
  const week = page.getByText(/Mon, \w+ \d+ – Sun/).first()
  await expect(page.getByText('January at a glance')).toBeVisible()
  await expect(week).toHaveText('Mon, Jan 25 – Sun, Jan 31')

  await page.clock.runFor(40_000)

  await expect(page.getByText('February at a glance')).toBeVisible()
  await expect(
    page.getByText('February 2027', { exact: true }).first()
  ).toBeVisible()
  await expect(week).toHaveText('Mon, Feb 1 – Sun, Feb 7')
  expect(errors).toEqual([])
})

// Sunday 31 Jan 2027, 30s before a new week and a new month (see above).
async function openAt2359(page: import('@playwright/test').Page) {
  await page.clock.install({ time: new Date(2027, 0, 31, 23, 59, 30) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
}

test('Analytics at a glance moves to the new month at midnight', async ({
  page,
}) => {
  await openAt2359(page)
  await page.getByLabel('Analytics', { exact: true }).click()
  await page.getByLabel('Period for at a glance').selectOption('month')
  await expect(
    page.getByText('January at a glance', { exact: true })
  ).toBeVisible()

  await page.clock.runFor(40_000)

  await expect(
    page.getByText('February at a glance', { exact: true })
  ).toBeVisible()
})

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
