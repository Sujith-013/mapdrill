/**
 * Type definitions for the map pack schema and session state.
 *
 * This module is types only — no runtime code, no implementations.
 * It is the shared vocabulary between the pack format (packs/schema/pack.schema.json,
 * which must stay in sync with the shapes below), the engine, and the UI.
 */

/** Compass point a label is anchored from, relative to its labelPoint. */
export type LabelAnchor = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/** Relative difficulty/prominence of a target, e.g. for progressive reveal or scoring. */
export type Tier = 1 | 2 | 3;

/** A group of targets sharing a fill (e.g. a state containing districts). */
export interface Group {
  id: string;
  name: string;
  /** Name of a CSS custom property (without the `--`) providing this group's base fill,
   *  e.g. "kerala" -> the token consumed as var(--region-primary). */
  fillToken: string;
}

/** A single nameable subdivision (district, state, province, ...). */
export interface Target {
  id: string;
  name: string;
  /** Alternate accepted spellings/names, matched the same as `name`. */
  aliases: string[];
  groupId: Group['id'];
  /** id of the <path> element in the pack's SVG this target is bound to. */
  pathId: string;
  labelPoint: { x: number; y: number };
  labelAnchor: LabelAnchor;
  tier: Tier;
}

/** SVG viewBox as [minX, minY, width, height]. */
export type ViewBox = [x: number, y: number, w: number, h: number];

/** A pluggable map pack: one region, its subdivisions, and their geometry bindings. */
export interface Pack {
  id: string;
  title: string;
  subtitle: string;
  attribution: string;
  viewBox: ViewBox;
  groups: Group[];
  targets: Target[];
}

/** Which drill mode a session is running. */
export type Mode = 'free-recall' | 'pin-and-name';

/** Lifecycle state of a session. */
export type SessionStatus = 'idle' | 'running' | 'complete' | 'surrendered' | 'timeout';

/** Per-target outcome. 'missed' is only reached via Give Up. */
export type TargetState = 'unsolved' | 'solved' | 'solvedRetry' | 'missed';

/** Mutable state for one drill session (one pack, one mode, one attempt). */
export interface Session {
  packId: Pack['id'];
  mode: Mode;
  status: SessionStatus;
  /** Mode B only: the target currently armed for naming. */
  armedTargetId: Target['id'] | null;
  targetStates: Map<Target['id'], TargetState>;
  attempts: Map<Target['id'], number>;
  elapsedMs: number;
  /** Optional time limit for the session; null means untimed. */
  budgetMs: number | null;
}
