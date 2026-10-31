import { test, expect, type Page } from '@playwright/test'
import {
  closeDashboardTour,
  startWithSampleData,
  switchToLightTheme,
} from './helpers'

// The project's text contrast rule (docs/features/appearance-theme/OVERVIEW.md)
const MIN_TEXT_CONTRAST = 4.5

type LegendReading = { label: string; pressed: string | null; ratio: number }

/**
 * Contrast of each visible chart-legend toggle's label against the first
 * opaque background behind it. Measured in the browser because the bug lives
 * in the CSS cascade (Bootstrap button colours vs the app's overrides).
 */
function readLegendContrast(page: Page): Promise<LegendReading[]> {
  return page.$$eval('.month-summary-legend-toggle', (els) => {
    const parse = (css: string) => {
      const m = css.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const [r, g, b, a = 1] = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number)
      return { r, g, b, a }
    }
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const ch = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
    }
    const backgroundBehind = (el: Element) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor)
        if (c && c.a > 0.5) return c
      }
      return { r: 255, g: 255, b: 255, a: 1 }
    }
    return els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => {
        const labelEl = el.querySelector('span:last-child') ?? el
        const fg = parse(getComputedStyle(labelEl).color)!
        const [hi, lo] = [luminance(fg), luminance(backgroundBehind(el))].sort(
          (x, y) => y - x
        )
        return {
          label: (el as HTMLElement).innerText.trim(),
          pressed: el.getAttribute('aria-pressed'),
          ratio: (hi + 0.05) / (lo + 0.05),
        }
      })
  })
}

async function expectLegendReadable(page: Page) {
  // Bootstrap fades button colour; measure the settled state, not mid-fade
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined))
    )
  )
  const readings = await readLegendContrast(page)
  expect(readings.length).toBeGreaterThan(0)
  for (const r of readings) {
    expect(
      r.ratio,
      `"${r.label}" (aria-pressed=${r.pressed}) contrast ${r.ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
  }
}

/** Toggle the first visible legend label off, leaving no hover or focus. */
async function toggleFirstLegendOff(page: Page) {
  const first = page.locator('.month-summary-legend-toggle:visible').first()
  await first.click()
  await expect(first).toHaveAttribute('aria-pressed', 'false')
  await page.mouse.move(0, 0)
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
}

test.describe('chart legend toggles stay readable', () => {
  test('Dashboard month comparison legend is readable in light theme', async ({
    page,
  }) => {
    await startWithSampleData(page)
    await closeDashboardTour(page)
    await switchToLightTheme(page)
    await expectLegendReadable(page)
  })

  for (const theme of ['dark', 'light'] as const) {
    test(`a toggled-off legend label is readable in ${theme} theme`, async ({
      page,
    }) => {
      await startWithSampleData(page)
      await closeDashboardTour(page)
      if (theme === 'light') await switchToLightTheme(page)
      await toggleFirstLegendOff(page)
      await expectLegendReadable(page)
    })

    test(`hovering a toggled-off legend label keeps it readable in ${theme} theme`, async ({
      page,
    }) => {
      await startWithSampleData(page)
      await closeDashboardTour(page)
      if (theme === 'light') await switchToLightTheme(page)
      await toggleFirstLegendOff(page)
      await page.locator('.month-summary-legend-toggle:visible').first().hover()
      await expectLegendReadable(page)
    })
  }

  for (const theme of ['dark', 'light'] as const) {
    for (const period of ['year', 'month', 'week'] as const) {
      test(`Analytics ${period} at-a-glance legend is readable in ${theme} theme`, async ({
        page,
      }) => {
        await startWithSampleData(page)
        await closeDashboardTour(page)
        if (theme === 'light') await switchToLightTheme(page)
        await page.getByRole('link', { name: 'Analytics', exact: true }).click()
        await page.getByLabel('Period for at a glance').selectOption(period)
        await expectLegendReadable(page)
        await toggleFirstLegendOff(page)
        await expectLegendReadable(page)
      })
    }
  }
})
