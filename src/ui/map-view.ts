/**
 * Renders a pack as inline SVG: one <path> per target, bound by pathId, with
 * fills driven by group.fillToken and per-target answer state. Emits click
 * events for Pin & Name and exposes a method to reveal a target's label.
 */
import type { Pack, Target, TargetState } from '../engine/types';

export interface MapView {
  el: SVGSVGElement;
  setTargetState(targetId: Target['id'], state: TargetState): void;
  revealLabel(targetId: Target['id']): void;
  onTargetClick(handler: (targetId: Target['id']) => void): void;
  destroy(): void;
}

export function createMapView(_pack: Pack): MapView {
  throw new Error('TODO');
}
