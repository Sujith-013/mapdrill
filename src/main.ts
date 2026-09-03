/**
 * Entry point. Boots the app into #app.
 *
 * The south-india-districts pack is the only pack today, so it's loaded
 * the same way dev/harness.ts loads its fixture: a static Vite import,
 * bundled at build time. `engine/pack-loader.ts`'s fetch-and-validate
 * `loadPack` is for choosing among *multiple* packs served at runtime — a
 * pack-picker screen that doesn't exist yet — so wiring through it here
 * would be exercising a path nothing else uses instead of the one that
 * already works.
 */
import geometrySvg from '../packs/south-india-districts/geometry.svg?raw';
import southIndiaPackJson from '../packs/south-india-districts/pack.json';
import { mountApp } from './app';
import type { Pack } from './engine/types';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing from index.html');

mountApp({
  root,
  pack: southIndiaPackJson as unknown as Pack,
  geometrySvg,
  mode: 'free-recall',
});
