import { test, expect, type Page, type Locator } from '@playwright/test'
import { closeDashboardTour, startWithSampleData } from './helpers'

// #216: the Headroom section — On hand − Still to go out = Headroom.
// Pinned to the 20th so the sample Phone bill (dated 3 days ago) is overdue.
async function open(page: Page) {
  await page.clock.install({ time: new Date(2027, 0, 20, 10, 0, 0) })
  await startWithSampleData(page)
  await closeDashboardTour(page)
}

const onHand = (page: Page) => page.getByTestId('headroom-on-hand')
const toGo = (page: Page) => page.getByTestId('headroom-to-go')
const headroom = (page: Page) => page.getByTestId('headroom-headroom')

/** A card's total, in cents. */
async function total(card: Locator): Promise<number> {
  const text = (await card.locator('.headroom-card__total').innerText()).trim()
  const cents = Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100)
  return text.startsWith('−') ? -cents : cents
}

async function expectSumHolds(page: Page) {
  expect(await total(headroom(page))).toBe(
    (await total(onHand(page))) - (await total(toGo(page)))
  )
}

test.describe('Headroom cards (#216)', () => {
  test('render On hand − Still to go out = Headroom at the top of the Dashboard', async ({
    page,
  }) => {
    await open(page)

    await expect(onHand(page)).toContainText('On hand')
    await expect(onHand(page)).toContainText('Everyday')
    await expect(onHand(page)).toContainText(
      'Savers switched off aren’t counted'
    )
    await expect(toGo(page)).toContainText('Still to go out · Jan')
    await expect(toGo(page)).toContainText('Regulars not paid yet')
    await expect(toGo(page)).toContainText('Left in trackers')
    await expect(headroom(page)).toContainText(
      'Bills to the end of this month. Pay still to come isn’t counted.'
    )
    await expect(headroom(page)).toContainText('Free spending so far')
    // Sample data starts with every Saver off: On hand is the Spending account.
    expect(await total(onHand(page))).toBe(452300)
    await expectSumHolds(page)

    // Above the Dashboard's sections.
    const section = await page
      .getByRole('region', { name: 'Headroom' })
      .boundingBox()
    const sections = await page.locator('.dashboard-grid').boundingBox()
    expect(section!.y).toBeLessThan(sections!.y)
  })

  test('Mark paid drops an overdue Regular from Still to go out, and Undo restores it', async ({
    page,
  }) => {
    await open(page)
    const markPaid = toGo(page).getByRole('button', {
      name: /^Phone, due 17 Jan, overdue\. Mark paid$/,
    })
    await expect(markPaid).toBeVisible()
    const before = await total(toGo(page))

    await markPaid.click()

    await expect(markPaid).toHaveCount(0)
    expect(await total(toGo(page))).toBe(before - 6500)
    await expectSumHolds(page)
    const toast = page.locator('.vantura-toast')
    await expect(toast).toContainText('Phone marked paid')

    await toast.getByRole('button', { name: 'Undo' }).click()

    await expect(markPaid).toBeVisible()
    expect(await total(toGo(page))).toBe(before)
    await expectSumHolds(page)
  })

  test('the Saver picker switches a Saver on and off, and On hand and Headroom follow', async ({
    page,
  }) => {
    await open(page)
    const onHandBefore = await total(onHand(page))
    const headroomBefore = await total(headroom(page))

    await onHand(page).getByRole('button', { name: 'Choose' }).click()
    const dialog = page.getByRole('dialog')
    const rainyDay = dialog.getByRole('switch', { name: /Rainy Day/ })
    await expect(rainyDay).not.toBeChecked()

    await rainyDay.check()
    await expect(rainyDay).toBeChecked()
    await expect.poll(() => total(onHand(page))).toBe(onHandBefore + 125000)
    expect(await total(headroom(page))).toBe(headroomBefore + 125000)

    await rainyDay.uncheck()
    await expect.poll(() => total(onHand(page))).toBe(onHandBefore)
    expect(await total(headroom(page))).toBe(headroomBefore)

    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(onHand(page)).not.toContainText('Rainy Day')
  })

  test('stacks at phone width with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page)

    const a = (await onHand(page).boundingBox())!
    const b = (await toGo(page).boundingBox())!
    const c = (await headroom(page).boundingBox())!
    // Each card fills the row (minus the page gutters), one under another.
    for (const box of [a, b, c]) expect(box.width).toBeGreaterThan(300)
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height)
    expect(c.y).toBeGreaterThanOrEqual(b.y + b.height)
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
