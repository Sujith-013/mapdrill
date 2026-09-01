/**
 * Label placement solver: positions one label per visible target at
 * target.labelPoint, resolving collisions by greedy first-fit across the 8
 * compass anchors, honouring each target's hand-tuned labelAnchor as the
 * first candidate. The solver (everything above `createLabelLayer`) is
 * pure geometry — no DOM, no correctness decisions about the session.
 * `createLabelLayer` is the DOM wrapper around it: it consumes the
 * solver's output to draw, it never feeds back into how the solver
 * decides a layout.
 */
import type { LabelAnchor, Target, TargetState } from '../engine/types';

export interface Point {
  x: number;
  y: number;
}

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelPlacement {
  targetId: Target['id'];
  anchor: LabelAnchor;
  box: LabelBox;
  /** true once placement fell back to the far ring — the renderer should draw a leader line back to target.labelPoint. */
  leader: boolean;
}

export interface LabelLayoutResult {
  placements: LabelPlacement[];
  /** ids of targets whose label collided at every anchor, both rings — surface these on hover instead. */
  suppressed: Array<Target['id']>;
}

export interface LabelLayoutOptions {
  fontSize?: number;
}

/** States a label is ever shown for. Never 'unsolved' — that's the whole point of Mode B's reveal-on-solve. */
function isLabelworthy(state: TargetState | undefined): boolean {
  return state === 'solved' || state === 'solvedRetry' || state === 'missed';
}

// Rendering decision: font-size (and every box/gap dimension below) is a
// number of *viewBox units*, not screen pixels. mapSurface mounts the map's
// <svg> with no fixed pixel width/height and scales it purely via CSS
// against its container — so everything drawn inside it, text included,
// already scales as one unit with the container. Locking font-size to
// screen pixels instead (the usual non-scaling-stroke trick, right for
// hairline borders) would hold letterforms constant while the districts
// around them grow or shrink with the window: the wrong failure mode here,
// since a size tuned for a phone-width map would swamp a small district
// blown up to desktop width. A value in user-space units keeps every label
// legible *relative to the map it's drawn on*, at any container size.
//
// FONT_SIZE below is only the fallback used when a caller doesn't pass an
// explicit size (e.g. these module's own solver tests). Real rendering
// (mapSurface) instead derives the size from the *pack's own viewBox
// height* via fontSizeForViewBox: a size tuned by eye against one pack's
// coordinate space (this one spans 1000 units tall) would be comically
// tiny or huge against a pack whose viewBox is a different scale — sizing
// off a fraction of the viewBox is what makes the number mean anything
// across packs. A fixed 12 (1.2% of the original 1000-tall viewBox) was
// the "far too small" size flagged in review; 1.9% is comfortably larger
// and readable at the reference art's proportions, tuned empirically
// against the real south-india pack as the largest size that still
// resolves all 52 targets on give-up without the solver suppressing any
// of them to dense clusters (0.020 already suppresses one, Kottayam).
export const FONT_SIZE = 12;

/** Fraction of the pack's viewBox height a label's font-size renders at. See FONT_SIZE above. */
export const FONT_SIZE_VIEWBOX_RATIO = 0.019;

/** Derives the render font-size for a pack from its viewBox height (FONT_SIZE_VIEWBOX_RATIO). */
export function fontSizeForViewBox(viewBoxHeight: number): number {
  return viewBoxHeight * FONT_SIZE_VIEWBOX_RATIO;
}

const CHAR_WIDTH_FACTOR = 0.6; // average glyph advance for the sans-serif label font, as a fraction of font-size
const LINE_HEIGHT_FACTOR = 1.3;
const PAD_X = 3;
const PAD_Y = 2;

/**
 * Estimated box for a label's text, computed analytically rather than by
 * DOM measurement (no getBBox/measureText call) — keeps this module DOM-free
 * and its solve time independent of layout/reflow cost.
 */
export function estimateLabelSize(
  name: string,
  fontSize: number = FONT_SIZE,
): { width: number; height: number } {
  return {
    width: name.length * fontSize * CHAR_WIDTH_FACTOR + PAD_X * 2,
    height: fontSize * LINE_HEIGHT_FACTOR + PAD_Y * 2,
  };
}

/** Canonical trial order. A target's own labelAnchor is prepended ahead of this, never dropped from it. */
export const ANCHOR_ORDER: readonly LabelAnchor[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** Distance in viewBox units from labelPoint to the box's near edge, first round. */
export const NEAR_GAP = 4;
/** "Further out" fallback distance once all 8 near-gap anchors collide — placements at this gap get a leader line. */
export const FAR_GAP = 40;

/** Computes a label's box for one compass anchor, `gap` units out from `point`. */
export function boxForAnchor(
  point: Point,
  anchor: LabelAnchor,
  width: number,
  height: number,
  gap: number,
): LabelBox {
  const top = point.y - gap - height;
  const bottom = point.y + gap;
  const left = point.x - gap - width;
  const right = point.x + gap;
  const midX = point.x - width / 2;
  const midY = point.y - height / 2;
  switch (anchor) {
    case 'n':
      return { x: midX, y: top, width, height };
    case 's':
      return { x: midX, y: bottom, width, height };
    case 'e':
      return { x: right, y: midY, width, height };
    case 'w':
      return { x: left, y: midY, width, height };
    case 'ne':
      return { x: right, y: top, width, height };
    case 'nw':
      return { x: left, y: top, width, height };
    case 'se':
      return { x: right, y: bottom, width, height };
    case 'sw':
      return { x: left, y: bottom, width, height };
  }
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** First anchor (in `order`) whose box collides with none of `placed`. Early-exits per anchor and per box checked. */
function fitsAnywhere(
  point: Point,
  order: readonly LabelAnchor[],
  width: number,
  height: number,
  gap: number,
  placed: readonly LabelBox[],
): { anchor: LabelAnchor; box: LabelBox } | null {
  for (const anchor of order) {
    const box = boxForAnchor(point, anchor, width, height, gap);
    if (placed.every((p) => !overlaps(p, box))) return { anchor, box };
  }
  return null;
}

/**
 * Places a single label against already-placed boxes: `labelAnchor` first
 * (the hand-tuned override always gets the first try, never overridden by
 * the solver), then the remaining 7 anchors in canonical order, at
 * NEAR_GAP. If all 8 collide, the same 8 again at FAR_GAP (leader line). If
 * that also fails, null — the caller should suppress this label.
 */
export function placeSingleLabel(
  point: Point,
  labelAnchor: LabelAnchor,
  width: number,
  height: number,
  placed: readonly LabelBox[],
): { anchor: LabelAnchor; box: LabelBox; leader: boolean } | null {
  const order = [labelAnchor, ...ANCHOR_ORDER.filter((a) => a !== labelAnchor)];

  const near = fitsAnywhere(point, order, width, height, NEAR_GAP, placed);
  if (near) return { ...near, leader: false };

  const far = fitsAnywhere(point, order, width, height, FAR_GAP, placed);
  if (far) return { ...far, leader: true };

  return null;
}

/**
 * Lays out labels for every solved/solvedRetry/missed target, resolving
 * collisions in tier order (tier 1 first) so important districts claim
 * their preferred anchor before lower-tier neighbours compete for it.
 *
 * O(n * anchors * placed): each of the n visible targets tries a constant
 * 16 candidate boxes (8 anchors x 2 gap rounds), each checked against the
 * boxes placed so far with an early-exit scan (`Array.every` stops at the
 * first collision, `fitsAnywhere` stops at the first anchor that fits).
 */
export function layoutLabels(
  targets: readonly Target[],
  targetStates: ReadonlyMap<Target['id'], TargetState>,
  options: LabelLayoutOptions = {},
): LabelLayoutResult {
  const fontSize = options.fontSize ?? FONT_SIZE;
  const visible = targets.filter((t) => isLabelworthy(targetStates.get(t.id))).slice();
  visible.sort((a, b) => a.tier - b.tier);

  const placed: LabelBox[] = [];
  const placements: LabelPlacement[] = [];
  const suppressed: Array<Target['id']> = [];

  for (const target of visible) {
    const { width, height } = estimateLabelSize(target.name, fontSize);
    const result = placeSingleLabel(target.labelPoint, target.labelAnchor, width, height, placed);
    if (result) {
      placements.push({
        targetId: target.id,
        anchor: result.anchor,
        box: result.box,
        leader: result.leader,
      });
      placed.push(result.box);
    } else {
      suppressed.push(target.id);
    }
  }

  return { placements, suppressed };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface LabelLayer {
  el: SVGGElement;
  /**
   * Recomputes the layout for `targets`/`targetStates` and replaces the
   * layer's <text>/<line> children to match — clears first, so a shrinking
   * visible set never leaks a stale label. Returns the same
   * LabelLayoutResult layoutLabels would, so a caller (mapSurface) can
   * report `suppressed` on upward.
   */
  applyLayout(
    targets: readonly Target[],
    targetStates: ReadonlyMap<Target['id'], TargetState>,
    options?: LabelLayoutOptions,
  ): LabelLayoutResult;
  destroy(): void;
}

/**
 * DOM wrapper around layoutLabels: one <text> per placement, plus a <line>
 * leader for every placement with `leader: true`. Colour comes from CSS
 * classes (.label-text/.label-leader in app.css), not attributes set here
 * — same "class, not JS-set fill" rule as mapSurface.ts. font-size is the
 * one exception: it's set here, once per layout, as an SVG attribute on
 * the layer's <g> (every <text> inherits it) rather than a CSS token,
 * because it must track the *solver's* fontSize for this call — the same
 * number estimateLabelSize used to size the boxes — not a fixed value a
 * stylesheet can't know per pack.
 */
export function createLabelLayer(): LabelLayer {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'label-layer');

  function applyLayout(
    targets: readonly Target[],
    targetStates: ReadonlyMap<Target['id'], TargetState>,
    options?: LabelLayoutOptions,
  ): LabelLayoutResult {
    const result = layoutLabels(targets, targetStates, options);
    g.setAttribute('font-size', String(options?.fontSize ?? FONT_SIZE));
    g.replaceChildren();

    const byId = new Map(targets.map((t) => [t.id, t]));
    for (const placement of result.placements) {
      const target = byId.get(placement.targetId);
      if (!target) continue;

      const cx = placement.box.x + placement.box.width / 2;
      const cy = placement.box.y + placement.box.height / 2;

      if (placement.leader) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', 'label-leader');
        line.setAttribute('x1', String(target.labelPoint.x));
        line.setAttribute('y1', String(target.labelPoint.y));
        line.setAttribute('x2', String(cx));
        line.setAttribute('y2', String(cy));
        g.appendChild(line);
      }

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'label-text');
      text.setAttribute('x', String(cx));
      text.setAttribute('y', String(cy));
      text.textContent = target.name;
      g.appendChild(text);
    }

    return result;
  }

  return {
    el: g,
    applyLayout,
    destroy() {
      g.remove();
    },
  };
}
