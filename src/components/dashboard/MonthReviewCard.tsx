import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from 'zustand'
import { formatSignedMoney } from '@/lib/format'
import {
  getMonthReview,
  markMonthReviewed,
  type MonthReview,
} from '@/services/monthReview'
import { syncStore } from '@/stores/syncStore'
import { todayStore } from '@/stores/todayStore'

/** "October" for `2026-10`. */
function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long' })
}

function ReviewText({ review }: { review: MonthReview }) {
  const name = monthName(review.month)
  switch (review.kind) {
    case 'saved':
      return (
        <>
          {name}: you saved <strong>{formatSignedMoney(review.cents)}</strong>
        </>
      )
    case 'overspent':
      return (
        <span className="plan-over">
          {name}: you overspent{' '}
          <strong>{formatSignedMoney(review.cents)}</strong>
        </span>
      )
    case 'no-pay':
    case 'unreadable':
      return (
        <>
          {name} is finished · <span className="month-review__cta">Review</span>
        </>
      )
  }
}

/**
 * The Month review (#244): the latest finished month that hasn't been
 * reviewed, with what it saved or overspent. Tapping it opens the Budget Plan
 * on that month; Mark reviewed stores the month (and so every earlier one) as
 * reviewed. Computed on render, re-read after a sync and at midnight.
 */
export function MonthReviewCard() {
  const today = useStore(todayStore, (s) => s.today)
  const lastSyncCompletedAt = useStore(syncStore, (s) => s.lastSyncCompletedAt)
  const [version, setVersion] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const review = useMemo(
    () => getMonthReview(today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, lastSyncCompletedAt, version]
  )
  if (!review) return null

  function finish(month: string) {
    markMonthReviewed(month)
    setLeaving(false)
    setVersion((v) => v + 1)
  }

  function handleMarkReviewed() {
    if (!review) return
    const reduce = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches
    if (reduce) finish(review.month)
    else setLeaving(true)
  }

  return (
    <section
      className={`month-review mb-3${leaving ? ' is-leaving' : ''}`}
      aria-label="Month review"
      data-testid="month-review"
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) finish(review.month)
      }}
    >
      <i className="mdi mdi-calendar-check month-review__icon" aria-hidden />
      <Link
        to={`/analytics/budget?month=${review.month}`}
        className="month-review__link"
        data-testid="month-review-open"
      >
        <ReviewText review={review} />
      </Link>
      <span className="month-review__sep" aria-hidden>
        ·
      </span>
      <button
        type="button"
        className="month-review__mark"
        onClick={handleMarkReviewed}
        disabled={leaving}
      >
        Mark reviewed
      </button>
    </section>
  )
}
