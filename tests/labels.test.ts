// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import southIndiaPackJson from '../packs/south-india-districts/pack.json';
import {
  ANCHOR_ORDER,
  boxForAnchor,
  createLabelLayer,
  estimateLabelSize,
  FAR_GAP,
  fontSizeForViewBox,
  layoutLabels,
  NEAR_GAP,
  placeSingleLabel,
  pointInPolygon,
  polygonFromPath,
  type LabelBox,
} from '../src/render/labels';
import type { LabelAnchor, Pack, Target, TargetState } from '../src/engine/types';

const southIndiaPack = southIndiaPackJson as unknown as Pack;

/** Real geometry.svg, keyed by target id like mapSurface.ts threads it into applyLayout. */
function southIndiaPolygons(): Map<string, string> {
  const geometrySvg = readFileSync(
    join(__dirname, '../packs/south-india-districts/geometry.svg'),
    'utf-8',
  );
  const doc = new DOMParser().parseFromString(geometrySvg, 'image/svg+xml');
  const byPathId = new Map<string, string>();
  for (const path of doc.querySelectorAll('path[id]')) {
    const id = path.getAttribute('id');
    const d = path.getAttribute('d');
    if (id && d) byPathId.set(id, d);
  }
  return new Map(
    southIndiaPack.targets
      .filter((t) => byPathId.has(t.pathId))
      .map((t) => [t.id, byPathId.get(t.pathId)!]),
  );
}

function makeTarget(overrides: Partial<Target> & Pick<Target, 'id' | 'name'>): Target {
  return {
    aliases: [],
    groupId: 'g',
    pathId: overrides.id,
    labelPoint: { x: 0, y: 0 },
    labelAnchor: 'n',
    tier: 1,
    ...overrides,
  };
}

/** Local, independent overlap check for asserting on solver output — deliberately not reusing labels.ts's internals. */
function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function noPairOverlaps(boxes: LabelBox[]): boolean {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i]!, boxes[j]!)) return false;
    }
  }
  return true;
}

describe('layoutLabels', () => {
  it('places a label for every solved target', () => {
    const targets = [
      makeTarget({ id: 'a', name: 'Alpha', labelPoint: { x: 0, y: 0 } }),
      makeTarget({ id: 'b', name: 'Bravo', labelPoint: { x: 500, y: 0 } }),
      makeTarget({ id: 'c', name: 'Charlie', labelPoint: { x: 0, y: 500 } }),
    ];
    const states = new Map<string, TargetState>([
      ['a', 'solved'],
      ['b', 'solvedRetry'],
      ['c', 'missed'],
    ]);

    const result = layoutLabels(targets, states);

    expect(result.suppressed).toEqual([]);
    expect(result.placements.map((p) => p.targetId).sort()).toEqual(['a', 'b', 'c']);
  });

  it('never labels an unsolved target', () => {
    const targets = [makeTarget({ id: 'a', name: 'Alpha' })];
    const states = new Map<string, TargetState>([['a', 'unsolved']]);

    const result = layoutLabels(targets, states);

    expect(result.placements).toEqual([]);
    expect(result.suppressed).toEqual([]);
  });

  it('no two placed label rectangles overlap, across the real 52-target pack', () => {
    const states = new Map<string, TargetState>(
      southIndiaPack.targets.map((t) => [t.id, 'missed' as TargetState]),
    );

    const result = layoutLabels(southIndiaPack.targets, states);

    expect(noPairOverlaps(result.placements.map((p) => p.box))).toBe(true);
  });

  it('uses the manual labelAnchor when it fits', () => {
    const targets = [
      makeTarget({ id: 'a', name: 'Alpha', labelAnchor: 'sw', labelPoint: { x: 200, y: 200 } }),
    ];
    const states = new Map<string, TargetState>([['a', 'solved']]);

    const result = layoutLabels(targets, states);

    expect(result.placements[0]?.anchor).toBe('sw');
    expect(result.placements[0]?.leader).toBe(false);
  });

  it('tier 1 wins a contested anchor against tier 3 sharing the same point', () => {
    const point = { x: 300, y: 300 };
    const targets = [
      makeTarget({ id: 'low-tier', name: 'Lowtier', tier: 3, labelAnchor: 'n', labelPoint: point }),
      makeTarget({ id: 'top-tier', name: 'Toptier', tier: 1, labelAnchor: 'n', labelPoint: point }),
    ];
    const states = new Map<string, TargetState>([
      ['low-tier', 'solved'],
      ['top-tier', 'solved'],
    ]);

    const result = layoutLabels(targets, states);
    const top = result.placements.find((p) => p.targetId === 'top-tier');
    const low = result.placements.find((p) => p.targetId === 'low-tier');

    expect(top?.anchor).toBe('n'); // tier 1 resolves first, claims its preferred anchor
    expect(low?.anchor).not.toBe('n'); // tier 3 is pushed off it
    expect(top && low ? boxesOverlap(top.box, low.box) : true).toBe(false);
  });

  it('accounts for all 52 targets on give-up (placed + suppressed)', () => {
    const states = new Map<string, TargetState>(
      southIndiaPack.targets.map((t) => [t.id, 'missed' as TargetState]),
    );

    const result = layoutLabels(southIndiaPack.targets, states);

    expect(result.placements.length + result.suppressed.length).toBe(southIndiaPack.targets.length);
    expect(result.placements.length + result.suppressed.length).toBe(52);
  });

  it('solves the full 52-label give-up case fast', () => {
    const states = new Map<string, TargetState>(
      southIndiaPack.targets.map((t) => [t.id, 'missed' as TargetState]),
    );

    const start = performance.now();
    layoutLabels(southIndiaPack.targets, states);
    const elapsedMs = performance.now() - start;

    console.log(`layoutLabels: 52 targets solved in ${elapsedMs.toFixed(2)}ms`);
    expect(elapsedMs).toBeLessThan(200);
  });

  // Regression guard for the actual rendering size (mapSurface derives this
  // from the pack's own viewBox height, not the module's small pure-test
  // default) — locks in that the give-up worst case still resolves cleanly
  // at the size players actually see.
  it('suppresses nothing on give-up at the real render font-size', () => {
    const fontSize = fontSizeForViewBox(southIndiaPack.viewBox[3]);
    const states = new Map<string, TargetState>(
      southIndiaPack.targets.map((t) => [t.id, 'missed' as TargetState]),
    );

    const result = layoutLabels(southIndiaPack.targets, states, { fontSize });

    expect(result.suppressed).toEqual([]);
    expect(result.placements.length).toBe(52);
    expect(noPairOverlaps(result.placements.map((p) => p.box))).toBe(true);
  });
});

describe('placeSingleLabel', () => {
  const point = { x: 100, y: 100 };
  const { width, height } = estimateLabelSize('Districtname');

  it('falls back to a leader-line placement once all 8 near anchors collide', () => {
    const blockers: LabelBox[] = ANCHOR_ORDER.map((a) =>
      boxForAnchor(point, a, width, height, NEAR_GAP),
    );

    const result = placeSingleLabel(point, 'n', width, height, blockers);

    expect(result).not.toBeNull();
    expect(result?.leader).toBe(true);
  });

  it('reports suppression (null) rather than silently dropping when both rings collide', () => {
    const blockers: LabelBox[] = [
      ...ANCHOR_ORDER.map((a) => boxForAnchor(point, a, width, height, NEAR_GAP)),
      ...ANCHOR_ORDER.map((a) => boxForAnchor(point, a, width, height, FAR_GAP)),
    ];

    const result = placeSingleLabel(point, 'n', width, height, blockers);

    expect(result).toBeNull();
  });

  it('honours labelAnchor as the first candidate even when other anchors are free', () => {
    const result = placeSingleLabel(point, 'w' as LabelAnchor, width, height, []);
    expect(result?.anchor).toBe('w');
    expect(result?.leader).toBe(false);
  });
});

describe('createLabelLayer', () => {
  it('emits one <text> per placed target for a given snapshot, none for unsolved or suppressed', () => {
    const targets = [
      makeTarget({ id: 'a', name: 'Alpha', labelPoint: { x: 0, y: 0 } }),
      makeTarget({ id: 'b', name: 'Bravo', labelPoint: { x: 500, y: 0 } }),
      makeTarget({ id: 'c', name: 'Charlie', labelPoint: { x: 0, y: 500 } }),
      makeTarget({ id: 'd', name: 'Delta', labelPoint: { x: 500, y: 500 } }),
    ];
    const states = new Map<string, TargetState>([
      ['a', 'solved'],
      ['b', 'solvedRetry'],
      ['c', 'missed'],
      ['d', 'unsolved'],
    ]);

    const layer = createLabelLayer();
    const result = layer.applyLayout(targets, states);

    expect(result.suppressed).toEqual([]);
    expect(layer.el.querySelectorAll('.label-text').length).toBe(3);
    const names = [...layer.el.querySelectorAll('.label-text')].map((t) => t.textContent).sort();
    expect(names).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  // 20 targets crammed onto one point guarantees a mix of near-gap, leader,
  // and suppressed outcomes (verified empirically: 9 placed — 3 near, 6
  // leader — and 11 suppressed), without hand-choreographing collisions.
  const crowdedPoint = { x: 300, y: 300 };
  const crowdedTargets = Array.from({ length: 20 }, (_, i) =>
    makeTarget({ id: `t${i}`, name: 'District', labelPoint: crowdedPoint, tier: 1 }),
  );
  const crowdedStates = new Map<string, TargetState>(crowdedTargets.map((t) => [t.id, 'solved']));

  it('emits a leader <line> only for placements the solver flagged leader:true', () => {
    const layer = createLabelLayer();
    const result = layer.applyLayout(crowdedTargets, crowdedStates);
    const leaderCount = result.placements.filter((p) => p.leader).length;

    expect(leaderCount).toBeGreaterThan(0); // fixture actually exercises the leader path
    expect(leaderCount).toBeLessThan(result.placements.length); // and the near-gap path too
    expect(layer.el.querySelectorAll('.label-leader').length).toBe(leaderCount);
    expect(layer.el.querySelectorAll('.label-text').length).toBe(result.placements.length);
  });

  it('reports suppression upward instead of silently dropping labels', () => {
    const layer = createLabelLayer();
    const result = layer.applyLayout(crowdedTargets, crowdedStates);

    expect(result.suppressed.length).toBeGreaterThan(0);
    expect(result.placements.length + result.suppressed.length).toBe(crowdedTargets.length);
  });

  it('clears and re-emits on state change: no duplicates, no leaked stale labels', () => {
    const targets = [
      makeTarget({ id: 'a', name: 'Alpha', labelPoint: { x: 0, y: 0 } }),
      makeTarget({ id: 'b', name: 'Bravo', labelPoint: { x: 500, y: 0 } }),
    ];
    const layer = createLabelLayer();

    layer.applyLayout(targets, new Map<string, TargetState>([['a', 'solved']]));
    expect([...layer.el.querySelectorAll('.label-text')].map((t) => t.textContent)).toEqual([
      'Alpha',
    ]);

    // Grow: a newly-solved target must appear, the old one must still be there once, not twice.
    layer.applyLayout(
      targets,
      new Map<string, TargetState>([
        ['a', 'solved'],
        ['b', 'solved'],
      ]),
    );
    expect([...layer.el.querySelectorAll('.label-text')].map((t) => t.textContent).sort()).toEqual([
      'Alpha',
      'Bravo',
    ]);

    // Shrink: b drops out of view again — its label must not linger.
    layer.applyLayout(targets, new Map<string, TargetState>([['b', 'solved']]));
    expect([...layer.el.querySelectorAll('.label-text')].map((t) => t.textContent)).toEqual([
      'Bravo',
    ]);
    expect(layer.el.children.length).toBe(1); // no leaked leader lines or duplicate nodes either
  });
});

describe('pointInPolygon', () => {
  const square = polygonFromPath('M0 0 L100 0 L100 100 L0 100 Z');

  it('is true inside, false outside, on the bbox fast-path and off it', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 500, y: 500 }, square)).toBe(false); // outside the bbox entirely
    expect(pointInPolygon({ x: 50, y: 150 }, square)).toBe(false); // inside the bbox's x-span, outside the shape
  });

  it('sums crossings across every M...Z ring, for a multi-part (island) district', () => {
    // A mainland square plus a small detached island square, one path.
    const multi = polygonFromPath(
      'M0 0 L100 0 L100 100 L0 100 Z M300 300 L320 300 L320 320 L300 320 Z',
    );
    expect(pointInPolygon({ x: 50, y: 50 }, multi)).toBe(true); // mainland
    expect(pointInPolygon({ x: 310, y: 310 }, multi)).toBe(true); // island
    expect(pointInPolygon({ x: 200, y: 200 }, multi)).toBe(false); // the sea between them
  });
});

describe('containment (labels stay in their own district)', () => {
  it('prefers an anchor inside its own district over one that is merely collision-free but outside it', () => {
    const dA = 'M0 300 L200 300 L200 500 L0 500 Z';
    const targets = [
      makeTarget({
        id: 'a',
        name: 'Districtname',
        labelAnchor: 'n',
        labelPoint: { x: 100, y: 310 },
      }),
    ];
    const states = new Map<string, TargetState>([['a', 'solved']]);
    const polygons = new Map([['a', dA]]);

    const result = layoutLabels(targets, states, { polygons });
    const placement = result.placements[0]!;
    const center = {
      x: placement.box.x + placement.box.width / 2,
      y: placement.box.y + placement.box.height / 2,
    };

    // 'n', the hand-tuned default, would land above the district (y < 300) — the solver
    // must reject it in favour of some other anchor that lands inside.
    expect(placement.anchor).not.toBe('n');
    expect(pointInPolygon(center, polygonFromPath(dA))).toBe(true);
    expect(placement.leader).toBe(false);
  });

  it('falls back to the far ring with a leader line once the whole near ring is blocked', () => {
    const dA = 'M0 300 L200 300 L200 500 L0 500 Z';
    const point = { x: 100, y: 310 };
    const { width, height } = estimateLabelSize('Districtname');
    const nearBoxes = ANCHOR_ORDER.map((a) => boxForAnchor(point, a, width, height, NEAR_GAP));
    const polygons = new Map([['a', polygonFromPath(dA)]]);
    const mapBBox = { minX: 0, minY: 300, maxX: 200, maxY: 500 };

    const result = placeSingleLabel(point, 'n', width, height, nearBoxes, {
      ownId: 'a',
      polygons,
      mapBBox,
    });

    expect(result).not.toBeNull();
    expect(result?.leader).toBe(true);
  });

  it('never lands inside a different target polygon — prefers empty margin, even over the hand-tuned anchor', () => {
    // A sliver district squeezed between open sea (west) and a large neighbour (east).
    const dA = 'M90 300 L110 300 L110 320 L90 320 Z';
    const dB = 'M110 200 L400 200 L400 500 L110 500 Z';
    const targets = [
      makeTarget({
        id: 'a',
        name: 'Districtname',
        labelAnchor: 'e',
        labelPoint: { x: 100, y: 310 },
      }),
    ];
    const states = new Map<string, TargetState>([['a', 'solved']]);
    const polygons = new Map([
      ['a', dA],
      ['b', dB],
    ]);

    const result = layoutLabels(targets, states, { polygons });
    const placement = result.placements[0]!;
    const center = {
      x: placement.box.x + placement.box.width / 2,
      y: placement.box.y + placement.box.height / 2,
    };

    // 'e' (the hand-tuned anchor) sits squarely inside B — must be rejected.
    expect(placement.anchor).not.toBe('e');
    expect(pointInPolygon(center, polygonFromPath(dB))).toBe(false);
    expect(placement.leader).toBe(true); // not inside its own district either (there's no room) — needs the tether
  });

  it('suppresses rather than landing on a neighbour when nothing else is available', () => {
    const dA = 'M95 300 L105 300 L105 310 L95 310 Z';
    const dB = 'M0 0 L400 0 L400 600 L0 600 Z'; // covers the whole map around the sliver
    const point = { x: 100, y: 305 };
    const { width, height } = estimateLabelSize('Districtname');
    const polygons = new Map([
      ['a', polygonFromPath(dA)],
      ['b', polygonFromPath(dB)],
    ]);
    const mapBBox = { minX: 0, minY: 0, maxX: 400, maxY: 600 };

    const result = placeSingleLabel(point, 'n', width, height, [], {
      ownId: 'a',
      polygons,
      mapBBox,
    });

    expect(result).toBeNull(); // suppressed, not misinformation
  });

  it('never places a label centre outside the overall map bounding box', () => {
    // District at the map's very corner: nothing north or west of it to expand into.
    const dA = 'M0 0 L40 0 L40 40 L0 40 Z';
    const point = { x: 5, y: 5 };
    const { width, height } = estimateLabelSize('Districtname');
    const nearBoxes = ANCHOR_ORDER.map((a) => boxForAnchor(point, a, width, height, NEAR_GAP));
    const polygons = new Map([['a', polygonFromPath(dA)]]);
    const mapBBox = { minX: 0, minY: 0, maxX: 40, maxY: 40 };

    // Near ring fully blocked, and FAR_GAP (40) from a corner point overshoots this tiny
    // map's bounding box in every direction — every far candidate's centre falls outside it.
    const result = placeSingleLabel(point, 'nw', width, height, nearBoxes, {
      ownId: 'a',
      polygons,
      mapBBox,
    });

    expect(result).toBeNull();
  });

  it('resolves the real 52-district give-up case: most labels in their own district, none on a neighbour', () => {
    const polygons = southIndiaPolygons();
    const parsed = new Map([...polygons].map(([id, d]) => [id, polygonFromPath(d)]));
    const fontSize = fontSizeForViewBox(southIndiaPack.viewBox[3]);
    const states = new Map<string, TargetState>(
      southIndiaPack.targets.map((t) => [t.id, 'missed' as TargetState]),
    );

    const result = layoutLabels(southIndiaPack.targets, states, { fontSize, polygons });

    let inOwn = 0;
    let onOther = 0;
    for (const p of result.placements) {
      const center = { x: p.box.x + p.box.width / 2, y: p.box.y + p.box.height / 2 };
      const own = parsed.get(p.targetId);
      if (own && pointInPolygon(center, own)) {
        inOwn++;
        continue;
      }
      for (const [id, polygon] of parsed) {
        if (id !== p.targetId && pointInPolygon(center, polygon)) onOther++;
      }
    }

    expect(result.placements.length + result.suppressed.length).toBe(52);
    expect(onOther).toBe(0); // the hard constraint this fix adds
    expect(inOwn).toBeGreaterThan(35); // most labels sit in their own district, not just "not on a neighbour"
  });
});
