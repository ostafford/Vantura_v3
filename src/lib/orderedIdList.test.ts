import { describe, it, expect } from 'vitest'
import { reorderAgainstKnownIds } from './orderedIdList'

describe('reorderAgainstKnownIds', () => {
  it('returns fallback (knownIds by default) when stored is not an array', () => {
    expect(reorderAgainstKnownIds(null, ['a', 'b', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(reorderAgainstKnownIds('garbage', ['a', 'b', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(reorderAgainstKnownIds({ a: 1 }, ['a', 'b', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('returns the explicit fallback (not knownIds order) when given one', () => {
    expect(
      reorderAgainstKnownIds(null, ['a', 'b', 'c'], ['c', 'a', 'b'])
    ).toEqual(['c', 'a', 'b'])
  })

  it('preserves stored order for known ids', () => {
    expect(reorderAgainstKnownIds(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('drops ids no longer in knownIds', () => {
    expect(
      reorderAgainstKnownIds(['x', 'a', 'y', 'b'], ['a', 'b', 'c'])
    ).toEqual(['a', 'b', 'c'])
  })

  it('drops non-string entries', () => {
    expect(reorderAgainstKnownIds(['a', 5, null, 'b'], ['a', 'b'])).toEqual([
      'a',
      'b',
    ])
  })

  it('appends missing known ids, in knownIds order, after stored ids', () => {
    expect(reorderAgainstKnownIds(['b'], ['a', 'b', 'c'])).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  it('dedupes repeated ids in storage, keeping the first occurrence', () => {
    expect(reorderAgainstKnownIds(['a', 'a', 'b'], ['a', 'b', 'c'])).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('returns an empty array when stored is an empty array and there is no fallback difference', () => {
    expect(reorderAgainstKnownIds([], ['a', 'b'])).toEqual(['a', 'b'])
  })
})
