import { useState, useEffect, useMemo } from 'react'
import { Button, Form } from 'react-bootstrap'
import { getAccountsByTypes, type AccountRow } from '@/services/accounts'
import {
  getEssentialsSaverAccountId,
  setEssentialsSaverAccountId,
} from '@/services/essentials'
import { formatMoney } from '@/lib/format'
import { toast } from '@/stores/toastStore'

const ESSENTIALS_NAME_HINT = /essential/i

export function EssentialsSection() {
  const [savers, setSavers] = useState<AccountRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [nominatedId, setNominatedId] = useState<string | null>(null)

  useEffect(() => {
    const saverAccounts = getAccountsByTypes(['SAVER'])
    setSavers(saverAccounts)
    const current = getEssentialsSaverAccountId()
    setNominatedId(current)
    if (current) {
      setSelectedId(current)
    } else {
      // Assist-only: pre-fill a Saver matching Up's Essentials naming, but
      // nothing is written until the user explicitly saves.
      const suggested = saverAccounts.find((a) =>
        ESSENTIALS_NAME_HINT.test(a.display_name)
      )
      setSelectedId(suggested?.id ?? '')
    }
  }, [])

  const suggestedId = useMemo(
    () => savers.find((a) => ESSENTIALS_NAME_HINT.test(a.display_name))?.id,
    [savers]
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEssentialsSaverAccountId(selectedId || null)
    setNominatedId(selectedId || null)
    toast.success(
      selectedId
        ? 'Essentials Saver nominated.'
        : 'Essentials Saver nomination cleared.'
    )
  }

  return (
    <>
      <p className="small text-muted mb-3">
        If Up has set you up with Essentials, nominate the Saver it pays your
        bills from. Vantura will exclude bills funded from it from your Reserved
        balance — they're already covered from there, not from Available. Leave
        this unset if you're not using Essentials.
      </p>
      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="settings-essentials-saver">
            Essentials Saver
          </Form.Label>
          <Form.Select
            id="settings-essentials-saver"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">None — I'm not using Essentials</option>
            {savers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name} ({formatMoney(a.balance)})
                {a.id === suggestedId ? ' — suggested' : ''}
              </option>
            ))}
          </Form.Select>
          {savers.length === 0 && (
            <Form.Text className="text-muted">
              No Saver accounts found yet — sync with Up Bank first.
            </Form.Text>
          )}
        </Form.Group>
        {nominatedId && (
          <p className="small text-muted mb-2">
            Currently nominated:{' '}
            <span className="fw-semibold">
              {savers.find((a) => a.id === nominatedId)?.display_name ??
                nominatedId}
            </span>
          </p>
        )}
        <Button type="submit" className="btn-gradient-primary" size="sm">
          Save
        </Button>
      </Form>
    </>
  )
}
