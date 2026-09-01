/**
 * Renders a pack as inline SVG and reports pointer events upward. Rendering
 * only: no import from engine/modes/, no correctness decisions, no game
 * state of its own beyond the last snapshot it was handed to paint.
 *
 * Every visual change — answer state, phase, group fill — is a CSS class
 * swap on the target's <path>; this module never sets a `fill`/`stroke`
 * attribute directly. See src/styles/app.css for what each class paints,
 * and theme.ts for the token names behind those classes.
 *
 * Labels are delegated to labels.ts's createLabelLayer: applyState hands it
 * the same session's targetStates on every call, plus each target's own
 * polygon (for the containment constraint — see labels.ts) and the
 * viewBox-derived font size, and the layer's own suppressed-list return is
 * threaded back out of applyState.
 */
import type { Pack, Session, Target, TargetState } from '../engine/types';
import { createLabelLayer, fontSizeForViewBox } from './labels';
import { regionFillToken, type Phase, type VisualState } from './theme';

export interface MapSurface {
  el: SVGSVGElement;
  /**
   * Reconciles every target's <path> and the label layer against a session
   * snapshot. Idempotent. Returns ids of targets whose label couldn't be
   * placed this pass, so the caller can surface them on hover.
   */
  applyState(session: Session): Array<Target['id']>;
  /** Switches the base region-fill saturation (see theme.ts Phase). */
  setPhase(phase: Phase): void;
  /** Registers the handler fired with a target id on click, Mode B only. */
  onRegionClick(handler: (targetId: Target['id']) => void): void;
  destroy(): void;
}

interface BoundPath {
  el: SVGPathElement;
  /** Group fill class for full saturation (e.g. "region-primary"). */
  fullFillClass: string;
  /** Group fill class for the muted/play variant (e.g. "region-primary-muted"). */
  mutedFillClass: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Extracts pathId -> `d` from a pack's raw geometry.svg markup. */
function extractPathData(geometrySvg: string): Map<string, string> {
  const doc = new DOMParser().parseFromString(geometrySvg, 'image/svg+xml');
  const byId = new Map<string, string>();
  for (const path of doc.querySelectorAll('path[id]')) {
    const id = path.getAttribute('id');
    const d = path.getAttribute('d');
    if (id && d) byId.set(id, d);
  }
  return byId;
}

/** Mounts `pack` as inline SVG into `container`, one <path> per target, bound by target id. */
export function createMapSurface(
  container: HTMLElement,
  pack: Pack,
  geometrySvg: string,
): MapSurface {
  const pathData = extractPathData(geometrySvg);
  const groupById = new Map(pack.groups.map((g) => [g.id, g]));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', pack.viewBox.join(' '));
  svg.classList.add('map-surface');

  const bound = new Map<Target['id'], BoundPath>();
  // Same `d` strings the paths above are drawn from, keyed by target id
  // instead of pathId — labels.ts's containment constraint needs each
  // target's own polygon to keep its label off a neighbour's territory.
  const labelPolygons = new Map<Target['id'], string>();
  for (const target of pack.targets) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('id', target.id);
    const d = pathData.get(target.pathId);
    if (d) {
      path.setAttribute('d', d);
      labelPolygons.set(target.id, d);
    }
    svg.appendChild(path);

    const group = groupById.get(target.groupId);
    const fillToken = group?.fillToken ?? '';
    bound.set(target.id, {
      el: path,
      fullFillClass: regionFillToken(fillToken, 'preview'),
      mutedFillClass: regionFillToken(fillToken, 'play'),
    });
  }

  const labelLayer = createLabelLayer();
  const labelFontSize = fontSizeForViewBox(pack.viewBox[3]);
  svg.appendChild(labelLayer.el);

  container.replaceChildren(svg);

  let phase: Phase = 'preview';
  let lastSession: Session | null = null;
  let lastSuppressed: Array<Target['id']> = [];
  let clickHandler: ((targetId: Target['id']) => void) | null = null;

  function render(): void {
    const interactive = lastSession?.mode === 'pin-and-name';
    svg.classList.toggle('interactive', interactive);

    for (const [id, b] of bound) {
      const state: VisualState =
        lastSession?.armedTargetId === id
          ? 'armed'
          : (lastSession?.targetStates.get(id) ?? 'unsolved');

      const classes = ['target', state];
      // Solved/retry/missed paint from their own state token; only
      // unsolved/armed still show the group's region fill underneath.
      if (state === 'unsolved' || state === 'armed') {
        classes.push(phase === 'play' ? b.mutedFillClass : b.fullFillClass);
      }
      b.el.setAttribute('class', classes.join(' '));
    }

    const targetStates = lastSession?.targetStates ?? new Map<Target['id'], TargetState>();
    lastSuppressed = labelLayer.applyLayout(pack.targets, targetStates, {
      fontSize: labelFontSize,
      polygons: labelPolygons,
    }).suppressed;
  }

  function onClick(event: Event): void {
    if (lastSession?.mode !== 'pin-and-name' || !clickHandler) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const path = target.closest('path.target');
    const id = path?.getAttribute('id');
    if (id) clickHandler(id);
  }
  svg.addEventListener('click', onClick);

  render();

  return {
    el: svg,
    applyState(session) {
      lastSession = session;
      render();
      return lastSuppressed;
    },
    setPhase(next) {
      phase = next;
      render();
    },
    onRegionClick(handler) {
      clickHandler = handler;
    },
    destroy() {
      svg.removeEventListener('click', onClick);
      labelLayer.destroy();
      svg.remove();
    },
  };
}
