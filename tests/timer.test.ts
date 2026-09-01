import { describe, expect, it } from 'vitest';
import { computeBudgetMs, CountdownTimer } from '../src/engine/timer';

/** Manually-advanced clock so tests never wait on real time. */
function fakeClock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('computeBudgetMs', () => {
  it('applies the 180s floor for small packs', () => {
    expect(computeBudgetMs(1)).toBe(180_000);
    expect(computeBudgetMs(10)).toBe(180_000);
  });

  it('uses 8s per target once that exceeds the floor', () => {
    expect(computeBudgetMs(30)).toBe(240_000);
    expect(computeBudgetMs(100)).toBe(800_000);
  });
});

describe('CountdownTimer', () => {
  it('tracks elapsed time as the clock advances', () => {
    const clock = fakeClock();
    const timer = new CountdownTimer(10_000, clock.now);
    timer.start();
    clock.advance(2_500);
    expect(timer.elapsedMs()).toBe(2_500);
  });

  it('conserves elapsed time exactly across pause/resume', () => {
    const clock = fakeClock();
    const timer = new CountdownTimer(10_000, clock.now);
    timer.start();
    clock.advance(1_000);
    timer.pause();
    clock.advance(5_000); // time passes while paused — must not count
    expect(timer.elapsedMs()).toBe(1_000);
    timer.resume();
    clock.advance(1_000);
    expect(timer.elapsedMs()).toBe(2_000);
    timer.pause();
    clock.advance(4_000);
    timer.resume();
    clock.advance(500);
    expect(timer.elapsedMs()).toBe(2_500);
  });

  it('stop freezes elapsed time permanently', () => {
    const clock = fakeClock();
    const timer = new CountdownTimer(10_000, clock.now);
    timer.start();
    clock.advance(3_000);
    timer.stop();
    clock.advance(9_999);
    expect(timer.elapsedMs()).toBe(3_000);
    timer.start(); // no-op once stopped
    clock.advance(1_000);
    expect(timer.elapsedMs()).toBe(3_000);
  });

  it('remainingMs counts down and floors at 0', () => {
    const clock = fakeClock();
    const timer = new CountdownTimer(1_000, clock.now);
    timer.start();
    clock.advance(400);
    expect(timer.remainingMs()).toBe(600);
    clock.advance(1_000);
    expect(timer.remainingMs()).toBe(0);
  });

  it('is not expired before the budget is reached', () => {
    const clock = fakeClock();
    const timer = new CountdownTimer(1_000, clock.now);
    timer.start();
    clock.advance(999);
    expect(timer.isExpired()).toBe(false);
  });

  it('expires exactly at the boundary', () => {
    const clock = fakeClock();
    const timer = new CountdownTimer(1_000, clock.now);
    timer.start();
    clock.advance(1_000);
    expect(timer.isExpired()).toBe(true);
  });

  it('defaults the time source to performance.now', () => {
    const timer = new CountdownTimer(1_000);
    timer.start();
    expect(timer.elapsedMs()).toBeGreaterThanOrEqual(0);
  });
});
