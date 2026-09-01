// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createCompassRose } from '../src/render/compass';
import type { ViewBox } from '../src/engine/types';

const viewBox: ViewBox = [0, 0, 800, 1000];

describe('createCompassRose', () => {
  it('draws a star, a hub, and all four tick labels', () => {
    const g = createCompassRose(viewBox);
    expect(g.querySelectorAll('path').length).toBe(1);
    expect(g.querySelectorAll('circle').length).toBe(1);
    const labels = [...g.querySelectorAll('text')].map((t) => t.textContent).sort();
    expect(labels).toEqual(['E', 'N', 'S', 'W']);
  });

  it('colours everything from --compass-color, never a hardcoded hex', () => {
    const g = createCompassRose(viewBox);
    for (const el of g.querySelectorAll('path, circle, text')) {
      const paint =
        el.getAttribute('fill') === 'none' ? el.getAttribute('stroke') : el.getAttribute('fill');
      expect(paint).toBe('var(--compass-color)');
    }
  });

  it('sits in the bottom-right quadrant of the viewBox', () => {
    const [vx, vy, vw, vh] = viewBox;
    const g = createCompassRose(viewBox);
    const hub = g.querySelector('circle')!;
    const cx = Number(hub.getAttribute('cx'));
    const cy = Number(hub.getAttribute('cy'));
    expect(cx).toBeGreaterThan(vx + vw / 2);
    expect(cy).toBeGreaterThan(vy + vh / 2);
  });
});
