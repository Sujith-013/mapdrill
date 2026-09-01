// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import southIndiaPackJson from '../packs/south-india-districts/pack.json';
import { createMapSurface } from '../src/render/mapSurface';
import type { Pack, Session } from '../src/engine/types';

const southIndiaPack = southIndiaPackJson as unknown as Pack;
const geometrySvg = readFileSync(
  join(__dirname, '../packs/south-india-districts/geometry.svg'),
  'utf-8',
);

function baseSession(overrides: Partial<Session> = {}): Session {
  return {
    packId: southIndiaPack.id,
    mode: 'free-recall',
    status: 'running',
    armedTargetId: null,
    targetStates: new Map(southIndiaPack.targets.map((t) => [t.id, 'unsolved'])),
    attempts: new Map(),
    elapsedMs: 0,
    budgetMs: null,
    ...overrides,
  };
}

function pathFor(surface: { el: SVGSVGElement }, id: string): SVGPathElement {
  const el = surface.el.querySelector(`#${id}`);
  if (!el) throw new Error(`no path for ${id}`);
  return el as SVGPathElement;
}

describe('createMapSurface', () => {
  it('mounts all 52 paths from the real south-india pack, id-bound to their target', () => {
    const surface = createMapSurface(document.createElement('div'), southIndiaPack, geometrySvg);
    expect(surface.el.querySelectorAll('path').length).toBe(52);
    for (const target of southIndiaPack.targets) {
      expect(pathFor(surface, target.id).getAttribute('d')).toBeTruthy();
    }
  });

  it('applyState sets the correct class per target state', () => {
    const surface = createMapSurface(document.createElement('div'), southIndiaPack, geometrySvg);
    const [a, b, c] = southIndiaPack.targets;
    const session = baseSession();
    session.targetStates.set(a!.id, 'solved');
    session.targetStates.set(b!.id, 'solvedRetry');
    session.targetStates.set(c!.id, 'missed');

    surface.applyState(session);

    expect(pathFor(surface, a!.id).classList.contains('solved')).toBe(true);
    expect(pathFor(surface, b!.id).classList.contains('solvedRetry')).toBe(true);
    expect(pathFor(surface, c!.id).classList.contains('missed')).toBe(true);
    // solved/retry/missed paint from their own token, not the group fill.
    expect(pathFor(surface, a!.id).classList.contains('region-primary')).toBe(false);
  });

  it('applyState twice with the same snapshot changes nothing', () => {
    const surface = createMapSurface(document.createElement('div'), southIndiaPack, geometrySvg);
    const session = baseSession({
      mode: 'pin-and-name',
      armedTargetId: southIndiaPack.targets[0]!.id,
    });

    surface.applyState(session);
    const before = surface.el.outerHTML;
    surface.applyState(session);
    expect(surface.el.outerHTML).toBe(before);
  });

  it('clicks report the right target id in Mode B', () => {
    const surface = createMapSurface(document.createElement('div'), southIndiaPack, geometrySvg);
    surface.applyState(baseSession({ mode: 'pin-and-name' }));
    const clicked: string[] = [];
    surface.onRegionClick((id) => clicked.push(id));

    const target = southIndiaPack.targets[0]!;
    pathFor(surface, target.id).dispatchEvent(new Event('click', { bubbles: true }));

    expect(clicked).toEqual([target.id]);
  });

  it('clicks are ignored in Mode A', () => {
    const surface = createMapSurface(document.createElement('div'), southIndiaPack, geometrySvg);
    surface.applyState(baseSession({ mode: 'free-recall' }));
    const clicked: string[] = [];
    surface.onRegionClick((id) => clicked.push(id));

    const target = southIndiaPack.targets[0]!;
    pathFor(surface, target.id).dispatchEvent(new Event('click', { bubbles: true }));

    expect(clicked).toEqual([]);
  });

  it('phase switching toggles the base-fill class', () => {
    const surface = createMapSurface(document.createElement('div'), southIndiaPack, geometrySvg);
    const target = southIndiaPack.targets[0]!; // kerala -> region-primary

    expect(pathFor(surface, target.id).classList.contains('region-primary')).toBe(true);

    surface.setPhase('play');
    expect(pathFor(surface, target.id).classList.contains('region-primary-muted')).toBe(true);
    expect(pathFor(surface, target.id).classList.contains('region-primary')).toBe(false);

    surface.setPhase('results');
    expect(pathFor(surface, target.id).classList.contains('region-primary')).toBe(true);
  });
});
