/**
 * CLI: converts a source GeoJSON FeatureCollection of district polygons into
 * a mapdrill pack (packs/<id>/{pack.json,geometry.svg}) conforming to
 * packs/schema/pack.schema.json and docs/PACK-SPEC.md.
 *
 * Run via `tsx tools/geojson-to-pack.ts --input <path> --id <pack-id>
 * --name-prop <property> --group-prop <property> [options]` — see
 * `parseArgs` below for the full flag list.
 *
 * Pipeline: filter -> project (lon/lat -> SVG px, one shared fit for the
 * whole pack) -> simplify (Douglas-Peucker, in px space) -> emit geometry.svg
 * -> compute each target's labelPoint (pole of inaccessibility) and tier
 * (area tercile) -> emit pack.json. Every step is a pure function taking
 * plain data, so each is unit-testable without touching the filesystem;
 * `run` is the only function that does file I/O.
 *
 * Determinism: features are sorted into a fixed order before anything is
 * assigned an id, so output never depends on input feature order or object
 * key iteration order. Every coordinate is rounded to 2 decimal places right
 * after projection, so the same input always produces the same floats (no
 * accumulating drift across runs). No timestamps or other non-input state
 * ever enters the output.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Group, LabelAnchor, Pack, Target, Tier } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Minimal GeoJSON types — just enough for Polygon/MultiPolygon district data.
// ---------------------------------------------------------------------------

/** A closed ring of [lon, lat] (source) or [x, y] (projected) points. */
export type Ring = number[][];
/** rings[0] is the outer ring, rings[1..] are holes. */
export type PolygonCoords = Ring[];

export interface GeoJsonFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry:
    | { type: 'Polygon'; coordinates: PolygonCoords }
    | { type: 'MultiPolygon'; coordinates: PolygonCoords[] };
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

/** A feature's geometry normalized to "one or more polygons, each a list of rings". */
function toPolygons(feature: GeoJsonFeature): PolygonCoords[] {
  const { geometry } = feature;
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  // Exhaustiveness guard — TS narrows geometry to `never` above if both arms are handled.
  throw new Error(`unsupported geometry type: ${(geometry as { type: string }).type}`);
}

// ---------------------------------------------------------------------------
// CLI options
// ---------------------------------------------------------------------------

export interface CliOptions {
  input: string;
  id: string;
  nameProp: string;
  groupProp: string;
  /** Restrict output to features whose groupProp value is one of these. Omit to keep all. */
  regions?: string[];
  /** Douglas-Peucker tolerance, in output SVG px. */
  tolerance: number;
  width: number;
  height: number;
  /** Margin, in output px, kept clear on every side of the projected geometry. */
  padding: number;
  title: string;
  subtitle: string;
  attribution: string;
  /** Defaults to packs/<id>. Override exists so tests don't write into packs/. */
  outDir?: string;
}

const USAGE =
  'Usage: geojson-to-pack --input <path> --id <pack-id> --name-prop <prop> ' +
  '--group-prop <prop> [--regions a,b] [--tolerance n] [--width n] [--height n] ' +
  '[--padding n] [--title t] [--subtitle s] [--attribution a] [--out-dir dir]';

/** Parses `--flag value` pairs from argv. Pure — no env/process access. */
export function parseArgs(argv: string[]): CliOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const input = get('--input');
  const id = get('--id');
  const nameProp = get('--name-prop');
  const groupProp = get('--group-prop');
  if (!input || !id || !nameProp || !groupProp) {
    throw new Error(USAGE);
  }
  const regionsRaw = get('--regions');
  const regions = regionsRaw
    ? regionsRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : undefined;
  const outDir = get('--out-dir');

  return {
    input,
    id,
    nameProp,
    groupProp,
    ...(regions ? { regions } : {}),
    tolerance: Number(get('--tolerance') ?? 1.5),
    width: Number(get('--width') ?? 800),
    height: Number(get('--height') ?? 1000),
    padding: Number(get('--padding') ?? 20),
    title: get('--title') ?? id,
    subtitle: get('--subtitle') ?? '',
    attribution: get('--attribution') ?? 'See SOURCE.md for license and attribution.',
    ...(outDir ? { outDir } : {}),
  };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Keeps features whose `groupProp` string value is in `regions` (all, if `regions` is omitted). */
export function filterFeatures(
  fc: GeoJsonFeatureCollection,
  groupProp: string,
  regions?: string[],
): GeoJsonFeature[] {
  const allow = regions ? new Set(regions) : undefined;
  return fc.features.filter((f) => {
    const value = f.properties[groupProp];
    if (typeof value !== 'string') return false;
    return allow ? allow.has(value) : true;
  });
}

// ---------------------------------------------------------------------------
// Slugify
// ---------------------------------------------------------------------------

/** Lowercase, ASCII, hyphen-separated id matching pack.schema.json's `^[a-z0-9-]+$`. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slugifies `name`, appending -2, -3, ... on collision. `seen` is mutated. */
function uniqueSlug(name: string, seen: Map<string, number>): string {
  const base = slugify(name);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

// ---------------------------------------------------------------------------
// Projection
//
// Equirectangular (plate carrée), x-scaled by cos(mean latitude). Kerala +
// Tamil Nadu span roughly 6 degrees of longitude by 5.5 of latitude at a
// low, near-equatorial latitude (~8-13 N) — an extent small enough, and far
// enough from the poles, that the distortion an equirectangular projection
// introduces (versus a true equal-area/conformal choice like Albers) is
// imperceptible at this scale. It also needs no projection library and is
// trivial to compute deterministically: two multiplications per point, no
// iterative solving, no trig beyond a single cos() for the whole dataset.
// A country-spanning or high-latitude pack would need a real projection
// instead; this one is only appropriate for a single small, low-latitude
// region like this pack's.
// ---------------------------------------------------------------------------

export interface ProjectionParams {
  lonMin: number;
  latMax: number;
  cosLat0: number;
}

export interface LonLatBbox {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

export function computeProjectionParams(bbox: LonLatBbox): ProjectionParams {
  const lat0 = (bbox.latMin + bbox.latMax) / 2;
  return { lonMin: bbox.lonMin, latMax: bbox.latMax, cosLat0: Math.cos((lat0 * Math.PI) / 180) };
}

/** Projects one [lon, lat] point to unfit, north-up [x, y] (not yet scaled into a viewBox). */
export function projectLonLat(lon: number, lat: number, p: ProjectionParams): [number, number] {
  return [(lon - p.lonMin) * p.cosLat0, p.latMax - lat];
}

export interface FitParams {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Uniform scale + offset that centers a projWidth x projHeight extent inside the viewBox. */
export function computeFit(
  projWidth: number,
  projHeight: number,
  width: number,
  height: number,
  padding: number,
): FitParams {
  const availW = width - 2 * padding;
  const availH = height - 2 * padding;
  const scale =
    projWidth === 0 || projHeight === 0 ? 1 : Math.min(availW / projWidth, availH / projHeight);
  return {
    scale,
    offsetX: padding + (availW - projWidth * scale) / 2,
    offsetY: padding + (availH - projHeight * scale) / 2,
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function applyFit(x: number, y: number, fit: FitParams): [number, number] {
  return [round2(fit.offsetX + x * fit.scale), round2(fit.offsetY + y * fit.scale)];
}

// ---------------------------------------------------------------------------
// Simplification (Douglas-Peucker, run in projected SVG px space so the
// tolerance is a directly meaningful "how many px of wiggle to discard").
// ---------------------------------------------------------------------------

function perpendicularDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function douglasPeucker(points: Ring, tolerance: number): Ring {
  if (points.length <= 2) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxDist = -1;
  let index = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]!;
    const d = perpendicularDistance(x!, y!, first[0]!, first[1]!, last[0]!, last[1]!);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, index + 1), tolerance);
    const right = douglasPeucker(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

/**
 * Simplifies a closed ring, always keeping it a valid polygon ring (>= 4
 * points: 3 distinct corners plus the closing repeat of the first). Falls
 * back to the original ring rather than ever returning something degenerate.
 */
export function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) return ring;
  const simplified = douglasPeucker(ring, tolerance);
  return simplified.length >= 4 ? simplified : ring;
}

// ---------------------------------------------------------------------------
// Area (shoelace) — used both to pick a MultiPolygon's largest part for
// labelPoint, and to rank targets into tiers.
// ---------------------------------------------------------------------------

export function ringArea(ring: Ring): number {
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % n]!;
    sum += x1! * y2! - x2! * y1!;
  }
  return Math.abs(sum) / 2;
}

// ---------------------------------------------------------------------------
// Pole of inaccessibility (Mapbox's `polylabel` algorithm): the point inside
// a polygon that is farthest from any edge. Used instead of the area
// centroid because a centroid is pulled toward wherever the shape has the
// most area and can land outside the shape entirely — in the bay a
// crescent/horseshoe district wraps around, or in the sea off a coastal
// district's outline. Pole of inaccessibility is guaranteed to land inside
// the polygon (or on a hole boundary at worst), which is what a label
// anchor point actually needs.
// ---------------------------------------------------------------------------

interface Cell {
  x: number;
  y: number;
  h: number;
  d: number;
  /** Upper bound on the distance any point in this cell could achieve. */
  max: number;
}

/** Minimal array-backed max-heap, ordered by `.max`. No hashing, no Math.random — deterministic. */
class MaxHeap {
  private items: Cell[] = [];

  push(cell: Cell): void {
    this.items.push(cell);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent]!.max >= this.items[i]!.max) break;
      [this.items[parent], this.items[i]] = [this.items[i]!, this.items[parent]!];
      i = parent;
    }
  }

  pop(): Cell | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (top === undefined) return undefined;
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      let i = 0;
      const n = this.items.length;
      for (;;) {
        let largest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && this.items[l]!.max > this.items[largest]!.max) largest = l;
        if (r < n && this.items[r]!.max > this.items[largest]!.max) largest = r;
        if (largest === i) break;
        [this.items[largest], this.items[i]] = [this.items[i]!, this.items[largest]!];
        i = largest;
      }
    }
    return top;
  }

  get size(): number {
    return this.items.length;
  }
}

function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  let x = ax;
  let y = ay;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = bx;
      y = by;
    } else if (t > 0) {
      x = ax + dx * t;
      y = ay + dy * t;
    }
  }
  const ddx = px - x;
  const ddy = py - y;
  return ddx * ddx + ddy * ddy;
}

/** Signed distance from (x, y) to the polygon's boundary: positive if inside, negative if outside. */
export function pointToPolygonDist(x: number, y: number, rings: Ring[]): number {
  let inside = false;
  let minDistSq = Infinity;
  for (const ring of rings) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (
        a[1]! > y !== b[1]! > y &&
        x < ((b[0]! - a[0]!) * (y - a[1]!)) / (b[1]! - a[1]!) + a[0]!
      ) {
        inside = !inside;
      }
      minDistSq = Math.min(minDistSq, segDistSq(x, y, a[0]!, a[1]!, b[0]!, b[1]!));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

function makeCell(x: number, y: number, h: number, rings: Ring[]): Cell {
  const d = pointToPolygonDist(x, y, rings);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

/** Outer-ring area centroid — a good non-grid starting candidate for thin/sliver polygons. */
function centroidCell(rings: Ring[]): Cell {
  const ring = rings[0]!;
  let x = 0;
  let y = 0;
  let area = 0;
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const f = xj! * yi! - xi! * yj!;
    x += (xj! + xi!) * f;
    y += (yj! + yi!) * f;
    area += f;
  }
  if (area === 0) return makeCell(ring[0]![0]!, ring[0]![1]!, 0, rings);
  const a6 = area * 3;
  return makeCell(x / a6, y / a6, 0, rings);
}

/**
 * `rings[0]` is the outer ring, `rings[1..]` are holes, all in the same
 * (already projected) coordinate space. `precision` controls how finely the
 * search grid is refined, in the same units as the coordinates (SVG px).
 */
export function poleOfInaccessibility(rings: Ring[], precision = 1): { x: number; y: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x! < minX) minX = x!;
      if (y! < minY) minY = y!;
      if (x! > maxX) maxX = x!;
      if (y! > maxY) maxY = y!;
    }
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    return { x: round2((minX + maxX) / 2), y: round2((minY + maxY) / 2) };
  }

  const h = cellSize / 2;
  const heap = new MaxHeap();
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      heap.push(makeCell(x + h, y + h, h, rings));
    }
  }

  let best = makeCell(minX + width / 2, minY + height / 2, 0, rings);
  const centroid = centroidCell(rings);
  if (centroid.d > best.d) best = centroid;

  while (heap.size > 0) {
    const cell = heap.pop()!;
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue; // no remaining cell can beat `best` enough to matter
    const half = cell.h / 2;
    heap.push(makeCell(cell.x - half, cell.y - half, half, rings));
    heap.push(makeCell(cell.x + half, cell.y - half, half, rings));
    heap.push(makeCell(cell.x - half, cell.y + half, half, rings));
    heap.push(makeCell(cell.x + half, cell.y + half, half, rings));
  }
  return { x: round2(best.x), y: round2(best.y) };
}

// ---------------------------------------------------------------------------
// SVG path emission
// ---------------------------------------------------------------------------

function ringToPathD(ring: Ring): string {
  return ring.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') + ' Z';
}

/** Path `d` for a feature with one or more polygons (a MultiPolygon becomes one multi-subpath `d`). */
function featurePathD(polygons: PolygonCoords[]): string {
  const parts: string[] = [];
  for (const polygon of polygons) {
    for (const ring of polygon) parts.push(ringToPathD(ring));
  }
  return parts.join(' ');
}

function buildSvg(width: number, height: number, paths: { id: string; d: string }[]): string {
  const lines = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`];
  for (const p of paths) lines.push(`  <path id="${p.id}" d="${p.d}"/>`);
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Tier: rank projected area into thirds. Tier 1 (largest third) is meant to
// always render per docs/PACK-SPEC.md; this is a coarse proxy for that —
// bigger districts are more likely to be visually prominent and have room
// for their own label. It's a starting point, not a final answer: a pack
// author should still hand-review tier for small-but-prominent districts
// (e.g. a compact capital-city district) the same way labelPoint/labelAnchor
// get hand-reviewed.
// ---------------------------------------------------------------------------

const FILL_TOKENS = ['region-primary', 'region-secondary'] as const; // tokens.css today

function assignTiers(areasById: Map<string, number>): Map<string, Tier> {
  const sorted = [...areasById.entries()].sort(
    ([idA, areaA], [idB, areaB]) => areaB - areaA || idA.localeCompare(idB),
  );
  const n = sorted.length;
  const tiers = new Map<string, Tier>();
  sorted.forEach(([id], i) => {
    const tier: Tier = i < Math.ceil(n / 3) ? 1 : i < Math.ceil((2 * n) / 3) ? 2 : 3;
    tiers.set(id, tier);
  });
  return tiers;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface BuildResult {
  pack: Pack;
  svgBefore: string;
  svgAfter: string;
}

/** Converts a source FeatureCollection + options into a full pack. Pure — no filesystem access. */
export function buildPack(fc: GeoJsonFeatureCollection, options: CliOptions): BuildResult {
  const filtered = filterFeatures(fc, options.groupProp, options.regions);
  if (filtered.length === 0) {
    throw new Error(
      `no features matched --group-prop "${options.groupProp}"` +
        (options.regions ? ` with --regions "${options.regions.join(',')}"` : ''),
    );
  }

  for (const f of filtered) {
    if (typeof f.properties[options.nameProp] !== 'string') {
      throw new Error(
        `feature missing string property "${options.nameProp}": ${JSON.stringify(f.properties)}`,
      );
    }
  }

  // Deterministic order: sort by (group value, name) before any id is assigned,
  // so output never depends on the source file's feature order.
  const sorted = [...filtered].sort((a, b) => {
    const groupCmp = String(a.properties[options.groupProp]).localeCompare(
      String(b.properties[options.groupProp]),
    );
    if (groupCmp !== 0) return groupCmp;
    return String(a.properties[options.nameProp]).localeCompare(
      String(b.properties[options.nameProp]),
    );
  });

  // Global lon/lat bbox across every filtered feature, so all districts share one projection/fit.
  const bbox: LonLatBbox = {
    lonMin: Infinity,
    lonMax: -Infinity,
    latMin: Infinity,
    latMax: -Infinity,
  };
  for (const f of sorted) {
    for (const polygon of toPolygons(f)) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          if (lon! < bbox.lonMin) bbox.lonMin = lon!;
          if (lon! > bbox.lonMax) bbox.lonMax = lon!;
          if (lat! < bbox.latMin) bbox.latMin = lat!;
          if (lat! > bbox.latMax) bbox.latMax = lat!;
        }
      }
    }
  }
  const projParams = computeProjectionParams(bbox);

  // Raw (unfit) projected extent, to compute the single shared fit. (lonMin, latMax) projects
  // to (0, 0) by construction, so (lonMax, latMin) projects straight to (width, height).
  const [projWidth] = projectLonLat(bbox.lonMax, bbox.latMax, projParams);
  const [, projHeight] = projectLonLat(bbox.lonMin, bbox.latMin, projParams);
  const fit = computeFit(projWidth, projHeight, options.width, options.height, options.padding);

  const projectRing = (ring: Ring): Ring =>
    ring.map(([lon, lat]) => {
      const [x, y] = projectLonLat(lon!, lat!, projParams);
      return applyFit(x, y, fit);
    });

  const slugSeen = new Map<string, number>();
  const groupSlugs = new Map<string, string>(); // group value -> group id, first-seen order below is irrelevant (sorted later)

  const beforePaths: { id: string; d: string }[] = [];
  const afterPaths: { id: string; d: string }[] = [];
  const targets: Target[] = [];
  const areasById = new Map<string, number>();

  for (const f of sorted) {
    const name = f.properties[options.nameProp] as string;
    const groupValue = f.properties[options.groupProp] as string;
    const id = uniqueSlug(name, slugSeen);
    if (!groupSlugs.has(groupValue)) groupSlugs.set(groupValue, slugify(groupValue));
    const groupId = groupSlugs.get(groupValue)!;

    const unsimplifiedPolygons = toPolygons(f).map((polygon) => polygon.map(projectRing));
    beforePaths.push({ id, d: featurePathD(unsimplifiedPolygons) });

    const simplifiedPolygons = unsimplifiedPolygons.map((polygon) => {
      const [outer, ...holes] = polygon;
      const simplifiedOuter = simplifyRing(outer!, options.tolerance);
      const simplifiedHoles = holes
        .map((h) => simplifyRing(h, options.tolerance))
        .filter((h) => h.length >= 4);
      return [simplifiedOuter, ...simplifiedHoles];
    });
    afterPaths.push({ id, d: featurePathD(simplifiedPolygons) });

    let largest = simplifiedPolygons[0]!;
    let largestArea = ringArea(largest[0]!);
    let totalArea = largestArea;
    for (const polygon of simplifiedPolygons.slice(1)) {
      const area = ringArea(polygon[0]!);
      totalArea += area;
      if (area > largestArea) {
        largestArea = area;
        largest = polygon;
      }
    }
    areasById.set(id, totalArea);

    const labelPoint = poleOfInaccessibility(largest);

    targets.push({
      id,
      name,
      aliases: [],
      groupId,
      pathId: id,
      labelPoint,
      labelAnchor: 'n' as LabelAnchor, // hand-tuned later per docs/PACK-SPEC.md "Label placement"
      tier: 1, // placeholder, overwritten below once every target's area is known
    });
  }

  const tiers = assignTiers(areasById);
  for (const target of targets) target.tier = tiers.get(target.id)!;

  const groups: Group[] = [...groupSlugs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, id], i) => ({ id, name, fillToken: FILL_TOKENS[i % FILL_TOKENS.length]! }));

  const pack: Pack = {
    id: options.id,
    title: options.title,
    subtitle: options.subtitle,
    attribution: options.attribution,
    viewBox: [0, 0, options.width, options.height],
    groups,
    targets,
  };

  return {
    pack,
    svgBefore: buildSvg(options.width, options.height, beforePaths),
    svgAfter: buildSvg(options.width, options.height, afterPaths),
  };
}

// ---------------------------------------------------------------------------
// CLI glue (file I/O)
// ---------------------------------------------------------------------------

export interface RunResult {
  pack: Pack;
  outDir: string;
  beforeBytes: number;
  afterBytes: number;
}

/** Reads `options.input`, builds the pack, writes packs/<id> (or `options.outDir`). */
export function run(options: CliOptions): RunResult {
  const fc = JSON.parse(readFileSync(options.input, 'utf-8')) as GeoJsonFeatureCollection;
  const { pack, svgBefore, svgAfter } = buildPack(fc, options);
  const outDir = options.outDir ?? join('packs', options.id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'pack.json'), JSON.stringify(pack, null, 2) + '\n');
  writeFileSync(join(outDir, 'geometry.svg'), svgAfter);
  return {
    pack,
    outDir,
    beforeBytes: Buffer.byteLength(svgBefore, 'utf-8'),
    afterBytes: Buffer.byteLength(svgAfter, 'utf-8'),
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const { outDir, beforeBytes, afterBytes, pack } = run(options);
    const pct = beforeBytes === 0 ? 0 : (100 * (1 - afterBytes / beforeBytes)).toFixed(1);
    console.log(`Wrote ${outDir}/pack.json and ${outDir}/geometry.svg`);
    console.log(`${pack.targets.length} targets, ${pack.groups.length} groups`);
    console.log(
      `geometry.svg: ${beforeBytes} -> ${afterBytes} bytes (-${pct}%) after simplification`,
    );
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
