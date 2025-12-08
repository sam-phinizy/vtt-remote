import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync, existsSync } from 'fs';

// Copy static Foundry module assets after build
function copyFoundryAssets() {
  return {
    name: 'copy-foundry-assets',
    closeBundle() {
      const assets = ['module.json', 'languages', 'styles', 'templates'];
      for (const asset of assets) {
        if (existsSync(asset)) {
          cpSync(asset, `dist/${asset}`, { recursive: true });
        }
      }
    },
  };
}

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
  plugins: [copyFoundryAssets()],
});
