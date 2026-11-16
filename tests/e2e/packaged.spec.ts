// Runs against an unpacked build (NANOLOGIC_PACKAGED=<path to executable>) to
// check that the toolchain and workers load from the installed layout.
import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { screenshot } from './app';

const exe = process.env.NANOLOGIC_PACKAGED;

test.skip(!exe, 'set NANOLOGIC_PACKAGED to the packaged executable');

test('packaged app opens the reference project, analyses, simulates and runs the board', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nanologic-pkg-'));
  const app = await electron.launch({
    executablePath: exe!,
    args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    env: {
      ...process.env,
      NANOLOGIC_E2E: '1',
      NANOLOGIC_USER_DATA: path.join(tmp, 'user-data'),
      NANOLOGIC_PROJECTS_DIR: path.join(tmp, 'projects'),
    } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.getByTestId('example-traffic-light').click();
  await expect(page.getByTestId('task-analysis')).toHaveAttribute('data-status', 'passed', { timeout: 120_000 });
  await page.getByTestId('tb-simulate').click();
  await page.getByTestId('simulate-run').click();
  await expect(page.getByTestId('task-simulation')).toHaveAttribute('data-status', 'passed', { timeout: 120_000 });
  await page.getByTestId('tb-board').click();
  await expect(page.getByTestId('task-board')).toHaveAttribute('data-status', 'passed', { timeout: 120_000 });
  await expect(page.getByTestId('board-LEDR0')).toHaveAttribute('data-lit', '1');
  await screenshot(page, 'packaged-board');
  await app.close();
});
