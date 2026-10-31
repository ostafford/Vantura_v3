import { test, expect, type Page } from '@playwright/test'
import { startWithSampleData } from './helpers'

type CloseMethod = 'close button' | 'Escape' | 'overlay click'

// Measured on the unfixed code: a close 0–300ms after the popover appears
// went unrecorded, from 400ms it stuck (#139). 100ms sits well inside.
const CLOSE_AFTER_MS = 100

const tourPopover = (page: Page) => page.locator('.driver-popover')

/**
 * Closes the tour CLOSE_AFTER_MS after driver.js inserts its popover — inside
 * the window where a close used to go unrecorded. Playwright's own actions
 * can't time this reliably. Sets window.__tourCloseFired once the close has
 * been sent so the test can prove it happened.
 */
async function closeTourSoonAfterItOpens(page: Page, how: CloseMethod) {
  await page.addInitScript(
    ({ method, delay }) => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('.driver-popover')) return
        observer.disconnect()
        setTimeout(() => {
          let target: Element | null
          if (method === 'close button') {
            target = document.querySelector('.driver-popover-close-btn')
            ;(target as HTMLElement | null)?.click()
          } else if (method === 'Escape') {
            target = document.body
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
          } else {
            target = document.querySelector('.driver-overlay path')
            target?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          }
          ;(
            window as unknown as { __tourCloseFired: boolean }
          ).__tourCloseFired = target !== null
        }, delay)
      })
      // Init scripts run before <html> exists, so observe the document itself
      observer.observe(document, { childList: true, subtree: true })
    },
    { method: how, delay: CLOSE_AFTER_MS }
  )
}

/**
 * Leaves the dashboard and comes back, then waits past the tour's 400ms
 * start delay so a tour that is going to reopen has had the chance to.
 */
async function revisitDashboard(page: Page) {
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByLabel(/Spendable balance/i)).toBeVisible()
  await page.waitForTimeout(1000)
}

test.describe('dashboard tour: a deliberate close counts as done', () => {
  for (const how of ['close button', 'Escape', 'overlay click'] as const) {
    test(`closing by ${how} just after it opens keeps it closed on the next visit`, async ({
      page,
    }) => {
      await closeTourSoonAfterItOpens(page, how)
      await startWithSampleData(page)
      await page.waitForFunction(
        () =>
          (window as unknown as { __tourCloseFired?: boolean })
            .__tourCloseFired === true
      )
      await expect(tourPopover(page)).toHaveCount(0)

      await revisitDashboard(page)
      await expect(tourPopover(page)).toHaveCount(0)
    })
  }

  test('closing just after pressing Next keeps it closed on the next visit', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await expect(tourPopover(page)).toBeVisible()
    // Let step 1 settle, then close inside step 2's entry transition
    await page.waitForTimeout(600)
    await page.evaluate(
      (delay) =>
        new Promise<void>((resolve) => {
          document
            .querySelector<HTMLElement>('.driver-popover-next-btn')!
            .click()
          setTimeout(() => {
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }))
            resolve()
          }, delay)
        }),
      CLOSE_AFTER_MS
    )
    await expect(tourPopover(page)).toHaveCount(0)

    await revisitDashboard(page)
    await expect(tourPopover(page)).toHaveCount(0)
  })
})
