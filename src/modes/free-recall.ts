/**
 * Mode A: Free Recall. One always-focused text box; typing a valid name in
 * any order marks that target solved, fills it green, and shows its label.
 */
import type { Pack, Session } from '../engine/types';

export interface FreeRecallController {
  /** Call on every keystroke in the always-focused input. */
  handleInput(value: string): void;
  destroy(): void;
}

export function createFreeRecall(
  _root: HTMLElement,
  _pack: Pack,
  _session: Session,
): FreeRecallController {
  throw new Error('TODO');
}
