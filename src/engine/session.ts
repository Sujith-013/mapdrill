/**
 * Session state machine, per docs/PRD.md:
 *
 *   IDLE -> RUNNING -> (COMPLETE | SURRENDERED | TIMEOUT)
 *   Mode B additionally: RUNNING <-> ARMED(targetId)
 *
 * `SessionController` owns the pack, target/attempt state, the armed
 * target, the timer, and every transition rule. Everything else — the UI
 * layer, the two modes' submit logic — asks it to act and reads the
 * broadcast `Session` snapshot. Pure logic: no DOM, no rendering, no event
 * listeners of its own; `subscribe` is the only way out.
 *
 * Transitions are explicit and total: an invalid one returns
 * `{ ok: false, reason }` rather than throwing or silently doing nothing.
 */
import { buildAliasIndex, type AliasIndex } from './matcher';
import * as freeRecall from './modes/freeRecall';
import * as pinAndName from './modes/pinAndName';
import { computeBudgetMs, CountdownTimer } from './timer';
import type { Mode, Pack, Session, Target } from './types';

export type ActionResult = { ok: true } | { ok: false; reason: string };

const ok: ActionResult = { ok: true };
const reject = (reason: string): ActionResult => ({ ok: false, reason });

export interface SessionOptions {
  /** Restrict tracked targets to this subset (used by replay-the-misses). Defaults to the whole pack. */
  targetIds?: Array<Target['id']>;
  /** Override the computed budget (defaults to `computeBudgetMs(trackedTargetCount)`). */
  budgetMs?: number;
  /** Time source for the internal timer. Defaults to `performance.now`. */
  now?: () => number;
}

export class SessionController {
  readonly pack: Pack;
  private readonly index: AliasIndex;
  private readonly timer: CountdownTimer;
  private readonly now: (() => number) | undefined;
  private data: Session;
  private readonly listeners = new Set<(session: Session) => void>();

  constructor(pack: Pack, mode: Mode, options: SessionOptions = {}) {
    this.pack = pack;
    this.index = buildAliasIndex(pack.targets);
    this.now = options.now;

    const targetIds = options.targetIds ?? pack.targets.map((t) => t.id);
    const budgetMs = options.budgetMs ?? computeBudgetMs(targetIds.length);
    this.timer = new CountdownTimer(budgetMs, this.now);

    this.data = {
      packId: pack.id,
      mode,
      status: 'idle',
      armedTargetId: null,
      targetStates: new Map(targetIds.map((id) => [id, 'unsolved'])),
      attempts: new Map(),
      elapsedMs: 0,
      budgetMs,
    };
  }

  /** Current state snapshot. Treat as read-only — mutate only through actions. */
  get session(): Session {
    return this.data;
  }

  /** Registers `listener` for every real state change. Returns an unsubscribe function. */
  subscribe(listener: (session: Session) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.data = { ...this.data, elapsedMs: this.timer.elapsedMs() };
    for (const listener of this.listeners) listener(this.data);
  }

  /** IDLE -> RUNNING. Starts the timer. */
  start(): ActionResult {
    if (this.data.status !== 'idle') return reject('session is not idle');
    this.timer.start();
    this.data = { ...this.data, status: 'running' };
    this.notify();
    return ok;
  }

  /** Freezes the timer without changing session status. Valid only while running. */
  pause(): ActionResult {
    if (this.data.status !== 'running') return reject('session is not running');
    this.timer.pause();
    return ok;
  }

  /** Resumes a paused timer. Valid only while running. */
  resume(): ActionResult {
    if (this.data.status !== 'running') return reject('session is not running');
    this.timer.resume();
    return ok;
  }

  /**
   * Checks the timer and drives RUNNING -> TIMEOUT once the budget is
   * spent. Safe to call on any cadence, in any status — a no-op unless the
   * session is running and expired.
   */
  tick(): ActionResult {
    if (this.data.status !== 'running' || !this.timer.isExpired()) return ok;
    this.fillMissed();
    this.timer.stop();
    this.data = { ...this.data, status: 'timeout', armedTargetId: null };
    this.notify();
    return ok;
  }

  /** RUNNING/ARMED -> SURRENDERED: fills unsolved targets 'missed', freezes the timer. */
  giveUp(): ActionResult {
    if (this.data.status !== 'running') return reject('session is not running');
    this.fillMissed();
    this.timer.stop();
    this.data = { ...this.data, status: 'surrendered', armedTargetId: null };
    this.notify();
    return ok;
  }

  private fillMissed(): void {
    const targetStates = new Map(this.data.targetStates);
    for (const [id, state] of targetStates) {
      if (state === 'unsolved') targetStates.set(id, 'missed');
    }
    this.data = { ...this.data, targetStates };
  }

  /** Mode B only: RUNNING -> ARMED(id). Rejects an already-solved or unknown target. */
  armTarget(id: Target['id']): ActionResult {
    if (this.data.mode !== 'pin-and-name') return reject('armTarget is Mode B only');
    if (this.data.status !== 'running') return reject('session is not running');
    const state = this.data.targetStates.get(id);
    if (state === undefined) return reject('unknown target');
    if (state !== 'unsolved') return reject('target already solved');
    this.data = { ...this.data, armedTargetId: id };
    this.notify();
    return ok;
  }

  /** Mode B only: ARMED -> RUNNING without answering (Esc / click elsewhere). */
  disarm(): ActionResult {
    if (this.data.mode !== 'pin-and-name') return reject('disarm is Mode B only');
    if (this.data.armedTargetId === null) return reject('nothing armed');
    this.data = { ...this.data, armedTargetId: null };
    this.notify();
    return ok;
  }

  /**
   * Mode A: matches `input` against every unsolved target (solve-all).
   * Mode B: matches `input` against the armed target only; requires one to
   * be armed first.
   */
  submitAnswer(input: string): ActionResult {
    if (this.data.status !== 'running') return reject('session is not running');
    return this.data.mode === 'free-recall'
      ? this.submitFreeRecall(input)
      : this.submitPinAndName(input);
  }

  private submitFreeRecall(input: string): ActionResult {
    const unsolvedIds = new Set(
      [...this.data.targetStates].filter(([, s]) => s === 'unsolved').map(([id]) => id),
    );
    const result = freeRecall.submitAnswer(input, this.index, unsolvedIds);
    if (result.solvedIds.length === 0) return ok; // miss: no penalty, no state change

    const targetStates = new Map(this.data.targetStates);
    for (const id of result.solvedIds) targetStates.set(id, 'solved');
    this.data = { ...this.data, targetStates };
    this.checkComplete();
    this.notify();
    return ok;
  }

  private submitPinAndName(input: string): ActionResult {
    const armedId = this.data.armedTargetId;
    if (armedId === null) return reject('nothing armed');

    const previousAttempts = this.data.attempts.get(armedId) ?? 0;
    const result = pinAndName.submitAnswer(input, this.index, armedId, previousAttempts);

    const attempts = new Map(this.data.attempts);
    attempts.set(armedId, result.attempts);
    this.data = { ...this.data, attempts };

    if (result.state !== null) {
      const targetStates = new Map(this.data.targetStates);
      targetStates.set(armedId, result.state);
      this.data = { ...this.data, targetStates, armedTargetId: null };
      this.checkComplete();
    }
    this.notify();
    return ok;
  }

  private checkComplete(): void {
    const solved = [...this.data.targetStates.values()].every(
      (s) => s === 'solved' || s === 'solvedRetry',
    );
    if (!solved) return;
    this.timer.stop();
    this.data = { ...this.data, status: 'complete', armedTargetId: null };
  }

  /** Builds a fresh IDLE session over the same pack and mode, tracking only the missed ids. */
  replayMisses(): SessionController {
    const missedIds = [...this.data.targetStates]
      .filter(([, s]) => s === 'missed')
      .map(([id]) => id);
    return new SessionController(this.pack, this.data.mode, {
      targetIds: missedIds,
      ...(this.now ? { now: this.now } : {}),
    });
  }
}
