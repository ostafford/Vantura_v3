import { useState, useMemo } from 'react'
import { Button, Form } from 'react-bootstrap'
import { getAccountsByTypes, type AccountRow } from '@/services/accounts'
import {
  getEssentialsSaverAccountId,
  setEssentialsSaverAccountId,
} from '@/services/essentials'
import { formatSignedMoney } from '@/lib/format'
import { toast } from '@/stores/toastStore'

const ESSENTIALS_NAME_HINT = /essential/i
const UNAVAILABLE_LABEL = 'Unavailable Saver (closed or removed)'

export function EssentialsSection() {
  const [savers] = useState<AccountRow[]>(() => getAccountsByTypes(['SAVER']))
  const [nominatedId, setNominatedId] = useState<string | null>(() =>
    getEssentialsSaverAccountId()
  )
  const suggestedId = useMemo(
    () => savers.find((a) => ESSENTIALS_NAME_HINT.test(a.display_name))?.id,
    [savers]
  )
  // Assist-only: pre-fill a Saver matching Up's Essentials naming, but
  // nothing is written until the user explicitly saves.
  const [selectedId, setSelectedId] = useState(
    () => nominatedId ?? suggestedId ?? ''
  )
  // A nominated Saver that has since closed (or vanished) isn't in `savers`;
  // without its own option the select would show "None" while the nomination
  // is still live, and the user couldn't clear it.
  const nominatedUnavailable =
    nominatedId !== null && !savers.some((a) => a.id === nominatedId)

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
            {nominatedUnavailable && (
              <option value={nominatedId}>{UNAVAILABLE_LABEL}</option>
            )}
            {savers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name} ({formatSignedMoney(a.balance)})
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
                UNAVAILABLE_LABEL}
            </span>
          </p>
        )}
        <Button
          type="submit"
          className="btn-gradient-primary"
          size="sm"
          disabled={selectedId === (nominatedId ?? '')}
        >
          Save
        </Button>
      </Form>
    </>
  )
}
