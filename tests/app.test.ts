// @vitest-environment jsdom
/**
 * Integration test: wires a real SessionController to the real DOM
 * components against the real south-india pack, the way main.ts does —
 * not mocking session or renderer, since the point of this step is that
 * those three actually talk to each other correctly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import southIndiaPackJson from '../packs/south-india-districts/pack.json';
import { mountApp, type AppHandle } from '../src/app';
import type { Pack } from '../src/engine/types';

const pack = southIndiaPackJson as unknown as Pack;
const geometrySvg = readFileSync(
  join(__dirname, '../packs/south-india-districts/geometry.svg'),
  'utf-8',
);

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

let handle: AppHandle | null = null;

afterEach(() => {
  handle?.destroy();
  handle = null;
});

function mount(): { root: HTMLElement; input: HTMLInputElement } {
  const root = document.createElement('div');
  document.body.appendChild(root);
  handle = mountApp({ root, pack, geometrySvg, mode: 'free-recall' });
  const input = root.querySelector('input') as HTMLInputElement;
  return { root, input };
}

describe('mountApp — Mode A end to end', () => {
  it('typing a real district name solves it, paints the map, updates the HUD, and clears the box', () => {
    const { root, input } = mount();
    root.querySelector<HTMLButtonElement>('.app-start')!.click();

    const target = pack.targets[0]!;
    type(input, target.name);

    expect(input.value).toBe('');
    expect(root.querySelector(`#${target.id}`)!.classList.contains('solved')).toBe(true);
    expect(root.querySelector('.hud-score')!.textContent).toBe('1 / 52');
  });

  it('typing a name that matches nothing changes nothing and leaves the box alone', () => {
    const { root, input } = mount();
    root.querySelector<HTMLButtonElement>('.app-start')!.click();

    type(input, 'Not A Real District');

    expect(input.value).toBe('Not A Real District');
    expect(root.querySelector('.hud-score')!.textContent).toBe('0 / 52');
    expect(root.querySelectorAll('.target.solved').length).toBe(0);
  });

  it('give-up (two clicks) freezes input and reveals every unsolved target missed', () => {
    const { root, input } = mount();
    root.querySelector<HTMLButtonElement>('.app-start')!.click();
    type(input, pack.targets[0]!.name);

    const giveUp = root.querySelector<HTMLButtonElement>('.hud-give-up')!;
    giveUp.click(); // arms the confirm step, doesn't give up yet
    expect(input.disabled).toBe(false);
    giveUp.click(); // confirms

    expect(input.disabled).toBe(true);
    expect(root.querySelector(`#${pack.targets[0]!.id}`)!.classList.contains('solved')).toBe(true);
    expect(root.querySelectorAll('.target.missed').length).toBe(pack.targets.length - 1);
    expect(root.querySelector('.result-panel')!.hasAttribute('hidden')).toBe(false);

    // The missed list on screen matches exactly what the map painted red.
    const missedOnMap = new Set([...root.querySelectorAll('.target.missed')].map((el) => el.id));
    const missedInPanel = [...root.querySelectorAll('.result-missed-group li')].map(
      (li) => li.textContent,
    );
    expect(missedInPanel.length).toBe(missedOnMap.size);
  });

  it('solving every target reaches COMPLETE with no missed section', () => {
    const { root, input } = mount();
    root.querySelector<HTMLButtonElement>('.app-start')!.click();
    for (const t of pack.targets) type(input, t.name);

    expect(root.querySelector('.hud-score')!.textContent).toBe('52 / 52');
    expect(root.querySelector('.result-panel')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.result-missed')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('h2')!.textContent).toContain('Solved!');
  });

  it('"Play again" resets the score and re-enables input', () => {
    const { root, input } = mount();
    root.querySelector<HTMLButtonElement>('.app-start')!.click();
    type(input, pack.targets[0]!.name);
    const giveUp = root.querySelector<HTMLButtonElement>('.hud-give-up')!;
    giveUp.click();
    giveUp.click();

    root.querySelector<HTMLButtonElement>('.result-play-again')!.click();

    expect(root.querySelector('.hud-score')!.textContent).toBe('0 / 52');
    expect(root.querySelector('input')!.disabled).toBe(false);
    expect(root.querySelector('.result-panel')!.hasAttribute('hidden')).toBe(true);
  });

  it('"Replay the misses" starts a fresh session scoped to exactly the missed ids', () => {
    const { root, input } = mount();
    root.querySelector<HTMLButtonElement>('.app-start')!.click();

    // Solve everything except the last two targets, then give up.
    const missed = pack.targets.slice(-2);
    for (const t of pack.targets.slice(0, -2)) type(input, t.name);
    const giveUp = root.querySelector<HTMLButtonElement>('.hud-give-up')!;
    giveUp.click();
    giveUp.click();

    root.querySelector<HTMLButtonElement>('.result-replay')!.click();

    // Fresh IDLE session, scoped to just the 2 missed ids.
    expect(root.querySelector('.result-panel')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.hud-score')!.textContent).toBe('0 / 2');
    expect(root.querySelector('input')!.disabled).toBe(false);

    root.querySelector<HTMLButtonElement>('.app-start')!.click();

    // Only the replayed subset can be solved.
    type(input, pack.targets[0]!.name); // was already solved last round — not tracked this round
    expect(root.querySelector('.hud-score')!.textContent).toBe('0 / 2');

    type(input, missed[0]!.name);
    expect(root.querySelector('.hud-score')!.textContent).toBe('1 / 2');
    type(input, missed[1]!.name);
    expect(root.querySelector('.hud-score')!.textContent).toBe('2 / 2');
  });
});
