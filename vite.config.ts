import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Renderer build. The Electron main and preload scripts are bundled separately
// by scripts/build-main.mjs.
export default defineConfig({
  root: path.resolve(__dirname, 'app/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'app/shared'),
      '@boards': path.resolve(__dirname, 'boards'),
      '@templates': path.resolve(__dirname, 'templates'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
  },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
});
