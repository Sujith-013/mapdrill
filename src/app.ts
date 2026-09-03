/**
 * App shell. Wires a loaded pack + geometry into a session, the map
 * surface, and the answer box / HUD — the first assembly a player can
 * actually open and drill against. Pack *loading* happens in main.ts
 * (a static import, same as dev/harness.ts's fixture — see main.ts); this
 * module takes an already-parsed Pack and its raw geometry.svg text.
 */
import { score } from './engine/scoring';
import { SessionController } from './engine/session';
import type { Mode, Pack, Session } from './engine/types';
import { createCompassRose } from './render/compass';
import { createMapSurface, type MapSurface } from './render/mapSurface';
import { createAnswerBox } from './ui/answerBox';
import { createHud } from './ui/hud';

export interface AppOptions {
  root: HTMLElement;
  pack: Pack;
  /** Raw contents of the pack's geometry.svg — see createMapSurface. */
  geometrySvg: string;
  mode: Mode;
}

export interface AppHandle {
  /** Live snapshot of the current session (a fresh SessionController after "Play again"). */
  readonly session: Session;
  destroy(): void;
}

/** How often the running timer is polled to refresh the HUD's mm:ss — see SessionController.tick. */
const TICK_INTERVAL_MS = 250;

const ENDED_STATUSES = new Set<Session['status']>(['complete', 'surrendered', 'timeout']);

/** Mounts the app into `options.root` and returns a handle for teardown. */
export function mountApp(options: AppOptions): AppHandle {
  const { root, pack, geometrySvg, mode } = options;
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'app-layout';
  root.appendChild(layout);

  const hud = createHud();
  layout.appendChild(hud.el);

  const mapHost = document.createElement('div');
  mapHost.className = 'app-map';
  mapHost.style.aspectRatio = `${pack.viewBox[2]} / ${pack.viewBox[3]}`;
  layout.appendChild(mapHost);

  const answerBox = createAnswerBox();
  layout.appendChild(answerBox.el);

  // Start is an explicit button, not auto-start: the reference art's whole
  // point is reading the map at full saturation as a picture first (see
  // docs/DESIGN-SYSTEM.md "start screen ... full reference-art
  // saturation") — auto-starting would burn budgeted time on that beat and
  // never let the player actually see it before the muted/play fills kick in.
  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'app-start';
  startButton.textContent = 'Start';
  layout.appendChild(startButton);

  const endBanner = document.createElement('div');
  endBanner.className = 'app-end-banner';
  endBanner.hidden = true;
  const endMessage = document.createElement('span');
  endBanner.appendChild(endMessage);
  const playAgainButton = document.createElement('button');
  playAgainButton.type = 'button';
  playAgainButton.textContent = 'Play again';
  endBanner.appendChild(playAgainButton);
  layout.appendChild(endBanner);

  let surface: MapSurface = mountSurface();
  let controller = new SessionController(pack, mode);
  let unsubscribe = wireController(controller);
  let isPaused = false;

  function mountSurface(): MapSurface {
    const s = createMapSurface(mapHost, pack, geometrySvg);
    s.el.appendChild(createCompassRose(pack.viewBox));
    s.setPhase('preview');
    return s;
  }

  function renderHud(): void {
    const session = controller.session;
    const breakdown = score(session);
    hud.setState({
      solved: breakdown.solved,
      total: breakdown.total,
      remainingMs:
        session.budgetMs === null ? null : Math.max(0, session.budgetMs - session.elapsedMs),
      isPaused,
    });
  }

  function wireController(c: SessionController): () => void {
    return c.subscribe((session) => {
      surface.applyState(session);
      renderHud();

      const ended = ENDED_STATUSES.has(session.status);
      answerBox.setDisabled(ended);
      if (ended) {
        surface.setPhase('results');
        const breakdown = score(session);
        endMessage.textContent = `${describeEnd(session.status)} — ${breakdown.solved} / ${breakdown.total}`;
        endBanner.hidden = false;
      }
    });
  }

  answerBox.onInput((value) => {
    const before = score(controller.session).solved;
    controller.submitAnswer(value);
    const after = score(controller.session).solved;
    // A miss doesn't notify (see SessionController.submitFreeRecall), so
    // renderHud/applyState above won't have run for it — nothing to undo.
    if (after > before) answerBox.clear();
  });

  hud.onPauseClick(() => {
    if (controller.session.status !== 'running') return;
    if (isPaused) {
      controller.resume();
      isPaused = false;
    } else {
      controller.pause();
      isPaused = true;
    }
    renderHud();
  });

  hud.onGiveUpClick(() => {
    controller.giveUp();
  });

  startButton.addEventListener('click', () => {
    controller.start();
    startButton.hidden = true;
  });

  playAgainButton.addEventListener('click', () => {
    unsubscribe();
    controller = new SessionController(pack, mode);
    unsubscribe = wireController(controller);
    isPaused = false;
    endBanner.hidden = true;
    startButton.hidden = false;
    answerBox.setDisabled(false);
    answerBox.clear();
    surface.destroy();
    surface = mountSurface();
    renderHud();
  });

  const intervalId = setInterval(() => controller.tick(), TICK_INTERVAL_MS);

  renderHud();

  return {
    get session() {
      return controller.session;
    },
    destroy() {
      clearInterval(intervalId);
      unsubscribe();
      answerBox.destroy();
      hud.destroy();
      surface.destroy();
      layout.remove();
    },
  };
}

function describeEnd(status: Session['status']): string {
  switch (status) {
    case 'complete':
      return 'Solved!';
    case 'surrendered':
      return 'Gave up';
    case 'timeout':
      return "Time's up";
    default:
      return '';
  }
}
