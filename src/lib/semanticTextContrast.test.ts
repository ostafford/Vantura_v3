import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Guards the semantic text tokens in src/index.css: success / info / warning /
 * danger used as TEXT must clear WCAG AA (4.5:1) on every surface they sit
 * on, in both themes. Read from the stylesheet itself, so a token edit that
 * breaks contrast fails here.
 */

// Vitest stubs CSS imports, so read the stylesheet from disk.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

const KINDS = ['success', 'info', 'warning', 'danger'] as const

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`${selector} block not found`)
  return css.slice(start, css.indexOf('\n}', start))
}

function tokens(selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block(selector).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim()
  }
  return out
}

const dark = tokens(':root')
const light = { ...dark, ...tokens("[data-theme='light']") }

/** Resolves `var(--x)` chains to a hex value. */
function resolve(theme: Record<string, string>, name: string): string {
  let value = theme[name]
  for (let i = 0; i < 5 && value?.startsWith('var('); i++) {
    value = theme[value.slice(6, -1)]
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`--${name} does not resolve to a hex colour: ${value}`)
  }
  return value
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Bootstrap tooltips invert the theme: black in light, white in dark.
const TOOLTIP_BG = { light: '#000000', dark: '#ffffff' }

describe('semantic text tokens clear WCAG AA (4.5:1)', () => {
  for (const kind of KINDS) {
    it(`${kind}-text on light page and surface`, () => {
      const fg = resolve(light, `vantura-${kind}-text`)
      expect(
        contrast(fg, resolve(light, 'vantura-background'))
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrast(fg, resolve(light, 'vantura-surface'))
      ).toBeGreaterThanOrEqual(4.5)
    })

    it(`${kind}-text on dark page and surface`, () => {
      const fg = resolve(dark, `vantura-${kind}-text`)
      expect(
        contrast(fg, resolve(dark, 'vantura-background'))
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrast(fg, resolve(dark, 'vantura-surface'))
      ).toBeGreaterThanOrEqual(4.5)
    })

    it(`${kind}-on-tooltip on both tooltip surfaces`, () => {
      expect(
        contrast(resolve(light, `vantura-${kind}-on-tooltip`), TOOLTIP_BG.light)
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrast(resolve(dark, `vantura-${kind}-on-tooltip`), TOOLTIP_BG.dark)
      ).toBeGreaterThanOrEqual(4.5)
    })
  }
})
