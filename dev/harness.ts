/// <reference types="vite/client" />
/**
 * Dev-only visual harness for eyeballing the renderer (mapSurface, which
 * now draws labels via labels.ts's createLabelLayer, plus the compass)
 * against docs/reference/south-india-labelled.png. Not a feature: nothing
 * in src/ imports this, and dev/harness.html is never referenced from the
 * shipped index.html, so `vite build`'s default single-entry (index.html)
 * never pulls either file into dist/.
 *
 * Renders four static scenes by fabricating a Session snapshot per scene
 * directly — no engine/SessionController involved, this is a renderer
 * fixture, not a gameplay flow.
 */
import geometrySvg from '../packs/south-india-districts/geometry.svg?raw';
import southIndiaPackJson from '../packs/south-india-districts/pack.json';
import { createCompassRose } from '../src/render/compass';
import { createMapSurface } from '../src/render/mapSurface';
import type { Pack, Session, TargetState } from '../src/engine/types';
import type { Phase } from '../src/render/theme';

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

interface SceneSpec {
  title: string;
  targetStates: Map<string, TargetState>;
  phase: Phase;
  armedTargetId?: string;
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
  const suppressed = surface.applyState(
    session({ targetStates: spec.targetStates, armedTargetId: spec.armedTargetId ?? null }),
  );
  surface.el.appendChild(createCompassRose(pack.viewBox));

  return { el: wrapper, suppressedCount: suppressed.length };
}

// Scene 2 draws its solved/retried/armed targets from *both* groups rather
// than a plain positional slice of allIds — a slice(0, 15) happens to be
// every Kerala district plus one, which leaves zero unsolved Kerala targets
// on screen and makes the muted-fill scene unable to show region-primary
// -muted at all (only region-secondary-muted). Pulling from each group
// keeps some of both unsolved so the play scene actually exercises (and a
// screenshot can actually judge) both muted base fills side by side.
function idsForGroup(groupId: string): string[] {
  return pack.targets.filter((t) => t.groupId === groupId).map((t) => t.id);
}
const keralaIds = idsForGroup('kerala');
const tamilNaduIds = idsForGroup('tamil-nadu');

const solved = [...keralaIds.slice(0, 8), ...tamilNaduIds.slice(0, 7)].map(
  (id): [string, TargetState] => [id, 'solved'],
);
const retried = tamilNaduIds.slice(7, 10).map((id): [string, TargetState] => [id, 'solvedRetry']);
const armedTargetId = tamilNaduIds[10]!;
const missed = allIds.map((id): [string, TargetState] => [id, 'missed']);
const allSolved = allIds.map((id): [string, TargetState] => [id, 'solved']);

const scenes: SceneSpec[] = [
  {
    title: '1. preview — all unsolved, no labels',
    targetStates: withStates([]),
    phase: 'preview',
  },
  {
    title: '2. play — 15 solved, 3 solvedRetry, 1 armed',
    targetStates: withStates([...solved, ...retried]),
    phase: 'play',
    armedTargetId,
  },
  {
    title: '3. give-up — all 52 revealed missed, labels shown',
    targetStates: withStates(missed),
    phase: 'results',
  },
  {
    title: '4. results — fully solved',
    targetStates: withStates(allSolved),
    phase: 'results',
  },
];

const root = document.getElementById('harness');
if (!root) throw new Error('#harness missing from dev/harness.html');

for (const spec of scenes) {
  const { el, suppressedCount } = renderScene(spec);
  root.appendChild(el);
  console.log(`${spec.title}: ${suppressedCount} suppressed label(s)`);
}
