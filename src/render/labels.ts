/**
 * Label placement solver: positions one label per visible target at
 * target.labelPoint, resolving collisions across the 8 compass anchors,
 * honouring each target's hand-tuned labelAnchor as the first candidate.
 * When polygon data is supplied (LabelLayoutOptions.polygons), placement is
 * also containment-aware: an anchor whose box lands inside the target's own
 * district beats one that doesn't, and landing inside a *different*
 * district is avoided outright — see placeSingleLabel. The solver
 * (everything above `createLabelLayer`) is pure geometry — no DOM, no
 * correctness decisions about the session. `createLabelLayer` is the DOM
 * wrapper around it: it consumes the solver's output to draw, it never
 * feeds back into how the solver decides a layout.
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
  /**
   * true if the renderer should draw a leader line back to target.labelPoint:
   * either this placement fell back to the far ring, or (with containment
   * data) it isn't inside the target's own district — either way it needs
   * the visual tether back to where it actually belongs.
   */
  leader: boolean;
}

export interface LabelLayoutResult {
  placements: LabelPlacement[];
  /** ids of targets whose label collided at every anchor, both rings — surface these on hover instead. */
  suppressed: Array<Target['id']>;
}

export interface LabelLayoutOptions {
  fontSize?: number;
  /**
   * Raw `d` attribute per target id, geometry.svg's own coordinate space
   * (same as labelPoint). Drives the containment constraint: a candidate
   * anchor whose box centre lands inside the target's own polygon is
   * strongly preferred over one that doesn't, and one that lands inside a
   * *different* target's polygon is actively avoided (see placeSingleLabel).
   * Omit to fall back to pre-containment behaviour: first collision-free
   * anchor wins, leader only at FAR_GAP.
   */
  polygons?: ReadonlyMap<Target['id'], string>;
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

// --- Containment: point-in-polygon against a target's own district shape ---
//
// geometry.svg's contract (docs/PACK-SPEC.md) guarantees every <path> is
// M/L/Z only — no curves, no arcs, no transforms — so a district's shape is
// exactly its listed vertices; parsePathRings below isn't a general SVG
// path parser, it only needs to handle that subset. Multiple M...Z groups
// in one `d` are multiple rings of the same district (e.g. a mainland plus
// a small offshore part); pointInPolygon's even-odd test sums crossings
// across every ring, which handles that correctly without special-casing it.

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Polygon {
  rings: Point[][];
  bbox: BBox;
}

function parsePathRings(d: string): Point[][] {
  const rings: Point[][] = [];
  let current: Point[] = [];
  let cmd: 'M' | 'L' | 'Z' | null = null;
  for (const token of d.split(/([MLZ])/)) {
    const trimmed = token.trim();
    if (trimmed === '') continue;
    if (trimmed === 'M' || trimmed === 'L' || trimmed === 'Z') {
      if (trimmed === 'Z') {
        if (current.length) rings.push(current);
        current = [];
      }
      cmd = trimmed;
      continue;
    }
    if (cmd === 'M' || cmd === 'L') {
      const nums = trimmed.split(/\s+/).map(Number);
      for (let i = 0; i + 1 < nums.length; i += 2) {
        current.push({ x: nums[i]!, y: nums[i + 1]! });
      }
    }
  }
  if (current.length) rings.push(current);
  return rings;
}

/** Parses a geometry.svg `d` attribute into a Polygon (rings + bbox) for pointInPolygon. */
export function polygonFromPath(d: string): Polygon {
  const rings = parsePathRings(d);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { rings, bbox: { minX, minY, maxX, maxY } };
}

function inBBox(p: Point, box: BBox): boolean {
  return p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
}

/**
 * Even-odd point-in-polygon (ray casting), bbox-rejected first — cheap:
 * with 52 districts and 8 anchors per target that's at most 416 full tests,
 * and the bbox check turns most of those into a handful of comparisons
 * instead of a walk over every edge.
 */
export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  if (!inBBox(point, polygon.bbox)) return false;

  let inside = false;
  for (const ring of polygon.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.y > point.y !== b.y > point.y) {
        const xIntersect = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
        if (point.x < xIntersect) inside = !inside;
      }
    }
  }
  return inside;
}

function unionBBox(polygons: ReadonlyMap<Target['id'], Polygon>): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { bbox } of polygons.values()) {
    if (bbox.minX < minX) minX = bbox.minX;
    if (bbox.maxX > maxX) maxX = bbox.maxX;
    if (bbox.minY < minY) minY = bbox.minY;
    if (bbox.maxY > maxY) maxY = bbox.maxY;
  }
  return { minX, minY, maxX, maxY };
}

/** Where a candidate anchor's box centre lands, worst to best is implicit in TIER_RANK below. */
type ContainmentTier = 'own' | 'neutral' | 'other';

const TIER_RANK: Record<ContainmentTier, number> = { own: 0, neutral: 1, other: 2 };

interface ContainmentContext {
  ownId: Target['id'];
  polygons: ReadonlyMap<Target['id'], Polygon>;
  mapBBox: BBox;
}

function containmentTier(center: Point, ctx: ContainmentContext): ContainmentTier {
  const own = ctx.polygons.get(ctx.ownId);
  if (own && pointInPolygon(center, own)) return 'own';
  for (const [id, polygon] of ctx.polygons) {
    if (id === ctx.ownId) continue;
    if (pointInPolygon(center, polygon)) return 'other'; // sitting on a neighbour actively misinforms
  }
  return 'neutral'; // empty sea/margin — worse than 'own', better than 'other'
}

interface RankedCandidate {
  anchor: LabelAnchor;
  box: LabelBox;
  tier: ContainmentTier;
}

/**
 * Best-ranked anchor in `order` at `gap`: collision and map-bounds are hard
 * constraints (never violated), containment tier ('own' beats 'neutral'
 * beats 'other') ranks what's left, ties broken by `order`'s position
 * (canonical order, labelAnchor first). Early-exits the moment an 'own'
 * candidate is found — nothing can outrank it.
 */
function bestFit(
  point: Point,
  order: readonly LabelAnchor[],
  width: number,
  height: number,
  gap: number,
  placed: readonly LabelBox[],
  ctx: ContainmentContext,
): RankedCandidate | null {
  let best: RankedCandidate | null = null;
  for (const anchor of order) {
    const box = boxForAnchor(point, anchor, width, height, gap);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    if (!inBBox(center, ctx.mapBBox)) continue;
    if (!placed.every((p) => !overlaps(p, box))) continue;

    const tier = containmentTier(center, ctx);
    // 'other' is a hard reject, not just a low rank: a label sitting on a
    // neighbour's territory actively misinforms, which is worse than this
    // target simply not getting a near/inside placement this round — it's
    // treated the same as a collision, never chosen over nothing.
    if (tier === 'other') continue;

    if (!best || TIER_RANK[tier] < TIER_RANK[best.tier]) {
      best = { anchor, box, tier };
      if (tier === 'own') break;
    }
  }
  return best;
}

/**
 * Places a single label against already-placed boxes: `labelAnchor` first
 * (the hand-tuned override always gets the first try, never overridden by
 * the solver), then the remaining 7 anchors in canonical order, at
 * NEAR_GAP. If all 8 collide, the same 8 again at FAR_GAP. If that also
 * fails, null — the caller should suppress this label.
 *
 * Without `containment` (no polygon data supplied): first collision-free
 * anchor wins outright, leader only at FAR_GAP — the original rule.
 *
 * With `containment`: NEAR_GAP is only accepted if it also lands inside
 * the target's own district (tried first, so a same-tier near candidate
 * always beats a far one); otherwise every collision-free, in-bounds
 * candidate from both rings is ranked — own district beats empty margin
 * beats a neighbour's district — and the winner gets a leader line,
 * because anything other than 'own' needs one to still read as belonging
 * to this target (see labels.ts's LabelLayoutOptions.polygons doc).
 */
export function placeSingleLabel(
  point: Point,
  labelAnchor: LabelAnchor,
  width: number,
  height: number,
  placed: readonly LabelBox[],
  containment?: ContainmentContext,
): { anchor: LabelAnchor; box: LabelBox; leader: boolean } | null {
  const order = [labelAnchor, ...ANCHOR_ORDER.filter((a) => a !== labelAnchor)];

  if (!containment) {
    const near = fitsAnywhere(point, order, width, height, NEAR_GAP, placed);
    if (near) return { ...near, leader: false };

    const far = fitsAnywhere(point, order, width, height, FAR_GAP, placed);
    if (far) return { ...far, leader: true };

    return null;
  }

  const near = bestFit(point, order, width, height, NEAR_GAP, placed, containment);
  if (near?.tier === 'own') return { anchor: near.anchor, box: near.box, leader: false };

  const far = bestFit(point, order, width, height, FAR_GAP, placed, containment);
  const candidates = [near, far].filter((c): c is RankedCandidate => c !== null);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]); // stable: near (listed first) wins ties
  const winner = candidates[0]!;
  return { anchor: winner.anchor, box: winner.box, leader: true };
}

/**
 * Lays out labels for every solved/solvedRetry/missed target, resolving
 * collisions in tier order (tier 1 first) so important districts claim
 * their preferred anchor before lower-tier neighbours compete for it.
 *
 * O(n * anchors * placed): each of the n visible targets tries a constant
 * 16 candidate boxes (8 anchors x 2 gap rounds), each checked against the
 * boxes placed so far with an early-exit scan (`Array.every` stops at the
 * first collision). With containment data, each of those 16 also runs a
 * point-in-polygon check against every district (bbox-rejected first, so
 * most are a handful of comparisons, not a walk of every edge) — worst
 * case 52 districts x 8 anchors x 2 rounds x 52 targets, still cheap
 * (measured: see the "solves fast" test below).
 */
export function layoutLabels(
  targets: readonly Target[],
  targetStates: ReadonlyMap<Target['id'], TargetState>,
  options: LabelLayoutOptions = {},
): LabelLayoutResult {
  const fontSize = options.fontSize ?? FONT_SIZE;
  const visible = targets.filter((t) => isLabelworthy(targetStates.get(t.id))).slice();
  visible.sort((a, b) => a.tier - b.tier);

  // Parsed once per call, reused for every target's containment check below —
  // not cached across calls.
  // ponytail: re-parses all district polygons from scratch on every
  // layoutLabels call (every mapSurface render, i.e. every state change),
  // rather than once per pack. Cheap in practice (52 simple M/L/Z paths),
  // but if that ever shows up in a profile, cache Polygon[] per pack.viewBox
  // + geometrySvg identity instead of per-call.
  const polygons = options.polygons
    ? new Map([...options.polygons].map(([id, d]) => [id, polygonFromPath(d)]))
    : undefined;
  const mapBBox = polygons ? unionBBox(polygons) : undefined;

  const placed: LabelBox[] = [];
  const placements: LabelPlacement[] = [];
  const suppressed: Array<Target['id']> = [];

  for (const target of visible) {
    const { width, height } = estimateLabelSize(target.name, fontSize);
    const containment: ContainmentContext | undefined =
      polygons && mapBBox ? { ownId: target.id, polygons, mapBBox } : undefined;
    const result = placeSingleLabel(
      target.labelPoint,
      target.labelAnchor,
      width,
      height,
      placed,
      containment,
    );
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
