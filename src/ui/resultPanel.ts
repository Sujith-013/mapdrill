/**
 * End-of-session summary: shown on session COMPLETE or SURRENDERED (also
 * TIMEOUT, which behaves identically per the PRD). Pure DOM component —
 * setState renders exactly the Session/Pack/ScoreBreakdown it's handed,
 * same "no internal game logic" rule as hud.ts, just with more to lay out:
 * final score, time taken, and the missed-targets list grouped by
 * pack.groups and sorted by tier within each group.
 *
 * On COMPLETE with no misses (the clean-sweep case) the missed section is
 * omitted entirely. On COMPLETE with solvedRetry entries but no misses
 * (Mode B, some targets took more than one try), the same grouped-list
 * layout is reused but framed as "took more than one try" rather than
 * "missed" — and unlike a real miss, there's nothing to replay, so the
 * replay button stays hidden for that case.
 */
import type { ScoreBreakdown } from '../engine/scoring';
import type { Group, Pack, Session, Target } from '../engine/types';
import { formatTime } from './hud';

export interface ResultPanelState {
  session: Session;
  pack: Pack;
  breakdown: ScoreBreakdown;
}

export interface ResultPanel {
  el: HTMLElement;
  setState(state: ResultPanelState): void;
  onReplayMisses(handler: () => void): void;
  onPlayAgain(handler: () => void): void;
  destroy(): void;
}

/** Every id in `ids`, as its full Target, grouped by pack.groups (in pack order) and tier-sorted within each group. */
function groupByPackGroup(
  ids: ReadonlyArray<Target['id']>,
  pack: Pack,
): Array<{ group: Group; targets: Target[] }> {
  const targetById = new Map(pack.targets.map((t) => [t.id, t]));
  const byGroup = new Map<Group['id'], Target[]>();
  for (const id of ids) {
    const target = targetById.get(id);
    if (!target) continue;
    const list = byGroup.get(target.groupId);
    if (list) list.push(target);
    else byGroup.set(target.groupId, [target]);
  }
  return pack.groups
    .filter((g) => byGroup.has(g.id))
    .map((g) => ({
      group: g,
      targets: byGroup
        .get(g.id)!
        .slice()
        .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)),
    }));
}

function describeStatus(status: Session['status'], solved: number, total: number): string {
  switch (status) {
    case 'complete':
      return `Solved! ${solved} / ${total}`;
    case 'surrendered':
      return `Gave up — ${solved} / ${total}`;
    case 'timeout':
      return `Time's up — ${solved} / ${total}`;
    default:
      return `${solved} / ${total}`;
  }
}

export function createResultPanel(): ResultPanel {
  const el = document.createElement('div');
  el.className = 'result-panel';
  el.hidden = true;

  const heading = document.createElement('h2');
  el.appendChild(heading);

  const timeTaken = document.createElement('div');
  timeTaken.className = 'result-time';
  el.appendChild(timeTaken);

  const missedSection = document.createElement('div');
  missedSection.className = 'result-missed';
  missedSection.hidden = true;
  const missedHeading = document.createElement('h3');
  missedSection.appendChild(missedHeading);
  const missedGroups = document.createElement('div');
  missedGroups.className = 'result-missed-groups';
  missedSection.appendChild(missedGroups);
  el.appendChild(missedSection);

  const actions = document.createElement('div');
  actions.className = 'result-actions';
  const replayButton = document.createElement('button');
  replayButton.type = 'button';
  replayButton.className = 'result-replay';
  replayButton.hidden = true;
  actions.appendChild(replayButton);
  const playAgainButton = document.createElement('button');
  playAgainButton.type = 'button';
  playAgainButton.className = 'result-play-again';
  playAgainButton.textContent = 'Play again';
  actions.appendChild(playAgainButton);
  el.appendChild(actions);

  let replayHandler: (() => void) | null = null;
  let playAgainHandler: (() => void) | null = null;
  function handleReplayClick(): void {
    replayHandler?.();
  }
  function handlePlayAgainClick(): void {
    playAgainHandler?.();
  }
  replayButton.addEventListener('click', handleReplayClick);
  playAgainButton.addEventListener('click', handlePlayAgainClick);

  return {
    el,
    setState({ session, pack, breakdown }) {
      heading.textContent = describeStatus(session.status, breakdown.solved, breakdown.total);
      timeTaken.textContent = `Time: ${formatTime(session.elapsedMs)}`;

      // Real misses (give-up/timeout) vs. Mode B's "took more than one try"
      // (a clean COMPLETE) are mutually exclusive: a target is either
      // 'missed' or 'solvedRetry', never both, so at most one list ever has
      // entries for a given session.
      const missedIds = breakdown.missedIds;
      const retryIds = [...session.targetStates]
        .filter(([, state]) => state === 'solvedRetry')
        .map(([id]) => id);
      const [listIds, heading2, replayable] =
        missedIds.length > 0
          ? ([missedIds, `Missed (${missedIds.length})`, true] as const)
          : ([retryIds, `Took more than one try (${retryIds.length})`, false] as const);

      if (listIds.length === 0) {
        missedSection.hidden = true;
      } else {
        missedSection.hidden = false;
        missedHeading.textContent = heading2;
        missedGroups.replaceChildren();
        for (const { group, targets } of groupByPackGroup(listIds, pack)) {
          const groupEl = document.createElement('div');
          groupEl.className = 'result-missed-group';
          const groupHeading = document.createElement('h4');
          groupHeading.textContent = group.name;
          groupEl.appendChild(groupHeading);
          const list = document.createElement('ul');
          for (const target of targets) {
            const item = document.createElement('li');
            item.textContent = target.name;
            list.appendChild(item);
          }
          groupEl.appendChild(list);
          missedGroups.appendChild(groupEl);
        }
      }

      replayButton.hidden = !replayable;
      if (replayable) replayButton.textContent = `Replay the misses (${missedIds.length})`;
    },
    onReplayMisses(handler) {
      replayHandler = handler;
    },
    onPlayAgain(handler) {
      playAgainHandler = handler;
    },
    destroy() {
      replayButton.removeEventListener('click', handleReplayClick);
      playAgainButton.removeEventListener('click', handlePlayAgainClick);
      el.remove();
    },
  };
}
