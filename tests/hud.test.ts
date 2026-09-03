// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createHud } from '../src/ui/hud';

function score(hud: ReturnType<typeof createHud>): string | null {
  return hud.el.querySelector('.hud-score')!.textContent;
}

function time(hud: ReturnType<typeof createHud>): string | null {
  return hud.el.querySelector('.hud-timer')!.textContent;
}

function giveUpButton(hud: ReturnType<typeof createHud>): HTMLButtonElement {
  return hud.el.querySelector('.hud-give-up')!;
}

describe('createHud', () => {
  it('renders score as "solved / total"', () => {
    const hud = createHud();
    hud.setState({ solved: 12, total: 52, remainingMs: 0, isPaused: false });
    expect(score(hud)).toBe('12 / 52');
  });

  it('renders remainingMs as mm:ss', () => {
    const hud = createHud();
    hud.setState({ solved: 0, total: 52, remainingMs: 125_000, isPaused: false });
    expect(time(hud)).toBe('02:05');
  });

  it('renders "--:--" for an untimed session', () => {
    const hud = createHud();
    hud.setState({ solved: 0, total: 52, remainingMs: null, isPaused: false });
    expect(time(hud)).toBe('--:--');
  });

  it('give-up requires a second click before firing onGiveUpClick', () => {
    const hud = createHud();
    const handler = vi.fn();
    hud.onGiveUpClick(handler);

    giveUpButton(hud).click();
    expect(handler).not.toHaveBeenCalled();

    giveUpButton(hud).click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('reverts the confirm state after a click elsewhere lands another give-up click later', () => {
    vi.useFakeTimers();
    const hud = createHud();
    const handler = vi.fn();
    hud.onGiveUpClick(handler);

    giveUpButton(hud).click();
    expect(giveUpButton(hud).classList.contains('confirming')).toBe(true);

    vi.advanceTimersByTime(3001);
    expect(giveUpButton(hud).classList.contains('confirming')).toBe(false);

    giveUpButton(hud).click();
    expect(handler).not.toHaveBeenCalled(); // confirm state had reverted, this is a fresh first click

    vi.useRealTimers();
  });

  it('fires onPauseClick and reflects isPaused in the button label', () => {
    const hud = createHud();
    const handler = vi.fn();
    hud.onPauseClick(handler);

    hud.el.querySelector<HTMLButtonElement>('.hud-pause')!.click();
    expect(handler).toHaveBeenCalledTimes(1);

    hud.setState({ solved: 0, total: 52, remainingMs: 0, isPaused: true });
    expect(hud.el.querySelector('.hud-pause')!.textContent).toBe('Resume');
  });
});
