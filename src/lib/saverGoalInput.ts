import { parseAmountInput } from './amountInput'

export type SaverGoalInput =
  | { kind: 'set'; cents: number }
  | { kind: 'clear' }
  | { kind: 'invalid' }

/**
 * What the Saver goal field's text asks for. Blank or $0 clears the goal (the
 * field's existing meaning); a plain positive amount sets it; anything else is
 * refused, so a typo never clears or silently rewrites a goal.
 */
export function saverGoalFromInput(text: string): SaverGoalInput {
  const parsed = parseAmountInput(text)
  if (!parsed.ok) return { kind: 'invalid' }
  if (parsed.cents == null || parsed.cents <= 0) return { kind: 'clear' }
  return { kind: 'set', cents: parsed.cents }
}
