import { useState } from 'react'
import { Form, Button, Table } from 'react-bootstrap'
import { getCategories } from '@/services/categories'
import {
  getMerchantCategoryRules,
  saveMerchantCategoryRule,
  deleteMerchantCategoryRule,
} from '@/services/merchantCategoryRules'
import { toast } from '@/stores/toastStore'

export function MerchantRulesSection() {
  const [refresh, setRefresh] = useState(0)
  const [matchText, setMatchText] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const rules = getMerchantCategoryRules()
  const categories = getCategories()
  const categoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? 'Unknown category'

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!matchText.trim() || !categoryId) return
    saveMerchantCategoryRule(matchText, categoryId)
    setMatchText('')
    setCategoryId('')
    setRefresh((r) => r + 1)
    toast.success('Rule saved.')
  }

  function handleDelete(id: number) {
    deleteMerchantCategoryRule(id)
    setRefresh((r) => r + 1)
  }

  return (
    <div>
      <p className="small text-muted mb-3">
        When a credit card statement import finds a transaction description
        containing one of these keywords, it's automatically categorized. Rules
        apply to imported statement transactions only.
      </p>

      <Form onSubmit={handleAdd} className="d-flex gap-2 mb-4 flex-wrap">
        <Form.Control
          size="sm"
          placeholder="Merchant keyword, e.g. WOOLWORTHS"
          value={matchText}
          onChange={(e) => setMatchText(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <Form.Select
          size="sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          style={{ maxWidth: 220 }}
        >
          <option value="">Category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Form.Select>
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={!matchText.trim() || !categoryId}
        >
          Add rule
        </Button>
      </Form>

      {rules.length === 0 ? (
        <p className="small text-muted">
          No rules yet — they're created automatically when you tick "Remember"
          during a statement import, or add one manually above.
        </p>
      ) : (
        <Table size="sm" hover responsive key={refresh}>
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Category</th>
              <th>Last used</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.match_text}</td>
                <td>{categoryName(rule.category_id)}</td>
                <td className="text-muted small">
                  {rule.last_matched_at
                    ? rule.last_matched_at.slice(0, 10)
                    : 'Never'}
                </td>
                <td className="text-end">
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-danger p-0"
                    onClick={() => handleDelete(rule.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
