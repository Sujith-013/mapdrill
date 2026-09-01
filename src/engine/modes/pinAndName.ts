/**
 * Mode B submit logic: Pin & Name. The input is compared against the armed
 * target only — `matcher.match` is called with a single-element unsolved
 * set, never the whole pack. Correct on attempt 1 -> 'solved'; attempts 2+
 * -> 'solvedRetry' (the darker "4+ attempts" shade is a display-only
 * distinction on the same state, per the PRD — this module just returns
 * the raw attempt count so the results panel can tell tiers apart). Wrong
 * answers still increment the attempt count; retries are unlimited.
 */
import { match, type AliasIndex } from '../matcher';
import type { Target, TargetState } from '../types';

export interface PinAndNameResult {
  correct: boolean;
  /** Attempt count for the armed target after this submission. */
  attempts: number;
  /** Resulting TargetState if correct; null on a wrong answer. */
  state: TargetState | null;
}

export function submitAnswer(
  input: string,
  index: AliasIndex,
  armedTargetId: Target['id'],
  previousAttempts: number,
): PinAndNameResult {
  const attempts = previousAttempts + 1;
  const correct = match(input, index, new Set([armedTargetId])).ids.includes(armedTargetId);
  return {
    correct,
    attempts,
    state: correct ? (attempts === 1 ? 'solved' : 'solvedRetry') : null,
  };
}
