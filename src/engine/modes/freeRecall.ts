/**
 * Mode A submit logic: Free Recall. Any unsolved target may be answered, in
 * any order — this is a thin wrapper over `matcher.match` scoped to the
 * whole unsolved set, so the solve-all rule (one entry resolves every
 * target sharing that normalised name) applies automatically. A miss is
 * not penalised: it simply resolves nothing.
 */
import { match, type AliasIndex } from '../matcher';
import type { Target } from '../types';

export interface FreeRecallResult {
  /** ids of every unsolved target this input resolved. Empty on a miss. */
  solvedIds: Array<Target['id']>;
}

export function submitAnswer(
  input: string,
  index: AliasIndex,
  unsolvedIds: ReadonlySet<Target['id']>,
): FreeRecallResult {
  return { solvedIds: match(input, index, unsolvedIds).ids };
}
