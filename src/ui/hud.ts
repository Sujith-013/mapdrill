/**
 * Score, countdown timer, pause button, and the give-up action. Pure DOM
 * component: no import from engine/, no session awareness, no timer of its
 * own — setState renders exactly the numbers it's handed, nothing derived.
 */
export interface HudState {
  solved: number;
  total: number;
  /** Time left in the session's budget; null renders "--:--" (untimed). */
  remainingMs: number | null;
  isPaused: boolean;
}

export interface Hud {
  el: HTMLElement;
  setState(state: HudState): void;
  onPauseClick(handler: () => void): void;
  onGiveUpClick(handler: () => void): void;
  destroy(): void;
}

/** How long the give-up button stays in its "click again to confirm" state before reverting unconfirmed. */
const GIVE_UP_CONFIRM_TIMEOUT_MS = 3000;

/** mm:ss, floored at 0; "--:--" for null (untimed). Shared with resultPanel.ts's "time taken". */
export function formatTime(ms: number | null): string {
  if (ms === null) return '--:--';
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function createHud(): Hud {
  const el = document.createElement('div');
  el.className = 'hud';

  const score = document.createElement('div');
  score.className = 'hud-score';
  el.appendChild(score);

  const timer = document.createElement('div');
  timer.className = 'hud-timer';
  el.appendChild(timer);

  const pauseButton = document.createElement('button');
  pauseButton.type = 'button';
  pauseButton.className = 'hud-pause';
  el.appendChild(pauseButton);

  const giveUpButton = document.createElement('button');
  giveUpButton.type = 'button';
  giveUpButton.className = 'hud-give-up';
  giveUpButton.textContent = 'Give up';
  el.appendChild(giveUpButton);

  let pauseHandler: (() => void) | null = null;
  let giveUpHandler: (() => void) | null = null;
  let confirming = false;
  let confirmTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function resetGiveUpConfirm(): void {
    confirming = false;
    giveUpButton.classList.remove('confirming');
    giveUpButton.textContent = 'Give up';
    if (confirmTimeoutId !== null) {
      clearTimeout(confirmTimeoutId);
      confirmTimeoutId = null;
    }
  }

  function handlePauseClick(): void {
    pauseHandler?.();
  }

  function handleGiveUpClick(): void {
    if (!confirming) {
      confirming = true;
      giveUpButton.classList.add('confirming');
      giveUpButton.textContent = 'Click again to confirm';
      confirmTimeoutId = setTimeout(resetGiveUpConfirm, GIVE_UP_CONFIRM_TIMEOUT_MS);
      return;
    }
    resetGiveUpConfirm();
    giveUpHandler?.();
  }

  pauseButton.addEventListener('click', handlePauseClick);
  giveUpButton.addEventListener('click', handleGiveUpClick);

  return {
    el,
    setState(state) {
      score.textContent = `${state.solved} / ${state.total}`;
      timer.textContent = formatTime(state.remainingMs);
      pauseButton.textContent = state.isPaused ? 'Resume' : 'Pause';
      pauseButton.classList.toggle('paused', state.isPaused);
    },
    onPauseClick(handler) {
      pauseHandler = handler;
    },
    onGiveUpClick(handler) {
      giveUpHandler = handler;
    },
    destroy() {
      pauseButton.removeEventListener('click', handlePauseClick);
      giveUpButton.removeEventListener('click', handleGiveUpClick);
      if (confirmTimeoutId !== null) clearTimeout(confirmTimeoutId);
      el.remove();
    },
  };
}
