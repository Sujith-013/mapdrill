import { defineConfig } from 'vite';

// Static build only: no server, no SSR. Output is a plain dist/ folder
// deployable to any static host (GitHub Pages, etc).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
