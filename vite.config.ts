import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Content Security Policy for the packaged app (the dev server needs inline scripts).
const csp: Plugin = {
  name: 'nanologic-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content:
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; worker-src 'self' blob:; connect-src 'self'",
      },
      injectTo: 'head-prepend',
    },
  ],
};

// Renderer build. The Electron main and preload scripts are bundled separately
// by scripts/build-main.mjs.
export default defineConfig({
  root: path.resolve(__dirname, 'app/renderer'),
  base: './',
  plugins: [react(), csp],
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
