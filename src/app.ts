/**
 * App shell. Wires together pack loading, session state, the active mode,
 * and the UI components (map view, input box, timer, results panel).
 */
import type { Pack, Mode, Session } from './engine/types';

export interface AppOptions {
  root: HTMLElement;
  pack: Pack;
  mode: Mode;
}

export interface AppHandle {
  session: Session;
  destroy(): void;
}

/** Mounts the app into `options.root` and returns a handle for teardown. */
export function mountApp(_options: AppOptions): AppHandle {
  throw new Error('TODO');
}
