/**
 * Session scoring: pure functions over `Session` state, per the PRD.
 * No mutation, no DOM — the results panel reads a `ScoreBreakdown` off this.
 */
import type { Session, Target, TargetState } from './types';

export interface ScoreBreakdown {
  /** solved / total. 0 when total is 0. */
  score: number;
  /** firstAttemptSolves / total, Mode B only. Null for free-recall sessions. */
  clean: number | null;
  /** Targets in state 'solved' or 'solvedRetry'. */
  solved: number;
  /** Size of `session.targetStates` (the full pack, or the replay subset). */
  total: number;
  /** Count of targets in each TargetState. */
  counts: Record<TargetState, number>;
  /** ids of targets left 'missed', in `targetStates` insertion order. */
  missedIds: Array<Target['id']>;
  /** Per-target attempt counts, as recorded on the session. */
  attempts: ReadonlyMap<Target['id'], number>;
}

/** Summarizes a session's outcome. Does not mutate `session`. */
export function score(session: Session): ScoreBreakdown {
  const counts: Record<TargetState, number> = {
    unsolved: 0,
    solved: 0,
    solvedRetry: 0,
    missed: 0,
  };
  const missedIds: Array<Target['id']> = [];
  let firstAttemptSolves = 0;

  for (const [id, state] of session.targetStates) {
    counts[state]++;
    if (state === 'missed') missedIds.push(id);
    if ((state === 'solved' || state === 'solvedRetry') && session.attempts.get(id) === 1) {
      firstAttemptSolves++;
    }
  }

  const total = session.targetStates.size;
  const solved = counts.solved + counts.solvedRetry;

  return {
    score: total === 0 ? 0 : solved / total,
    clean: session.mode === 'pin-and-name' ? (total === 0 ? 0 : firstAttemptSolves / total) : null,
    solved,
    total,
    counts,
    missedIds,
    attempts: session.attempts,
  };
}
