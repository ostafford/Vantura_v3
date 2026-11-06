import { test, expect, type Page } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

// #217: Upcoming's grouping is paid-aware, and its overdue Paid records a
// mark instead of deleting. Pinned to the 20th so the sample Phone bill
// (monthly, dated 3 days ago) is overdue.
async function open(page: Page) {
  await page.clock.install({ time: new Date(2027, 0, 20, 10, 0, 0) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
}

const regulars = (page: Page) => page.locator('[data-tour="upcoming"]')
const overdueGroup = (page: Page) =>
  regulars(page).locator('div.border-warning', {
    hasText: 'Overdue — was this paid?',
  })
const overdueRow = (page: Page, name: string) =>
  overdueGroup(page).locator('.upcoming-card', { hasText: name })
const headroomMarkPaid = (page: Page, name: string) =>
  page
    .getByTestId('headroom-to-go')
    .getByRole('button', { name: new RegExp(`^${name}, due .* Mark paid$`) })

test.describe('Upcoming, paid-aware (#217)', () => {
  test('a recurring overdue Regular offers Paid and Edit, not Remove', async ({
    page,
  }) => {
    await open(page)
    const phone = overdueRow(page, 'Phone')
    await expect(phone).toContainText('Was due')
    await expect(phone.getByRole('button', { name: 'Paid' })).toBeVisible()
    await expect(phone.getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(phone.getByRole('button', { name: 'Remove' })).toHaveCount(0)
  })

  test('Paid records a mark and keeps the Regular; Headroom agrees, and Undo restores it', async ({
    page,
  }) => {
    await open(page)
    await expect(headroomMarkPaid(page, 'Phone')).toBeVisible()

    await overdueRow(page, 'Phone')
      .getByRole('button', { name: 'Paid' })
      .click()

    await expect(overdueRow(page, 'Phone')).toHaveCount(0)
    // Still to go out drops the same occurrence.
    await expect(headroomMarkPaid(page, 'Phone')).toHaveCount(0)
    // The Regular is kept: it moves to Later, at its February occurrence.
    const showAll = regulars(page).getByRole('button', { name: /^Show all/ })
    if (await showAll.count()) await showAll.click()
    await expect(
      regulars(page).getByText('Phone', { exact: true })
    ).toBeVisible()

    const toast = page.locator('.vantura-toast')
    await expect(toast).toContainText('"Phone" marked paid')
    await toast.getByRole('button', { name: 'Undo' }).click()

    await expect(overdueRow(page, 'Phone')).toBeVisible()
    await expect(headroomMarkPaid(page, 'Phone')).toBeVisible()
  })

  test('Remove (not paid) still deletes an overdue one-off', async ({
    page,
  }) => {
    await open(page)
    await regulars(page).getByRole('button', { name: 'Add Regular' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Add manually instead' }).click()
    await dialog.getByLabel('Name').fill('Synthetic Concert')
    await dialog.getByLabel(/Amount/).fill('80')
    await dialog.getByLabel(/Frequency/).selectOption('ONCE')
    await dialog.getByLabel('Next charge date').fill('2027-01-10')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    const concert = overdueRow(page, 'Synthetic Concert')
    await expect(
      concert.getByRole('button', { name: 'Reschedule' })
    ).toBeVisible()
    await concert.getByRole('button', { name: 'Remove' }).click()

    await expect(concert).toHaveCount(0)
    await expect(
      regulars(page).getByText('Synthetic Concert', { exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByTestId('headroom-to-go').getByText('Synthetic Concert')
    ).toHaveCount(0)
  })
})
