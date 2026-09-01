import { describe, expect, it } from 'vitest';
import southIndiaPackJson from '../packs/south-india-districts/pack.json';
import { SessionController } from '../src/engine/session';
import type { Pack, Target } from '../src/engine/types';

const southIndiaPack = southIndiaPackJson as unknown as Pack;

function makeTarget(id: string, name: string, aliases: string[] = []): Target {
  return {
    id,
    name,
    aliases,
    groupId: 'g',
    pathId: id,
    labelPoint: { x: 0, y: 0 },
    labelAnchor: 'n',
    tier: 1,
  };
}

function makePack(targets: Target[]): Pack {
  return {
    id: 'test-pack',
    title: 'Test Pack',
    subtitle: 'fixture',
    attribution: 'test',
    viewBox: [0, 0, 100, 100],
    groups: [{ id: 'g', name: 'Group', fillToken: 'region-primary' }],
    targets,
  };
}

/** Manually-advanced clock so timer-driven tests never wait on real time. */
function fakeClock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('Mode A — Free Recall', () => {
  it('solves all 52 south-india targets by typing, reaching COMPLETE', () => {
    const session = new SessionController(southIndiaPack, 'free-recall');
    session.start();
    for (const target of southIndiaPack.targets) {
      const before = session.session.status;
      expect(before).toBe('running');
      session.submitAnswer(target.name);
    }
    expect(session.session.status).toBe('complete');
    expect([...session.session.targetStates.values()].every((s) => s === 'solved')).toBe(true);
  });

  it('resolves aliases, and solve-all resolves every duplicate-named target at once', () => {
    const pack = makePack([
      makeTarget('a1', 'Realname', ['Nickname']),
      makeTarget('d1', 'Twin City'),
      makeTarget('d2', 'Twin City'),
    ]);
    const session = new SessionController(pack, 'free-recall');
    session.start();

    session.submitAnswer('Nickname');
    expect(session.session.targetStates.get('a1')).toBe('solved');
    expect(session.session.status).toBe('running');

    session.submitAnswer('Twin City');
    expect(session.session.targetStates.get('d1')).toBe('solved');
    expect(session.session.targetStates.get('d2')).toBe('solved');
    expect(session.session.status).toBe('complete');
  });

  it('does not change state on a miss', () => {
    const pack = makePack([makeTarget('a1', 'Realname')]);
    const session = new SessionController(pack, 'free-recall');
    session.start();
    const result = session.submitAnswer('totally wrong');
    expect(result.ok).toBe(true);
    expect(session.session.targetStates.get('a1')).toBe('unsolved');
  });
});

describe('Mode B — Pin & Name', () => {
  it('arm, wrong, wrong, correct -> solvedRetry with attempts 3, using the real pack', () => {
    const target = southIndiaPack.targets[0]!;
    const session = new SessionController(southIndiaPack, 'pin-and-name');
    session.start();

    expect(session.armTarget(target.id).ok).toBe(true);
    expect(session.submitAnswer('not it').ok).toBe(true);
    expect(session.submitAnswer('still not it').ok).toBe(true);
    expect(session.session.targetStates.get(target.id)).toBe('unsolved');
    expect(session.session.armedTargetId).toBe(target.id);

    expect(session.submitAnswer(target.name).ok).toBe(true);
    expect(session.session.targetStates.get(target.id)).toBe('solvedRetry');
    expect(session.session.attempts.get(target.id)).toBe(3);
    expect(session.session.armedTargetId).toBeNull();
  });

  it('rejects submitAnswer with nothing armed', () => {
    const pack = makePack([makeTarget('a1', 'Realname')]);
    const session = new SessionController(pack, 'pin-and-name');
    session.start();
    const result = session.submitAnswer('Realname');
    expect(result).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects arming an already-solved target', () => {
    const pack = makePack([makeTarget('a1', 'Realname')]);
    const session = new SessionController(pack, 'pin-and-name');
    session.start();
    session.armTarget('a1');
    session.submitAnswer('Realname');
    expect(session.session.targetStates.get('a1')).toBe('solved');

    const result = session.armTarget('a1');
    expect(result.ok).toBe(false);
  });

  it('correct on the first attempt solves cleanly, without retry tier', () => {
    const pack = makePack([makeTarget('a1', 'Realname')]);
    const session = new SessionController(pack, 'pin-and-name');
    session.start();
    session.armTarget('a1');
    session.submitAnswer('Realname');
    expect(session.session.targetStates.get('a1')).toBe('solved');
    expect(session.session.attempts.get('a1')).toBe(1);
  });
});

describe('give up', () => {
  it('marks exactly the unsolved set as missed, leaving solved targets alone', () => {
    const pack = makePack([
      makeTarget('a1', 'One'),
      makeTarget('a2', 'Two'),
      makeTarget('a3', 'Three'),
    ]);
    const session = new SessionController(pack, 'free-recall');
    session.start();
    session.submitAnswer('One');
    expect(session.session.targetStates.get('a1')).toBe('solved');

    const result = session.giveUp();
    expect(result.ok).toBe(true);
    expect(session.session.status).toBe('surrendered');
    expect(session.session.targetStates.get('a1')).toBe('solved');
    expect(session.session.targetStates.get('a2')).toBe('missed');
    expect(session.session.targetStates.get('a3')).toBe('missed');
  });

  it('rejects giveUp when not running', () => {
    const pack = makePack([makeTarget('a1', 'One')]);
    const session = new SessionController(pack, 'free-recall');
    expect(session.giveUp().ok).toBe(false); // still idle
  });
});

describe('timer expiry', () => {
  it('drives RUNNING -> TIMEOUT and fills unsolved targets missed', () => {
    const clock = fakeClock();
    const pack = makePack([makeTarget('a1', 'One'), makeTarget('a2', 'Two')]);
    const session = new SessionController(pack, 'free-recall', {
      budgetMs: 1_000,
      now: clock.now,
    });
    session.start();
    session.submitAnswer('One');

    clock.advance(999);
    expect(session.tick().ok).toBe(true);
    expect(session.session.status).toBe('running');

    clock.advance(1);
    expect(session.tick().ok).toBe(true);
    expect(session.session.status).toBe('timeout');
    expect(session.session.targetStates.get('a1')).toBe('solved');
    expect(session.session.targetStates.get('a2')).toBe('missed');
  });
});

describe('replay the misses', () => {
  it('produces a fresh idle session containing only the missed ids', () => {
    const pack = makePack([
      makeTarget('a1', 'One'),
      makeTarget('a2', 'Two'),
      makeTarget('a3', 'Three'),
    ]);
    const session = new SessionController(pack, 'free-recall');
    session.start();
    session.submitAnswer('One');
    session.giveUp();

    const replay = session.replayMisses();
    expect(replay.session.status).toBe('idle');
    expect(replay.session.mode).toBe('free-recall');
    expect([...replay.session.targetStates.keys()].sort()).toEqual(['a2', 'a3']);
    expect([...replay.session.targetStates.values()].every((s) => s === 'unsolved')).toBe(true);
  });
});

describe('subscribe', () => {
  it('fires on every real state change and not on rejected actions', () => {
    const pack = makePack([makeTarget('a1', 'One'), makeTarget('a2', 'Two')]);
    const session = new SessionController(pack, 'free-recall');
    let notifications = 0;
    session.subscribe(() => notifications++);

    session.start(); // real change
    expect(notifications).toBe(1);

    session.start(); // rejected: already running
    expect(notifications).toBe(1);

    session.submitAnswer('nope'); // miss: no change
    expect(notifications).toBe(1);

    session.submitAnswer('One'); // real change
    expect(notifications).toBe(2);

    session.giveUp(); // real change
    expect(notifications).toBe(3);

    session.giveUp(); // rejected: not running anymore
    expect(notifications).toBe(3);
  });

  it('unsubscribe stops further notifications', () => {
    const pack = makePack([makeTarget('a1', 'One')]);
    const session = new SessionController(pack, 'free-recall');
    let notifications = 0;
    const unsubscribe = session.subscribe(() => notifications++);
    session.start();
    expect(notifications).toBe(1);
    unsubscribe();
    session.submitAnswer('One');
    expect(notifications).toBe(1);
  });
});
