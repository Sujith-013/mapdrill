/**
 * Elapsed-time display, optionally counting down against a session's
 * budgetMs. Freezes on give-up/complete/timeout.
 */
import type { Session } from '../engine/types';

export interface Timer {
  el: HTMLElement;
  start(): void;
  freeze(): void;
  destroy(): void;
}

export function createTimer(_session: Session): Timer {
  throw new Error('TODO');
}
