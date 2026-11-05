/** Pure helpers for the Headroom card (#216). */

/** The fixed Headroom caption (#185). */
export const HEADROOM_CAPTION =
  'Bills to the end of this month. Pay still to come isn’t counted.'

/**
 * The split bar: how much of On hand is still going out. Negative Headroom is
 * all amber. A share rounds into 1–99% unless it really is 0 or all of it, so
 * the caption never reads "0%" with something still going out.
 */
export function splitBar(
  onHandCents: number,
  stillToGoOutCents: number,
  headroomCents: number
): { toGoPct: number; caption: string } {
  if (headroomCents < 0) {
    return { toGoPct: 100, caption: 'Still to go out is more than on hand' }
  }
  if (onHandCents <= 0) {
    // Headroom ≥ 0 with nothing on hand means nothing is still going out.
    return {
      toGoPct: 0,
      caption: 'Nothing on hand and nothing still to go out',
    }
  }
  const exact = (stillToGoOutCents / onHandCents) * 100
  let shown = Math.round(exact)
  if (stillToGoOutCents > 0 && shown === 0) shown = 1
  if (stillToGoOutCents < onHandCents && shown === 100) shown = 99
  return {
    toGoPct: exact,
    caption: `${shown}% of on hand is still going out`,
  }
}
