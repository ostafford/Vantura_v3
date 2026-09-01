import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAppSetting } from '@/db'
import { loadValidatedSetting } from './loadValidatedSetting'

vi.mock('@/db', () => ({
  getAppSetting: vi.fn(),
}))

const mockGet = vi.mocked(getAppSetting)
const identity = (raw: string): string => raw

describe('loadValidatedSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the fallback when the key is missing', () => {
    mockGet.mockReturnValue(null)
    expect(loadValidatedSetting('k', identity, 'fallback')).toBe('fallback')
  })

  it('returns whatever parse returns for a present value', () => {
    mockGet.mockReturnValue('dark')
    expect(loadValidatedSetting('k', identity, 'fallback')).toBe('dark')
  })

  it('returns the fallback when parse rejects the value with null', () => {
    mockGet.mockReturnValue('purple')
    const parse = (raw: string) => (raw === 'dark' ? raw : null)
    expect(loadValidatedSetting('k', parse, 'fallback')).toBe('fallback')
  })

  it('hands the raw string to parse verbatim (no JSON coercion)', () => {
    mockGet.mockReturnValue('123')
    const seen: string[] = []
    const parse = (raw: string) => {
      seen.push(raw)
      return raw
    }
    expect(loadValidatedSetting('k', parse, 'fallback')).toBe('123')
    expect(seen).toEqual(['123'])
  })

  it('lets parse decode JSON and returns the decoded value', () => {
    mockGet.mockReturnValue('[1, 2, 3]')
    const parse = (raw: string) => JSON.parse(raw) as number[]
    expect(loadValidatedSetting('k', parse, [])).toEqual([1, 2, 3])
  })

  it('returns the fallback when parse throws (e.g. JSON.parse on garbage)', () => {
    mockGet.mockReturnValue('{not json')
    const parse = (raw: string) => JSON.parse(raw) as unknown
    expect(loadValidatedSetting('k', parse, 'fallback')).toBe('fallback')
  })

  it('returns the fallback when getAppSetting throws', () => {
    mockGet.mockImplementation(() => {
      throw new Error('db not ready')
    })
    expect(loadValidatedSetting('k', identity, 'fallback')).toBe('fallback')
  })

  it('returns an empty-array result as-is rather than the fallback', () => {
    mockGet.mockReturnValue('[]')
    const sentinel = ['fallback']
    const parse = (raw: string) => JSON.parse(raw) as string[]
    expect(loadValidatedSetting('k', parse, sentinel)).toEqual([])
  })
})
