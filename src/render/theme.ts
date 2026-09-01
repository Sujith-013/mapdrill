/**
 * Typed bridge to src/styles/tokens.css. Nothing in the renderer may
 * hardcode a hex value — a color always goes through a token name defined
 * here, which must match a `--custom-property` declared in tokens.css.
 *
 * Token *consumption* (the actual `fill:`/`stroke:` declarations) lives in
 * src/styles/app.css, keyed off the same token names and off the class
 * names this module defines — this module only names things, it never sets
 * a style itself (see mapSurface.ts's "class swap, never a fill attribute"
 * rule).
 */

/** Every CSS custom property name (without the leading `--`) declared in tokens.css. */
export const TOKEN = {
  plateBg: 'plate-bg',
  plateBgAlt: 'plate-bg-alt',
  regionPrimary: 'region-primary',
  regionSecondary: 'region-secondary',
  regionPrimaryMuted: 'region-primary-muted',
  regionSecondaryMuted: 'region-secondary-muted',
  hairlineColor: 'hairline-color',
  hairlineWidth: 'hairline-width',
  labelColor: 'label-color',
  labelColorMuted: 'label-color-muted',
  labelFont: 'label-font',
  labelFontSize: 'label-font-size',
  titlePrimary: 'title-primary',
  titleAccent: 'title-accent',
  compassColor: 'compass-color',
  stateArmed: 'state-armed',
  stateSolved: 'state-solved',
  stateSolvedRetry: 'state-solved-retry',
  stateMissed: 'state-missed',
  radiusSm: 'radius-sm',
  fontUi: 'font-ui',
} as const;

export type TokenName = (typeof TOKEN)[keyof typeof TOKEN];

/** `var(--token-name)`, for the rare case that needs the reference inline rather than in a stylesheet. */
export function cssVar(token: TokenName): string {
  return `var(--${token})`;
}

/**
 * Renderer lifecycle phase. Drives the fill-saturation rule resolved in
 * docs/DESIGN-SYSTEM.md ("RESOLVED — fill color: group identity vs. answer
 * state"): full-saturation region fills on 'preview' (start screen) and
 * 'results', muted fills during 'play' so answer-state color carries all
 * the signal instead of competing with two mid-saturation base fills.
 */
export type Phase = 'preview' | 'play' | 'results';

/** Suffix tokens.css uses for a token's play-mode muted variant (see e.g. --region-primary-muted). */
const MUTED_SUFFIX = '-muted';

/**
 * Resolves a group's `fillToken` (from pack.json, e.g. "region-primary") to
 * the token that should actually paint it for `phase` — the muted variant
 * during play, the token as-authored everywhere else.
 */
export function regionFillToken(fillToken: string, phase: Phase): string {
  return phase === 'play' ? `${fillToken}${MUTED_SUFFIX}` : fillToken;
}

/**
 * Per-target visual state mapSurface renders as a CSS class on the target's
 * <path> (see .unsolved/.armed/.solved/.solvedRetry/.missed in app.css).
 * 'armed' is a rendering-only state, not a TargetState — it reflects
 * `Session.armedTargetId`, Mode B only.
 */
export type VisualState = 'unsolved' | 'armed' | 'solved' | 'solvedRetry' | 'missed';

export const VISUAL_STATES: readonly VisualState[] = [
  'unsolved',
  'armed',
  'solved',
  'solvedRetry',
  'missed',
];
