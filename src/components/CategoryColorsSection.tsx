import { useState } from 'react'
import { Accordion } from 'react-bootstrap'
import {
  getCategoriesWithParent,
  buildCategoryTree,
  type CategoryNode,
} from '@/services/categories'
import {
  getInsightsCategoryColors,
  setInsightsCategoryColor,
  normalizeCategoryIdForColor,
} from '@/lib/chartColors'
import { ChartColorPicker } from '@/components/ChartColorPicker'

// ── Helpers ───────────────────────────────────────────────────────────────────

function ColorSwatch({ color }: { color: string | null }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        borderRadius: 3,
        background: color ?? 'transparent',
        border: color
          ? 'none'
          : '1px dashed var(--bs-border-color, rgba(0,0,0,0.2))',
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    />
  )
}

function CategoryColorRow({
  id,
  name,
  colorMap,
  onColorChange,
}: {
  id: string | null
  name: string
  colorMap: Record<string, string>
  onColorChange: (id: string | null, hex: string | null) => void
}) {
  const key = normalizeCategoryIdForColor(id)
  const color = colorMap[key] ?? null
  return (
    <div className="py-2 border-bottom">
      <div className="d-flex align-items-center gap-2 mb-2">
        <ColorSwatch color={color} />
        <span className="small fw-medium">{name}</span>
      </div>
      <ChartColorPicker
        value={color}
        onChange={(hex) => onColorChange(id, hex)}
        aria-label={`Color for ${name}`}
      />
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function CategoryColorsSection() {
  const [colorMap, setColorMap] = useState(() => getInsightsCategoryColors())

  const tree = buildCategoryTree(getCategoriesWithParent())

  function handleColorChange(
    categoryId: string | null,
    hex: string | null
  ): void {
    setInsightsCategoryColor(categoryId, hex)
    setColorMap(getInsightsCategoryColors())
  }

  return (
    <div>
      <p className="small text-muted mb-3">
        Set a custom color for each category. Changes apply everywhere in the
        app. Categories without a custom color fall back to the accent palette.
      </p>

      {/* Uncategorised — special sentinel for transactions with no category */}
      <p
        className="text-muted fw-semibold mb-2"
        style={{
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        Special
      </p>
      <div className="mb-4">
        <CategoryColorRow
          id={null}
          name="Uncategorised"
          colorMap={colorMap}
          onColorChange={handleColorChange}
        />
      </div>

      {/* Category tree — one accordion item per parent */}
      <p
        className="text-muted fw-semibold mb-2"
        style={{
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        Categories
      </p>
      {tree.length === 0 ? (
        <p className="small text-muted">
          No categories found. Sync your transactions to populate categories.
        </p>
      ) : (
        <Accordion alwaysOpen>
          {tree.map((parent: CategoryNode) => {
            const parentKey = normalizeCategoryIdForColor(parent.id)
            const parentColor = colorMap[parentKey] ?? null
            return (
              <Accordion.Item key={parent.id} eventKey={parent.id}>
                <Accordion.Header>
                  <span className="d-flex align-items-center gap-2">
                    <ColorSwatch color={parentColor} />
                    <span>{parent.name}</span>
                    {parent.children.length > 0 && (
                      <span
                        className="text-muted ms-1"
                        style={{ fontSize: '0.78rem' }}
                      >
                        ({parent.children.length})
                      </span>
                    )}
                  </span>
                </Accordion.Header>
                <Accordion.Body className="px-3 py-0">
                  {/* Parent's own color row */}
                  <CategoryColorRow
                    id={parent.id}
                    name={`${parent.name} (parent)`}
                    colorMap={colorMap}
                    onColorChange={handleColorChange}
                  />
                  {/* Child categories */}
                  {parent.children.map((child: CategoryNode) => (
                    <CategoryColorRow
                      key={child.id}
                      id={child.id}
                      name={child.name}
                      colorMap={colorMap}
                      onColorChange={handleColorChange}
                    />
                  ))}
                </Accordion.Body>
              </Accordion.Item>
            )
          })}
        </Accordion>
      )}
    </div>
  )
}
