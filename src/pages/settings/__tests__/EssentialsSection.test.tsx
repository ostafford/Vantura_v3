import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import type { AccountRow } from '@/services/accounts'

const mocks = vi.hoisted(() => ({
  savers: [] as Partial<AccountRow>[],
  nominatedId: null as string | null,
}))

vi.mock('@/services/accounts', () => ({
  getAccountsByTypes: () => mocks.savers,
}))
vi.mock('@/services/essentials', () => ({
  getEssentialsSaverAccountId: () => mocks.nominatedId,
  setEssentialsSaverAccountId: vi.fn(),
}))

import { EssentialsSection } from '@/pages/settings/EssentialsSection'

function render() {
  return ReactDOMServer.renderToString(<EssentialsSection />).replace(
    /<!-- -->/g,
    ''
  )
}

function selectedOptionText(html: string): string | undefined {
  return html.match(/<option[^>]*selected=""[^>]*>([^<]*)<\/option>/)?.[1]
}

describe('EssentialsSection', () => {
  beforeEach(() => {
    mocks.savers = [
      { id: 'saver-holiday', display_name: 'Holiday', balance: 12000 },
    ]
    mocks.nominatedId = null
  })

  it('shows a nominated Saver that has since closed instead of falling back to "None"', () => {
    mocks.nominatedId = 'saver-closed'
    const html = render()
    expect(selectedOptionText(html)).toBe(
      'Unavailable Saver (closed or removed)'
    )
    expect(html).toContain(
      'Currently nominated: <span class="fw-semibold">Unavailable Saver (closed or removed)</span>'
    )
    expect(html).not.toContain('saver-closed</span>')
  })

  it('pre-selects a Saver named like Essentials without saving it', () => {
    mocks.savers.push({
      id: 'saver-ess',
      display_name: 'Essentials',
      balance: 50000,
    })
    const html = render()
    expect(selectedOptionText(html)).toBe('Essentials ($500.00) — suggested')
    expect(html).not.toContain('Currently nominated')
  })

  it('disables Save when the selection matches what is already saved', () => {
    mocks.nominatedId = 'saver-holiday'
    expect(render()).toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/)
  })

  it('renders a negative Saver balance as −$X', () => {
    mocks.savers[0].balance = -500
    expect(render()).toContain('Holiday (−$5.00)')
  })
})
