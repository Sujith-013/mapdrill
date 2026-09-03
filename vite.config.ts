import { defineConfig } from 'vite';

// Static build only: no server, no SSR. Output is a plain dist/ folder
// deployable to any static host (GitHub Pages, etc).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
    // Default entry is index.html only — dev/ (the render harness) is
    // never referenced from it, so it can't end up in the shipped bundle.
  },
  server: {
    // src/main.ts boots the real app now — open it by default. The dev
    // render harness (dev/harness.html) is still there for eyeballing
    // renderer-only changes; open it explicitly when that's what you want.
    open: '/index.html',
  },
});
