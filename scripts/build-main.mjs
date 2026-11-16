// Bundles the Electron main process, preload script and worker threads with esbuild.
// The renderer is built separately by Vite (see vite.config.ts).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  // Toolchain packages are ESM with WebAssembly files next to them: load them
  // from node_modules at run time instead of bundling.
  external: ['electron', '@yowasp/yosys', '@veriflow/iverilog-wasm'],
  outExtension: { '.js': '.cjs' },
  logLevel: 'info',
  loader: { '.json': 'json' },
};

const entries = [
  { in: 'app/main/index.ts', out: 'main/index' },
  { in: 'app/main/workers/toolWorker.ts', out: 'main/toolWorker' },
  { in: 'app/main/workers/boardWorker.ts', out: 'main/boardWorker' },
  { in: 'app/preload/index.ts', out: 'preload/index' },
];

for (const e of entries) {
  const opts = {
    ...common,
    entryPoints: { [e.out]: path.join(root, e.in) },
    outdir: path.join(root, 'out'),
  };
  if (watch) {
    const { context } = await import('esbuild');
    const ctx = await context(opts);
    await ctx.watch();
  } else {
    await build(opts);
  }
}
