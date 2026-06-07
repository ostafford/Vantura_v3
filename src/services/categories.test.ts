import { describe, it, expect, vi } from 'vitest'
import {
  buildCategoryTree,
  getCategoriesWithParent,
  type CategoryWithParent,
} from './categories'

vi.mock('@/db', () => ({
  getDb: vi.fn(),
}))

// ── buildCategoryTree ─────────────────────────────────────────────────────────

describe('buildCategoryTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildCategoryTree([])).toEqual([])
  })

  it('returns flat list when all categories have no parent', () => {
    const cats: CategoryWithParent[] = [
      { id: 'a', name: 'Alpha', parent_id: null },
      { id: 'b', name: 'Beta', parent_id: null },
    ]
    const tree = buildCategoryTree(cats)
    expect(tree).toHaveLength(2)
    expect(tree.map((n) => n.id).sort()).toEqual(['a', 'b'])
    tree.forEach((n) => expect(n.children).toEqual([]))
  })

  it('nests children under their parent', () => {
    const cats: CategoryWithParent[] = [
      { id: 'parent', name: 'Parent', parent_id: null },
      { id: 'child-1', name: 'Child One', parent_id: 'parent' },
      { id: 'child-2', name: 'Child Two', parent_id: 'parent' },
    ]
    const tree = buildCategoryTree(cats)
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('parent')
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].children.map((c) => c.id).sort()).toEqual([
      'child-1',
      'child-2',
    ])
  })

  it('children carry no grandchildren (two-level tree)', () => {
    const cats: CategoryWithParent[] = [
      { id: 'parent', name: 'Parent', parent_id: null },
      { id: 'child', name: 'Child', parent_id: 'parent' },
    ]
    const tree = buildCategoryTree(cats)
    expect(tree[0].children[0].children).toEqual([])
  })

  it('treats orphaned categories (missing parent_id in list) as roots', () => {
    const cats: CategoryWithParent[] = [
      { id: 'child', name: 'Child', parent_id: 'nonexistent' },
    ]
    const tree = buildCategoryTree(cats)
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('child')
    expect(tree[0].children).toEqual([])
  })

  it('handles multiple parent groups independently', () => {
    const cats: CategoryWithParent[] = [
      { id: 'p1', name: 'Parent 1', parent_id: null },
      { id: 'p2', name: 'Parent 2', parent_id: null },
      { id: 'c1', name: 'Child A', parent_id: 'p1' },
      { id: 'c2', name: 'Child B', parent_id: 'p2' },
      { id: 'c3', name: 'Child C', parent_id: 'p2' },
    ]
    const tree = buildCategoryTree(cats)
    expect(tree).toHaveLength(2)
    const p1 = tree.find((n) => n.id === 'p1')!
    const p2 = tree.find((n) => n.id === 'p2')!
    expect(p1.children).toHaveLength(1)
    expect(p1.children[0].id).toBe('c1')
    expect(p2.children).toHaveLength(2)
    expect(p2.children.map((c) => c.id).sort()).toEqual(['c2', 'c3'])
  })

  it('preserves category names throughout the tree', () => {
    const cats: CategoryWithParent[] = [
      { id: 'p', name: 'Good Life', parent_id: null },
      { id: 'c', name: 'Groceries', parent_id: 'p' },
    ]
    const tree = buildCategoryTree(cats)
    expect(tree[0].name).toBe('Good Life')
    expect(tree[0].children[0].name).toBe('Groceries')
  })

  it('does not mutate the input array', () => {
    const cats: CategoryWithParent[] = [
      { id: 'a', name: 'Alpha', parent_id: null },
    ]
    const copy = [...cats]
    buildCategoryTree(cats)
    expect(cats).toEqual(copy)
  })
})

// ── getCategoriesWithParent ───────────────────────────────────────────────────

describe('getCategoriesWithParent', () => {
  it('returns empty array when db is not available', async () => {
    const db = await import('@/db')
    vi.mocked(db.getDb).mockReturnValue(null)
    expect(getCategoriesWithParent()).toEqual([])
  })
})
