import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Source lives in src/. The build inlines everything into a single
// index.html at the repo root — exactly what GitHub Pages serves.
export default defineConfig({
  root: 'src',
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: '..',
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 5000,
  },
});
