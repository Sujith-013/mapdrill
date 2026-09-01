/**
 * Name matching: normalizes user input and matches it against a target's
 * name/aliases (case/diacritic/whitespace-insensitive), and against all
 * targets in a pack for Free Recall's "any order" lookup.
 */
import type { Pack, Target } from './types';

/** Normalizes a string for comparison (case fold, trim, strip diacritics). */
export function normalize(_input: string): string {
  throw new Error('TODO');
}

/** True if `input` matches `target`'s name or any alias. */
export function matchesTarget(_input: string, _target: Target): boolean {
  throw new Error('TODO');
}

/** Finds the first unsolved target in `pack` matching `input`, if any. */
export function findMatch(_input: string, _pack: Pack): Target | undefined {
  throw new Error('TODO');
}
