import { describe, expect, it } from 'vitest';
import southIndiaPackJson from '../packs/south-india-districts/pack.json';
import {
  ANCHOR_ORDER,
  boxForAnchor,
  estimateLabelSize,
  FAR_GAP,
  layoutLabels,
  NEAR_GAP,
  placeSingleLabel,
  type LabelBox,
} from '../src/render/labels';
import type { LabelAnchor, Pack, Target, TargetState } from '../src/engine/types';

const southIndiaPack = southIndiaPackJson as unknown as Pack;

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
