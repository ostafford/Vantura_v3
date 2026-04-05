import { Navigate, useParams } from 'react-router-dom'

export function SaverAccountTransactionsRedirect() {
  const { saverId } = useParams<{ saverId: string }>()
  const id = saverId?.trim()
  if (!id) return <Navigate to="/analytics/savers" replace />
  const q = new URLSearchParams({
    saverActivity: '1',
    linkedAccountId: id,
  })
  return <Navigate to={`/transactions?${q.toString()}`} replace />
}
