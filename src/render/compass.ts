/**
 * The small compass rose from the reference art: a four-point star with
 * N/E/S/W ticks, meant for the map plate's bottom-right corner. Pure SVG —
 * no raster, no dependencies — coloured entirely from --compass-color via
 * theme.ts.
 */
import type { ViewBox } from '../engine/types';
import { cssVar, TOKEN } from './theme';

export interface CompassOptions {
  /** Outer radius of the star, in viewBox units. */
  size?: number;
  /** Gap from the viewBox's right/bottom edges, in viewBox units. */
  margin?: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_SIZE = 28;
const DEFAULT_MARGIN = 24;
const TICKS: ReadonlyArray<readonly [angleDeg: number, label: string]> = [
  [0, 'N'],
  [90, 'E'],
  [180, 'S'],
  [270, 'W'],
];

/** 8-point star (outer points at N/E/S/W, inner points at the diagonals), centred on (cx, cy). */
function starPath(cx: number, cy: number, outerR: number, innerR: number): string {
  const points: string[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i - Math.PI / 2; // start due north, clockwise
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${points.join(' ')} Z`;
}

/** Builds the compass rose, positioned bottom-right of `viewBox`. Append the returned <g> into the map's <svg>. */
export function createCompassRose(viewBox: ViewBox, options: CompassOptions = {}): SVGGElement {
  const [vx, vy, vw, vh] = viewBox;
  const size = options.size ?? DEFAULT_SIZE;
  const margin = options.margin ?? DEFAULT_MARGIN;
  const cx = vx + vw - margin - size;
  const cy = vy + vh - margin - size;
  const color = cssVar(TOKEN.compassColor);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'compass-rose');

  const star = document.createElementNS(SVG_NS, 'path');
  star.setAttribute('d', starPath(cx, cy, size, size * 0.4));
  star.setAttribute('fill', 'none');
  star.setAttribute('stroke', color);
  star.setAttribute('stroke-width', '1');
  g.appendChild(star);

  const hub = document.createElementNS(SVG_NS, 'circle');
  hub.setAttribute('cx', String(cx));
  hub.setAttribute('cy', String(cy));
  hub.setAttribute('r', '1.5');
  hub.setAttribute('fill', color);
  g.appendChild(hub);

  for (const [angleDeg, label] of TICKS) {
    const angle = (angleDeg * Math.PI) / 180 - Math.PI / 2;
    const tx = cx + (size + 7) * Math.cos(angle);
    const ty = cy + (size + 7) * Math.sin(angle);
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', tx.toFixed(2));
    text.setAttribute('y', ty.toFixed(2));
    text.setAttribute('fill', color);
    text.setAttribute('font-size', '8');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = label;
    g.appendChild(text);
  }

  return g;
}
