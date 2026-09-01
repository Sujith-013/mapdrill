/// <reference types="vite/client" />
/**
 * Dev-only visual harness for eyeballing the renderer (mapSurface + labels
 * + compass) against docs/reference/south-india-labelled.png. Not a
 * feature: nothing in src/ imports this, and dev/harness.html is never
 * referenced from the shipped index.html, so `vite build`'s default
 * single-entry (index.html) never pulls either file into dist/.
 *
 * Renders four static scenes by fabricating a Session snapshot per scene
 * directly — no engine/SessionController involved, this is a renderer
 * fixture, not a gameplay flow.
 */
import geometrySvg from '../packs/south-india-districts/geometry.svg?raw';
import southIndiaPackJson from '../packs/south-india-districts/pack.json';
import { createCompassRose } from '../src/render/compass';
import { layoutLabels } from '../src/render/labels';
import { createMapSurface } from '../src/render/mapSurface';
import { cssVar, TOKEN, type Phase } from '../src/render/theme';
import type { Pack, Session, TargetState } from '../src/engine/types';

const pack = southIndiaPackJson as unknown as Pack;
const allIds = pack.targets.map((t) => t.id);

function session(overrides: Partial<Session> = {}): Session {
  return {
    packId: pack.id,
    mode: 'pin-and-name',
    status: 'running',
    armedTargetId: null,
    targetStates: new Map(allIds.map((id) => [id, 'unsolved' as TargetState])),
    attempts: new Map(),
    elapsedMs: 0,
    budgetMs: null,
    ...overrides,
  };
}

function withStates(entries: Iterable<[string, TargetState]>): Map<string, TargetState> {
  const states = new Map(allIds.map((id) => [id, 'unsolved' as TargetState]));
  for (const [id, state] of entries) states.set(id, state);
  return states;
}

/**
 * Mounts labels.ts's pure layout as SVG <text>/<line> onto `svg`. Harness
 * glue only — see labels.ts's header for why real DOM mounting is a later
 * integration step, not part of that module.
 */
function renderLabels(svg: SVGSVGElement, targetStates: ReadonlyMap<string, TargetState>): number {
  const { placements, suppressed } = layoutLabels(pack.targets, targetStates);
  const byId = new Map(pack.targets.map((t) => [t.id, t]));
  const ns = 'http://www.w3.org/2000/svg';

  for (const placement of placements) {
    const target = byId.get(placement.targetId);
    if (!target) continue;
    const cx = placement.box.x + placement.box.width / 2;
    const cy = placement.box.y + placement.box.height / 2;

    if (placement.leader) {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(target.labelPoint.x));
      line.setAttribute('y1', String(target.labelPoint.y));
      line.setAttribute('x2', String(cx));
      line.setAttribute('y2', String(cy));
      line.setAttribute('stroke', cssVar(TOKEN.labelColorMuted));
      line.setAttribute('stroke-width', '0.75');
      svg.appendChild(line);
    }

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', String(cx));
    text.setAttribute('y', String(cy));
    text.setAttribute('fill', cssVar(TOKEN.labelColor));
    text.setAttribute('font-size', '12');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = target.name;
    svg.appendChild(text);
  }

  return suppressed.length;
}

interface SceneSpec {
  title: string;
  targetStates: Map<string, TargetState>;
  phase: Phase;
  armedTargetId?: string;
  showLabels: boolean;
}

function renderScene(spec: SceneSpec): { el: HTMLElement; suppressedCount: number } {
  const wrapper = document.createElement('div');
  wrapper.className = 'scene';

  const heading = document.createElement('h2');
  heading.textContent = spec.title;
  wrapper.appendChild(heading);

  const frame = document.createElement('div');
  frame.className = 'scene-frame';
  wrapper.appendChild(frame);

  const surface = createMapSurface(frame, pack, geometrySvg);
  surface.setPhase(spec.phase);
  surface.applyState(
    session({ targetStates: spec.targetStates, armedTargetId: spec.armedTargetId ?? null }),
  );
  surface.el.appendChild(createCompassRose(pack.viewBox));

  const suppressedCount = spec.showLabels ? renderLabels(surface.el, spec.targetStates) : 0;
  return { el: wrapper, suppressedCount };
}

const solved = allIds.slice(0, 15).map((id): [string, TargetState] => [id, 'solved']);
const retried = allIds.slice(15, 18).map((id): [string, TargetState] => [id, 'solvedRetry']);
const missed = allIds.map((id): [string, TargetState] => [id, 'missed']);
const allSolved = allIds.map((id): [string, TargetState] => [id, 'solved']);

const scenes: SceneSpec[] = [
  {
    title: '1. preview — all unsolved, no labels',
    targetStates: withStates([]),
    phase: 'preview',
    showLabels: false,
  },
  {
    title: '2. play — 15 solved, 3 solvedRetry, 1 armed',
    targetStates: withStates([...solved, ...retried]),
    phase: 'play',
    armedTargetId: allIds[18]!,
    showLabels: true,
  },
  {
    title: '3. results — give-up, all 52 revealed missed',
    targetStates: withStates(missed),
    phase: 'results',
    showLabels: true,
  },
  {
    title: '4. results — fully solved',
    targetStates: withStates(allSolved),
    phase: 'results',
    showLabels: true,
  },
];

const root = document.getElementById('harness');
if (!root) throw new Error('#harness missing from dev/harness.html');

for (const spec of scenes) {
  const { el, suppressedCount } = renderScene(spec);
  root.appendChild(el);
  if (spec.showLabels) console.log(`${spec.title}: ${suppressedCount} suppressed label(s)`);
}
