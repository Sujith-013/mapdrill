/**
 * End-of-session summary: solved/retry/missed counts, elapsed time, and the
 * "replay the misses" action that spins up a new session scoped to missed
 * targets (via engine/session.ts replayMisses).
 */
import type { Session } from '../engine/types';

export interface ResultsPanel {
  el: HTMLElement;
  onReplayMisses(handler: () => void): void;
  destroy(): void;
}

export function createResultsPanel(_session: Session): ResultsPanel {
  throw new Error('TODO');
}
