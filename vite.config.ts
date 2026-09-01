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
    // The app itself is still a TODO stub (see src/main.ts); open the dev
    // render harness instead so `npm run dev` shows something real.
    open: '/dev/harness.html',
  },
});
