import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAppSetting } from '@/db'
import { loadValidatedSetting } from './loadValidatedSetting'

vi.mock('@/db', () => ({
  getAppSetting: vi.fn(),
}))

const mockGet = vi.mocked(getAppSetting)

const isString = (v: unknown): v is string => typeof v === 'string'
const isNumberArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((n) => typeof n === 'number')

describe('loadValidatedSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the fallback when the key is missing', () => {
    mockGet.mockReturnValue(null)
    expect(loadValidatedSetting('k', isString, 'fallback')).toBe('fallback')
  })

  it('returns a valid plain-string value unchanged', () => {
    mockGet.mockReturnValue('dark')
    expect(loadValidatedSetting('k', isString, 'fallback')).toBe('dark')
  })

  it('returns the fallback when the stored value fails validation', () => {
    mockGet.mockReturnValue('42') // parses to a number, not a string
    expect(loadValidatedSetting('k', isString, 'fallback')).toBe('fallback')
  })

  it('JSON-parses the stored value before validating', () => {
    mockGet.mockReturnValue('[1, 2, 3]')
    expect(loadValidatedSetting('k', isNumberArray, [])).toEqual([1, 2, 3])
  })

  it('returns the fallback for a JSON value of the wrong shape', () => {
    mockGet.mockReturnValue('[1, "two", 3]')
    expect(loadValidatedSetting('k', isNumberArray, [])).toEqual([])
  })

  it('hands the raw string to validate when it is not valid JSON', () => {
    mockGet.mockReturnValue('system') // JSON.parse throws -> raw string used
    const seen: unknown[] = []
    const spy = (v: unknown): v is string => {
      seen.push(v)
      return typeof v === 'string'
    }
    expect(loadValidatedSetting('k', spy, 'fallback')).toBe('system')
    expect(seen).toEqual(['system'])
  })

  it('returns the fallback when getAppSetting throws', () => {
    mockGet.mockImplementation(() => {
      throw new Error('db not ready')
    })
    expect(loadValidatedSetting('k', isString, 'fallback')).toBe('fallback')
  })

  it('returns the fallback when validate itself throws', () => {
    mockGet.mockReturnValue('{"a":1}')
    const throwing = (_v: unknown): _v is string => {
      throw new Error('bad predicate')
    }
    expect(loadValidatedSetting('k', throwing, 'fallback')).toBe('fallback')
  })
})
