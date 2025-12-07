import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['es'],
      fileName: () => 'scripts/main.js',
    },
    rollupOptions: {
      output: {
        // Foundry expects a single bundle, no code splitting
        manualChunks: undefined,
      },
    },
  },
  // Copy static assets to dist
  publicDir: false,
});
