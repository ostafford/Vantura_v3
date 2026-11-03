import { formatTransactionAmount } from '@/lib/format'

/**
 * One transaction's amount as the Transactions page shows it: a purchase is
 * `−$x`, a refund (or any credit) a green `+$x`. `cents` is signed as stored.
 */
export function TransactionAmount({
  cents,
  className,
}: {
  cents: number
  className?: string
}) {
  const classes = [cents < 0 ? null : 'text-success', className]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={classes || undefined}>
      {formatTransactionAmount(cents)}
    </span>
  )
}
