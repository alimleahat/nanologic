// Regenerates examples/traffic-light-export/ and examples/basys3-starter-export/ (cross-platform way to set the env var).
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['vitest', 'run', 'tests/unit/examples.test.ts', 'tests/unit/vivado-export.test.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, UPDATE_EXAMPLES: '1' },
});
process.exit(r.status ?? 1);
