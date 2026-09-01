/**
 * Session state machine: create/start/give-up transitions, recording
 * per-target outcomes and attempt counts. Mode-agnostic — Free Recall and
 * Pin & Name both drive a Session through this module.
 */
import type { Pack, Mode, Session, Target, TargetState } from './types';

/** Creates a fresh, idle session for the given pack and mode. */
export function createSession(_pack: Pack, _mode: Mode, _budgetMs?: number | null): Session {
  throw new Error('TODO');
}

/** Transitions status idle -> running and starts the timer. */
export function startSession(_session: Session): Session {
  throw new Error('TODO');
}

/** Records an attempt at `targetId`; returns the resulting TargetState. */
export function recordAttempt(
  _session: Session,
  _targetId: Target['id'],
  _correct: boolean,
): TargetState {
  throw new Error('TODO');
}

/** Fills all unsolved targets 'missed', freezes the timer, status -> surrendered. */
export function giveUp(_session: Session): Session {
  throw new Error('TODO');
}

/** Builds a new session containing only the targets missed in `session`. */
export function replayMisses(_session: Session): Session {
  throw new Error('TODO');
}
