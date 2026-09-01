import { describe, expect, it } from 'vitest';
import { score } from '../src/engine/scoring';
import type { Mode, Session, TargetState } from '../src/engine/types';

function session(
  mode: Mode,
  states: Array<[string, TargetState]>,
  attempts: [string, number][] = [],
): Session {
  return {
    packId: 'test-pack',
    mode,
    status: 'running',
    armedTargetId: null,
    targetStates: new Map(states),
    attempts: new Map(attempts),
    elapsedMs: 0,
    budgetMs: null,
  };
}

describe('score', () => {
  it('handles 0 solved', () => {
    const s = session('free-recall', [
      ['a', 'unsolved'],
      ['b', 'unsolved'],
    ]);
    const result = score(s);
    expect(result.solved).toBe(0);
    expect(result.total).toBe(2);
    expect(result.score).toBe(0);
  });

  it('handles all solved', () => {
    const s = session('free-recall', [
      ['a', 'solved'],
      ['b', 'solved'],
    ]);
    const result = score(s);
    expect(result.solved).toBe(2);
    expect(result.score).toBe(1);
  });

  it('counts solved and solvedRetry together toward score', () => {
    const s = session('pin-and-name', [
      ['a', 'solved'],
      ['b', 'solvedRetry'],
      ['c', 'unsolved'],
      ['d', 'missed'],
    ]);
    const result = score(s);
    expect(result.solved).toBe(2);
    expect(result.total).toBe(4);
    expect(result.score).toBe(0.5);
    expect(result.counts).toEqual({ unsolved: 1, solved: 1, solvedRetry: 1, missed: 1 });
    expect(result.missedIds).toEqual(['d']);
  });

  it('computes clean for Mode B, excluding retried solves', () => {
    const s = session(
      'pin-and-name',
      [
        ['a', 'solved'],
        ['b', 'solvedRetry'],
        ['c', 'solved'],
        ['d', 'unsolved'],
      ],
      [
        ['a', 1],
        ['b', 3],
        ['c', 1],
      ],
    );
    const result = score(s);
    // firstAttemptSolves = a, c -> 2 of 4
    expect(result.clean).toBe(0.5);
  });

  it('clean is null for free-recall sessions', () => {
    const s = session('free-recall', [['a', 'solved']], [['a', 1]]);
    expect(score(s).clean).toBeNull();
  });

  it('exposes attempts and does not mutate the session', () => {
    const s = session('pin-and-name', [['a', 'solvedRetry']], [['a', 2]]);
    const before = JSON.stringify([...s.targetStates]);
    const result = score(s);
    expect(result.attempts.get('a')).toBe(2);
    expect(JSON.stringify([...s.targetStates])).toBe(before);
  });

  it('handles an empty target set without dividing by zero', () => {
    const s = session('pin-and-name', []);
    const result = score(s);
    expect(result.score).toBe(0);
    expect(result.clean).toBe(0);
    expect(result.total).toBe(0);
  });
});
