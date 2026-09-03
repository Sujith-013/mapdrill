// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { score } from '../src/engine/scoring';
import type { Pack, Session, Target, TargetState } from '../src/engine/types';
import { createResultPanel } from '../src/ui/resultPanel';

function makeTarget(id: string, name: string, groupId: string, tier: 1 | 2 | 3): Target {
  return {
    id,
    name,
    aliases: [],
    groupId,
    pathId: id,
    labelPoint: { x: 0, y: 0 },
    labelAnchor: 'n',
    tier,
  };
}

// Groups declared Tamil Nadu first — deliberately not alphabetical/insertion
// order of the targets below, so a passing "grouped by pack.groups" test
// can't be an accident of iteration order.
const pack: Pack = {
  id: 'test-pack',
  title: 'Test Pack',
  subtitle: 'fixture',
  attribution: 'test',
  viewBox: [0, 0, 100, 100],
  groups: [
    { id: 'tamil-nadu', name: 'Tamil Nadu', fillToken: 'region-secondary' },
    { id: 'kerala', name: 'Kerala', fillToken: 'region-primary' },
  ],
  targets: [
    makeTarget('k-hi', 'Kerala Tier1', 'kerala', 1),
    makeTarget('k-lo', 'Kerala Tier2', 'kerala', 2),
    makeTarget('tn-hi', 'TN Tier1', 'tamil-nadu', 1),
    makeTarget('tn-lo', 'TN Tier2', 'tamil-nadu', 2),
    makeTarget('solved-one', 'Solved One', 'kerala', 1),
  ],
};

function session(states: Record<string, TargetState>, overrides: Partial<Session> = {}): Session {
  return {
    packId: pack.id,
    mode: 'free-recall',
    status: 'surrendered',
    armedTargetId: null,
    targetStates: new Map(Object.entries(states)),
    attempts: new Map(),
    elapsedMs: 65_000,
    budgetMs: 180_000,
    ...overrides,
  };
}

function groupHeadings(panel: ReturnType<typeof createResultPanel>): string[] {
  return [...panel.el.querySelectorAll('.result-missed-group h4')].map((h) => h.textContent);
}

function namesIn(panel: ReturnType<typeof createResultPanel>, groupIndex: number): string[] {
  const group = panel.el.querySelectorAll('.result-missed-group')[groupIndex]!;
  return [...group.querySelectorAll('li')].map((li) => li.textContent);
}

describe('createResultPanel', () => {
  it('groups the missed list by pack.groups (pack order) and sorts by tier within each group', () => {
    const panel = createResultPanel();
    const s = session({
      'k-hi': 'missed',
      'k-lo': 'missed',
      'tn-hi': 'missed',
      'tn-lo': 'missed',
      'solved-one': 'solved',
    });
    panel.setState({ session: s, pack, breakdown: score(s) });

    expect(groupHeadings(panel)).toEqual(['Tamil Nadu', 'Kerala']); // pack.groups order, not insertion order
    expect(namesIn(panel, 0)).toEqual(['TN Tier1', 'TN Tier2']); // tier-ascending within the group
    expect(namesIn(panel, 1)).toEqual(['Kerala Tier1', 'Kerala Tier2']);
  });

  it('shows the missed heading, count, and a working replay button for a real miss', () => {
    const panel = createResultPanel();
    const s = session({ 'k-hi': 'missed', 'k-lo': 'solved' });
    panel.setState({ session: s, pack, breakdown: score(s) });

    expect(panel.el.querySelector('.result-missed')!.hasAttribute('hidden')).toBe(false);
    expect(panel.el.querySelector('h3')!.textContent).toBe('Missed (1)');
    const replay = panel.el.querySelector<HTMLButtonElement>('.result-replay')!;
    expect(replay.hidden).toBe(false);

    const handler = vi.fn();
    panel.onReplayMisses(handler);
    replay.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('renders no missed section on a clean COMPLETE (zero misses, zero retries)', () => {
    const panel = createResultPanel();
    const s = session(
      { 'k-hi': 'solved', 'k-lo': 'solved', 'tn-hi': 'solved', 'tn-lo': 'solved' },
      { status: 'complete' },
    );
    panel.setState({ session: s, pack, breakdown: score(s) });

    expect(panel.el.querySelector('.result-missed')!.hasAttribute('hidden')).toBe(true);
    expect(panel.el.querySelector<HTMLButtonElement>('.result-replay')!.hidden).toBe(true);
    expect(panel.el.querySelector('h2')!.textContent).toContain('Solved!');
  });

  it('on COMPLETE with solvedRetry entries, frames the list as "took more than one try" and hides replay', () => {
    const panel = createResultPanel();
    const s = session(
      { 'k-hi': 'solved', 'k-lo': 'solvedRetry', 'tn-hi': 'solvedRetry', 'tn-lo': 'solved' },
      { status: 'complete', mode: 'pin-and-name' },
    );
    panel.setState({ session: s, pack, breakdown: score(s) });

    expect(panel.el.querySelector('.result-missed')!.hasAttribute('hidden')).toBe(false);
    expect(panel.el.querySelector('h3')!.textContent).toBe('Took more than one try (2)');
    expect(panel.el.querySelector<HTMLButtonElement>('.result-replay')!.hidden).toBe(true);
  });

  it('play again fires onPlayAgain', () => {
    const panel = createResultPanel();
    const handler = vi.fn();
    panel.onPlayAgain(handler);
    panel.el.querySelector<HTMLButtonElement>('.result-play-again')!.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
