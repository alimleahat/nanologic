// Development: Vite dev server for the renderer, esbuild watch for main/preload,
// then start Electron pointed at the dev server.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ configFile: path.join(root, 'vite.config.ts') });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/';

const builder = spawn(process.execPath, [path.join(root, 'scripts/build-main.mjs')], { stdio: 'inherit' });
await new Promise((resolve, reject) => builder.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('build failed')))));

const electronPath = (await import('electron')).default;
const app = spawn(electronPath, [root], {
  stdio: 'inherit',
  env: { ...process.env, NANOLOGIC_DEV_URL: url },
});
app.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
