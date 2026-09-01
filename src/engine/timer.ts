/**
 * Countdown timer for a session's time budget. Pure logic — no DOM, no
 * setInterval. The caller (session/UI layer) polls `elapsedMs`/`remainingMs`/
 * `isExpired` on whatever cadence it likes; this module never dispatches
 * events or touches session state itself.
 */

/** budgetMs = max(180s, 8s per target), per the PRD. */
export function computeBudgetMs(targetCount: number): number {
  return Math.max(180_000, 8_000 * targetCount);
}

/**
 * A pausable countdown against `budgetMs`. Takes a time source so tests can
 * drive it without waiting in real time — defaults to `performance.now`.
 */
export class CountdownTimer {
  readonly budgetMs: number;
  private readonly now: () => number;
  /** Elapsed time banked from completed running segments (excludes the current one). */
  private bankedMs = 0;
  /** Timestamp the current running segment began, or null while paused/stopped. */
  private segmentStart: number | null = null;
  private stopped = false;

  constructor(budgetMs: number, now: () => number = () => performance.now()) {
    this.budgetMs = budgetMs;
    this.now = now;
  }

  /** Begins (or resumes) counting. No-op if already running or stopped. */
  start(): void {
    if (this.stopped || this.segmentStart !== null) return;
    this.segmentStart = this.now();
  }

  /** Freezes elapsed time. No-op if already paused or stopped. */
  pause(): void {
    if (this.segmentStart === null) return;
    this.bankedMs += this.now() - this.segmentStart;
    this.segmentStart = null;
  }

  /** Alias for `start` — resumes after a `pause`. */
  resume(): void {
    this.start();
  }

  /** Freezes elapsed time permanently; start/resume become no-ops after this. */
  stop(): void {
    this.pause();
    this.stopped = true;
  }

  /** Total time counted so far, running segment included. */
  elapsedMs(): number {
    if (this.segmentStart === null) return this.bankedMs;
    return this.bankedMs + (this.now() - this.segmentStart);
  }

  /** Time left in the budget, floored at 0. */
  remainingMs(): number {
    return Math.max(0, this.budgetMs - this.elapsedMs());
  }

  /** True once elapsed reaches the budget (inclusive of the boundary). */
  isExpired(): boolean {
    return this.elapsedMs() >= this.budgetMs;
  }
}
