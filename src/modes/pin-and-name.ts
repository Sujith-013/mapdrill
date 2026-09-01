/**
 * Mode B: Pin & Name. Click an unnamed subdivision to arm it, then type its
 * name. Only the armed target's name counts. First-try correct = green;
 * correct after retries = amber.
 */
import type { Pack, Session, Target } from '../engine/types';

export interface PinAndNameController {
  /** Call when a subdivision path is clicked; arms it if unsolved. */
  handleArm(targetId: Target['id']): void;
  /** Call on every keystroke while a target is armed. */
  handleInput(value: string): void;
  destroy(): void;
}

export function createPinAndName(
  _root: HTMLElement,
  _pack: Pack,
  _session: Session,
): PinAndNameController {
  throw new Error('TODO');
}
