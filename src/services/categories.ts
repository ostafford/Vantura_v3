import { getDb } from '@/db'

export interface CategoryRow {
  id: string
  name: string
}

export function getCategories(): CategoryRow[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(`SELECT id, name FROM categories ORDER BY name`)
  const list: CategoryRow[] = []
  while (stmt.step()) {
    const row = stmt.get() as [string, string]
    list.push({ id: row[0], name: row[1] })
  }
  stmt.free()
  return list
}

export interface CategoryWithParent {
  id: string
  name: string
  parent_id: string | null
}

export interface CategoryNode {
  id: string
  name: string
  children: CategoryNode[]
}

export function getCategoriesWithParent(): CategoryWithParent[] {
  const db = getDb()
  if (!db) return []
  const stmt = db.prepare(
    `SELECT id, name, parent_id FROM categories ORDER BY name`
  )
  const list: CategoryWithParent[] = []
  while (stmt.step()) {
    const row = stmt.get() as [string, string, string | null]
    list.push({ id: row[0], name: row[1], parent_id: row[2] ?? null })
  }
  stmt.free()
  return list
}

/**
 * Builds a two-level tree from a flat category list.
 * Categories whose parent_id is null become roots.
 * Categories whose parent is not found in the list are also treated as roots
 * (orphan-safe) so no category is silently dropped.
 */
export function buildCategoryTree(
  categories: CategoryWithParent[]
): CategoryNode[] {
  const nodeMap = new Map<string, CategoryNode>()
  for (const c of categories) {
    nodeMap.set(c.id, { id: c.id, name: c.name, children: [] })
  }

  const roots: CategoryNode[] = []
  for (const c of categories) {
    const node = nodeMap.get(c.id)!
    if (!c.parent_id) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(c.parent_id)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
  }

  return roots
}
