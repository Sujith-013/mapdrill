/**
 * Answer matching: normalizes user input and resolves it against a pack's
 * targets. Pure logic only (no DOM, no session state) so Free Recall's
 * whole-pack lookup and Pin & Name's single-armed-target check can both use
 * it without depending on how either mode is wired.
 */
import type { Target } from './types';

/**
 * Normalizes a string for matching: trim -> lowercase -> NFD -> strip
 * combining marks -> strip `.` `'` `-` `–` -> strip all whitespace.
 * Punctuation and whitespace are removed rather than collapsed to a
 * separator, so "New Delhi" and "newdelhi" normalize identically.
 * Idempotent: every character this strips is already gone after one pass.
 */
export function normalise(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining marks left behind by NFD
    .replace(/[.'\u2013-]/g, '') // . ' - –
    .replace(/\s/g, '');
}

/** normalisedString -> ids of every target whose name or an alias normalises to it. */
export type AliasIndex = Map<string, Array<Target['id']>>;

/** Builds the alias index once at pack load; matching is then an O(1) map lookup. */
export function buildAliasIndex(targets: Target[]): AliasIndex {
  const index: AliasIndex = new Map();
  const add = (raw: string, id: Target['id']) => {
    const key = normalise(raw);
    const ids = index.get(key);
    if (ids) {
      if (!ids.includes(id)) ids.push(id);
    } else {
      index.set(key, [id]);
    }
  };
  for (const target of targets) {
    add(target.name, target.id);
    for (const alias of target.aliases) add(alias, target.id);
  }
  return index;
}

export interface MatchOptions {
  /** Enable the Levenshtein distance-1 fallback for 6+ char inputs. Default true. */
  fuzzy?: boolean;
}

export interface MatchResult {
  /** Every unsolved target id the input matched. Empty if none. */
  ids: Array<Target['id']>;
}

const MIN_FUZZY_LENGTH = 6;

/**
 * True if `a` and `b` are equal or exactly one edit (insert/delete/substitute)
 * apart. Single O(n) pass with early exit at the second edit — never builds
 * a full Levenshtein matrix, since all we need is a yes/no at distance 1.
 */
function withinEditDistanceOne(a: string, b: string): boolean {
  if (a === b) return true;
  const lengthDiff = a.length - b.length;
  if (lengthDiff < -1 || lengthDiff > 1) return false;

  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < longer.length && j < shorter.length) {
    if (longer[i] === shorter[j]) {
      i++;
      j++;
      continue;
    }
    edits++;
    if (edits > 1) return false;
    if (longer.length === shorter.length) {
      // substitution: consume one char from each
      i++;
      j++;
    } else {
      // insertion/deletion: consume one char from the longer string only
      i++;
    }
  }
  edits += longer.length - i;
  return edits <= 1;
}

/**
 * Matches normalised `input` against the alias index, returning every
 * unsolved target it resolves to (the solve-all rule: a name shared by
 * several targets resolves all of them at once). Already-solved ids are
 * filtered out before returning.
 *
 * An exact normalised match wins outright. Only when there is no exact key
 * does the fuzzy fallback run (distance <= 1, inputs of 6+ normalised
 * chars only; `options.fuzzy` default true). If the fuzzy hits span more
 * than one distinct target identity — i.e. no single index key's id list
 * accounts for the whole candidate set on its own — that's an ambiguous
 * guess and this returns no match rather than picking one.
 */
export function match(
  input: string,
  index: AliasIndex,
  unsolvedIds: ReadonlySet<Target['id']>,
  options: MatchOptions = {},
): MatchResult {
  const normalised = normalise(input);
  if (normalised === '') return { ids: [] };

  const exact = index.get(normalised);
  if (exact) {
    return { ids: exact.filter((id) => unsolvedIds.has(id)) };
  }

  const fuzzy = options.fuzzy ?? true;
  if (!fuzzy || normalised.length < MIN_FUZZY_LENGTH) return { ids: [] };

  const matchedIdArrays: Array<Array<Target['id']>> = [];
  for (const [key, ids] of index) {
    if (withinEditDistanceOne(normalised, key)) matchedIdArrays.push(ids);
  }
  if (matchedIdArrays.length === 0) return { ids: [] };

  const candidates = new Set<Target['id']>();
  for (const ids of matchedIdArrays) for (const id of ids) candidates.add(id);

  // Unambiguous only if some single index key's id list already accounts for
  // every candidate — that's what "name-duplicates of each other" means
  // structurally, since duplicates share one canonical key. Any candidate
  // left unexplained means two genuinely distinct targets were both within
  // one edit of the input, so refuse to guess.
  const explained = matchedIdArrays.some(
    (ids) => ids.length === candidates.size && ids.every((id) => candidates.has(id)),
  );
  if (!explained) return { ids: [] };

  return { ids: [...candidates].filter((id) => unsolvedIds.has(id)) };
}
